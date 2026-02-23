"""
Doctor API Endpoints for CarePulse
Handles high-risk alert management, risk assessment, and clinical interventions
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func

from app.api.auth import get_current_user, require_role
from app.agent.intents import INTENTS
from app.db.models import (
    User,
    Patient,
    CallLog,
    ReadmissionRisk,
    AgentResponse,
    AlertAction,
    NurseCallAssignment,
    Notification,
    ResponseCorrection,
    AuditEvent,
)
from app.agent.protocols import get_protocol_intents
from app.db.session import SessionLocal

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================================

class ConfirmAlertRequest(BaseModel):
    call_log_id: int
    patient_id: int
    doctor_note: Optional[str] = None


class ClearAlertRequest(BaseModel):
    call_log_id: int
    patient_id: int
    reason: str = Field(..., min_length=5)


class OverrideRiskRequest(BaseModel):
    call_log_id: int
    patient_id: int
    override_score: float = Field(..., ge=0.0, le=1.0)
    justification: str = Field(..., min_length=10)


class AssignNurseCallRequest(BaseModel):
    patient_id: int
    call_log_id: Optional[int] = None
    assigned_to_nurse_id: Optional[int] = None  # null = any available nurse
    priority: str = Field(default="medium")
    note: str = Field(..., min_length=5)

    @validator('priority')
    def validate_priority(cls, v):
        if v not in ['low', 'medium', 'high', 'urgent']:
            raise ValueError('Priority must be one of: low, medium, high, urgent')
        return v


class HighAlertResponse(BaseModel):
    patient_id: int
    patient_name: str
    age: Optional[int]
    disease_track: str
    protocol: str
    call_log_id: int
    risk_score: float
    risk_level: str
    call_time: datetime
    explanation_preview: Optional[dict]
    has_nurse_correction: bool
    previous_actions: List[dict]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _strip_date_tag(note: Optional[str]) -> str:
    """Remove [for YYYY-MM-DD] prefix from notes"""
    text = (note or "").strip()
    if text.startswith("[for ") and "] " in text:
        return text.split("] ", 1)[1].strip()
    return text


def _get_risk_level(score: Optional[float]) -> str:
    """Convert risk score to level category"""
    if score is None:
        return "unknown"
    if score >= 0.7:
        return "high"
    elif score >= 0.4:
        return "medium"
    else:
        return "low"


def _create_notification(
    db: Session,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    patient_id: Optional[int] = None,
    assignment_id: Optional[int] = None
):
    """Create a notification for a user"""
    notif = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        related_patient_id=patient_id,
        related_assignment_id=assignment_id,
        read=False
    )
    db.add(notif)
    db.commit()
    return notif


def _log_audit(db: Session, user_id: int, action: str, meta: dict):
    """Log audit event"""
    audit = AuditEvent(user_id=user_id, action=action, meta=meta)
    db.add(audit)
    db.commit()


def _ensure_dict(val: Any) -> Optional[dict]:
    """Robustly convert potentially doubly-encoded JSON strings to dict"""
    if not val:
        return None
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, str):
                # Handle double encoding
                parsed = json.loads(parsed)
            if isinstance(parsed, dict):
                return parsed
        except:
            pass
    return None


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/doctor/high-alerts", response_model=List[HighAlertResponse])
def get_high_alerts(
    include_actioned: bool = Query(default=False),
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["doctor", "admin"]))
):
    """
    Get patients with high risk scores (>= 0.7) from recent calls.
    By default, excludes already-actioned alerts.
    """
    # Use today's calendar date instead of a sliding window
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    
    # Subquery to get latest call per patient today
    latest_call_sub = (
        db.query(
            CallLog.patient_id,
            func.max(CallLog.created_at).label("latest_time")
        )
        .filter(CallLog.created_at >= today_start)
        .group_by(CallLog.patient_id)
        .subquery()
    )

    # Base query: high-risk calls that are the latest for that patient today
    query = (
        db.query(CallLog, Patient)
        .join(Patient, CallLog.patient_id == Patient.id)
        .join(
            latest_call_sub,
            and_(
                CallLog.patient_id == latest_call_sub.c.patient_id,
                CallLog.created_at == latest_call_sub.c.latest_time
            )
        )
        .filter(
            CallLog.risk_score >= 0.7,
            Patient.active == True
        )
    )
    
    # Optionally filter out already-actioned alerts
    if not include_actioned:
        # Only exclude if the action was also today for this specific call
        actioned_call_ids = db.query(AlertAction.call_log_id).filter(
            AlertAction.created_at >= today_start
        ).distinct()
        query = query.filter(CallLog.id.notin_(actioned_call_ids))
    
    # Sort by risk score DESC
    query = query.order_by(desc(CallLog.risk_score), desc(CallLog.created_at))
    
    results = []
    for call_log, patient in query.all():
        # Get explanation preview
        risk_record = db.query(ReadmissionRisk).filter(
            ReadmissionRisk.call_log_id == call_log.id
        ).first()
        
        # Ensure we unique by patient_id in response if subquery somehow fails to be strict
        # (Safer for some SQL dialects)
        explanation_preview = None
        if risk_record and risk_record.explanation:
            explanation_preview = _ensure_dict(risk_record.explanation)
        
        # Get nurse correction status
        has_correction = db.query(ResponseCorrection).filter(
            ResponseCorrection.call_log_id == call_log.id
        ).first() is not None

        # Get previous actions
        actions = db.query(AlertAction).filter(
            AlertAction.patient_id == patient.id
        ).order_by(AlertAction.created_at.desc()).all()

        results.append(HighAlertResponse(
            patient_id=patient.id,
            patient_name=patient.name,
            age=patient.age,
            disease_track=patient.disease_track,
            protocol=patient.protocol,
            call_log_id=call_log.id,
            risk_score=call_log.risk_score,
            risk_level=call_log.risk_level or _get_risk_level(call_log.risk_score),
            call_time=call_log.created_at,
            explanation_preview=explanation_preview,
            has_nurse_correction=has_correction,
            previous_actions=[{
                "action": a.action,
                "created_at": a.created_at,
                "doctor_note": _strip_date_tag(a.doctor_note)
            } for a in actions]
        ))
    
    # Final deduplication in memory to be absolutely certain
    final_unique = {}
    for r in results:
        if r.patient_id not in final_unique:
            final_unique[r.patient_id] = r
    
    return list(final_unique.values())


@router.get("/doctor/stream-high-alerts")
def stream_high_alerts(
    token: str = Query(default=""),
    db: Session = Depends(get_db)
):
    """
    SSE endpoint for real-time high alert notifications.
    Streams new high-risk calls as they are created.
    """
    import asyncio
    import json
    from datetime import datetime
    
    async def event_generator():
        last_check = datetime.now(timezone.utc)
        
        while True:
            # Check for new high alerts since last check
            new_alerts = (
                db.query(CallLog, Patient)
                .join(Patient, CallLog.patient_id == Patient.id)
                .filter(
                    CallLog.risk_score >= 0.7,
                    CallLog.created_at > last_check,
                    Patient.active == True
                )
                .order_by(desc(CallLog.risk_score))
                .all()
            )
            
            for call_log, patient in new_alerts:
                event_data = {
                    "patient_id": patient.id,
                    "patient_name": patient.name,
                    "call_log_id": call_log.id,
                    "risk_score": call_log.risk_score,
                    "risk_level": call_log.risk_level,
                    "call_time": call_log.created_at.isoformat()
                }
                yield f"data: {json.dumps(event_data)}\n\n"
            
            last_check = datetime.now(timezone.utc)
            
            # Send heartbeat
            yield f": heartbeat\n\n"
            await asyncio.sleep(10)
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/doctor/confirm-alert")
def confirm_alert(
    payload: ConfirmAlertRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["doctor", "admin"]))
):
    """Confirm a risk alert - indicates doctor reviewed and agrees with AI assessment"""
    # Validate call log exists and belongs to patient
    call_log = db.query(CallLog).filter(
        CallLog.id == payload.call_log_id,
        CallLog.patient_id == payload.patient_id
    ).first()
    
    if not call_log:
        raise HTTPException(status_code=404, detail="Call log not found")
    
    if call_log.risk_score is None:
        raise HTTPException(status_code=400, detail="Call log has no risk score")
    
    # Create alert action record
    action = AlertAction(
        call_log_id=payload.call_log_id,
        patient_id=payload.patient_id,
        risk_score=call_log.risk_score,
        action="confirmed",
        doctor_note=payload.doctor_note,
        doctor_id=user.id,
        intervention_required=True  # Confirmed high alerts require intervention
    )
    db.add(action)
    
    # Update call log doctor note if provided
    if payload.doctor_note:
        call_log.doctor_note = payload.doctor_note
    
    # Log audit
    _log_audit(db, user.id, "alert_confirmed", {
        "call_log_id": payload.call_log_id,
        "patient_id": payload.patient_id,
        "risk_score": call_log.risk_score
    })
    
    db.commit()
    
    return {
        "success": True,
        "action_id": action.id,
        "message": "Alert confirmed successfully"
    }


@router.post("/doctor/clear-alert")
def clear_alert(
    payload: ClearAlertRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["doctor", "admin"]))
):
    """Clear a false positive alert"""
    call_log = db.query(CallLog).filter(
        CallLog.id == payload.call_log_id,
        CallLog.patient_id == payload.patient_id
    ).first()
    
    if not call_log:
        raise HTTPException(status_code=404, detail="Call log not found")
    
    # Create alert action
    action = AlertAction(
        call_log_id=payload.call_log_id,
        patient_id=payload.patient_id,
        risk_score=call_log.risk_score or 0.0,
        action="cleared",
        doctor_note=payload.reason,
        doctor_id=user.id,
        intervention_required=False
    )
    db.add(action)
    
    # Update call log
    call_log.doctor_note = f"[CLEARED] {payload.reason}"
    
    # Log audit
    _log_audit(db, user.id, "alert_cleared", {
        "call_log_id": payload.call_log_id,
        "patient_id": payload.patient_id,
        "reason": payload.reason
    })
    
    db.commit()
    
    return {
        "success": True,
        "action_id": action.id,
        "message": "Alert cleared as false positive"
    }


@router.post("/doctor/override-risk")
def override_risk_score(
    payload: OverrideRiskRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["doctor", "admin"]))
):
    """Override AI risk score with clinical judgment"""
    call_log = db.query(CallLog).filter(
        CallLog.id == payload.call_log_id,
        CallLog.patient_id == payload.patient_id
    ).first()
    
    if not call_log:
        raise HTTPException(status_code=404, detail="Call log not found")
    
    original_score = call_log.risk_score
    
    # Create alert action
    action = AlertAction(
        call_log_id=payload.call_log_id,
        patient_id=payload.patient_id,
        risk_score=original_score or 0.0,
        action="overridden",
        override_score=payload.override_score,
        doctor_note=payload.justification,
        doctor_id=user.id,
        intervention_required=(payload.override_score >= 0.7)
    )
    db.add(action)
    
    # Update call log risk score
    call_log.risk_score = payload.override_score
    call_log.risk_level = _get_risk_level(payload.override_score)
    
    # Log critical audit event for model override
    _log_audit(db, user.id, "risk_score_override", {
        "call_log_id": payload.call_log_id,
        "patient_id": payload.patient_id,
        "original_score": original_score,
        "override_score": payload.override_score,
        "justification": payload.justification
    })
    
    db.commit()
    
    return {
        "success": True,
        "action_id": action.id,
        "original_score": original_score,
        "new_score": payload.override_score,
        "new_risk_level": call_log.risk_level,
        "message": "Risk score overridden successfully"
    }


@router.post("/doctor/assign-nurse-call")
def assign_nurse_call(
    payload: AssignNurseCallRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["doctor", "admin"]))
):
    """Assign a nurse to follow up with patient"""
    # Validate patient exists
    patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Validate nurse if specified
    if payload.assigned_to_nurse_id:
        nurse = db.query(User).filter(
            User.id == payload.assigned_to_nurse_id,
            User.role == "nurse",
            User.active == True
        ).first()
        if not nurse:
            raise HTTPException(status_code=400, detail="Invalid nurse ID or nurse not active")
    
    # Create assignment
    assignment = NurseCallAssignment(
        patient_id=payload.patient_id,
        call_log_id=payload.call_log_id,
        assigned_by_doctor_id=user.id,
        assigned_to_nurse_id=payload.assigned_to_nurse_id,
        status="pending",
        priority=payload.priority,
        note=payload.note
    )
    db.add(assignment)
    db.flush()  # Get assignment ID
    
    # Create notification for assigned nurse (or all nurses if unassigned)
    if payload.assigned_to_nurse_id:
        _create_notification(
            db,
            user_id=payload.assigned_to_nurse_id,
            notification_type="nurse_call_assignment",
            title=f"New {payload.priority.upper()} priority assignment",
            message=f"Dr. {user.name} assigned you to follow up with {patient.name}",
            patient_id=payload.patient_id,
            assignment_id=assignment.id
        )
    else:
        # Notify all active nurses
        all_nurses = db.query(User).filter(
            User.role == "nurse",
            User.active == True
        ).all()
        for nurse in all_nurses:
            _create_notification(
                db,
                user_id=nurse.id,
                notification_type="nurse_call_assignment",
                title=f"New {payload.priority.upper()} priority assignment (unassigned)",
                message=f"Dr. {user.name} needs a nurse to follow up with {patient.name}",
                patient_id=payload.patient_id,
                assignment_id=assignment.id
            )
    
    # Log audit
    _log_audit(db, user.id, "nurse_call_assigned", {
        "assignment_id": assignment.id,
        "patient_id": payload.patient_id,
        "assigned_to": payload.assigned_to_nurse_id,
        "priority": payload.priority
    })
    
    db.commit()
    
    return {
        "success": True,
        "assignment_id": assignment.id,
        "message": "Nurse call assignment created successfully"
    }


@router.get("/doctor/patient-details/{patient_id}")
def get_patient_details(
    patient_id: int,
    date_filter: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["doctor", "admin"]))
):
    """
    Get patient enrollment data + today's (or specified date) IVR response + explainability.
    Only returns today's data to focus doctor on current risk assessment.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Use today if no date specified
    target_date = date_filter or date.today()
    
    # Get call logs for target date
    start_of_day = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(target_date, datetime.max.time()).replace(tzinfo=timezone.utc)
    
    # Get latest call log for target date
    call_log = (
        db.query(CallLog)
        .filter(
            CallLog.patient_id == patient_id,
            CallLog.created_at >= start_of_day,
            CallLog.created_at <= end_of_day
        )
        .order_by(desc(CallLog.created_at))
        .first()
    )
    
    # Get protocol intents for this patient
    protocol_intents = get_protocol_intents(patient.protocol)
    
    # Get IVR responses for the LATEST call only
    ivr_responses = []
    if call_log:
        responses_list = db.query(AgentResponse).filter(
            AgentResponse.call_id == call_log.patient_call_id
        ).all()
        
        # Create a map of intent_id -> response for easy lookup
        response_map = {r.intent_id: r for r in responses_list}
        
        for intent_id in protocol_intents:
            # Skip non-clinical intro/outro intents for the dashboard
            if intent_id in ["INTENT_0_DAILY_CHECKIN", "INTENT_29_SAFETY_CLOSE"]:
                continue
                
            resp = response_map.get(intent_id)
            
            # Get question text from INTENTS
            intent_meta = INTENTS.get(intent_id, {})
            phrases = intent_meta.get("allowed_phrases", [])
            question_text = phrases[0] if phrases else intent_id

            if resp:
                # Check for correction
                correction = db.query(ResponseCorrection).filter(
                    ResponseCorrection.agent_response_id == resp.id
                ).first()
                
                ivr_responses.append({
                    "intent_id": resp.intent_id,
                    "question": question_text,
                    "original_text": resp.raw_text,
                    "corrected_text": correction.corrected_text if correction else None,
                    "has_correction": correction is not None,
                    "red_flag": resp.red_flag,
                    "confidence": resp.confidence
                })
            else:
                # Add placeholder for unanswered protocol questions
                ivr_responses.append({
                    "intent_id": intent_id,
                    "question": question_text,
                    "original_text": None,
                    "corrected_text": None,
                    "has_correction": False,
                    "red_flag": False,
                    "confidence": 0
                })
    
    # Get explainability for this call
    explainability = None
    if call_log:
        latest_call = call_log
        risk_record = db.query(ReadmissionRisk).filter(
            ReadmissionRisk.call_log_id == latest_call.id
        ).first()
        if risk_record:
            explainability = _ensure_dict(risk_record.explanation)
    
    # Get previous alert actions
    previous_actions = (
        db.query(AlertAction)
        .filter(AlertAction.patient_id == patient_id)
        .order_by(desc(AlertAction.created_at))
        .limit(10)
        .all()
    )
    
    actions_list = [
        {
            "action": a.action,
            "risk_score": a.risk_score,
            "override_score": a.override_score,
            "doctor_note": _strip_date_tag(a.doctor_note),
            "created_at": a.created_at.isoformat()
        }
        for a in previous_actions
    ]
    
    # Get all calls for this patient on the target date
    day_calls = (
        db.query(CallLog)
        .filter(
            CallLog.patient_id == patient_id,
            CallLog.created_at >= start_of_day,
            CallLog.created_at <= end_of_day
        )
        .order_by(desc(CallLog.created_at))
        .all()
    )
    
    return {
        "patient": {
            "id": patient.id,
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "phone_number": patient.phone_number,
            "disease_track": patient.disease_track,
            "protocol": patient.protocol,
            "call_time": patient.call_time,
            "days_to_monitor": patient.days_to_monitor,
            "start_date": patient.start_date.isoformat() if patient.start_date else None,
            "active": patient.active,
            "risk_score": call_log.risk_score if call_log else None,
            "risk_level": call_log.risk_level if call_log else None,
            "last_call_id": call_log.id if call_log else None
        },
        "todays_calls": [
            {
                "id": cl.id,
                "call_sid": cl.call_sid,
                "scheduled_for": cl.scheduled_for.isoformat() if cl.scheduled_for else None,
                "started_at": cl.started_at.isoformat() if cl.started_at else None,
                "status": cl.status,
                "answered": cl.answered,
                "risk_score": cl.risk_score,
                "risk_level": cl.risk_level,
                "doctor_note": _strip_date_tag(cl.doctor_note)
            }
            for cl in day_calls
        ],
        "ivr_responses": ivr_responses,
        "explainability": explainability,
        "previous_actions": actions_list
    }
