from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, date, time, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models import CareAssignment, Intervention, AuditEvent, User, CallLog, ReadmissionRisk, Patient, MedicationReminder, MedicationEvent
from app.risk.trainer import train_from_db
from app.risk.feature_builder import build_features
from app.risk.predictor import load_model, predict_risk
from app.risk.shap_explainer import explain_risk
from app.db.models import AgentResponse
from app.api.auth import get_current_user, require_role

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class AssignmentIn(BaseModel):
    patient_id: int
    doctor_name: Optional[str] = None
    nurse_name: Optional[str] = None


class InterventionIn(BaseModel):
    patient_id: int
    type: str
    status: Optional[str] = "planned"
    note: Optional[str] = None
    risk_before: Optional[float] = None
    risk_after: Optional[float] = None


class AuditIn(BaseModel):
    action: str
    meta: Optional[dict] = None


class RiskOverrideIn(BaseModel):
    patient_id: int
    call_log_id: Optional[int] = None
    risk_score: float
    note: Optional[str] = None


class ResponseReviewIn(BaseModel):
    patient_id: int
    call_log_id: int
    intent_id: str
    label: int
    reason: Optional[str] = None


class ResponseCorrectionIn(BaseModel):
    patient_id: Optional[int] = None
    call_log_id: Optional[int] = None
    intent_id: Optional[str] = None
    response_type: Optional[str] = None
    answer: Optional[str] = None
    trend: Optional[str] = None
    corrected_text: Optional[str] = None
    reason: Optional[str] = None


class MedicationReminderIn(BaseModel):
    patient_id: int
    medication_name: str
    dose: Optional[str] = None
    scheduled_for: Optional[datetime] = None


class MedicationReminderUpdateIn(BaseModel):
    scheduled_for: Optional[datetime] = None
    dose: Optional[str] = None
    status: Optional[str] = None


class MedicationBulkIn(BaseModel):
    patient_id: int
    medication_name: str
    dose: Optional[str] = None
    times: List[str]  # ["morning", "afternoon", "evening"] or specific "HH:MM"
    days: int = 1


@router.get("/care/assignments")
def list_assignments(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    query = db.query(CareAssignment)
    if patient_id:
        query = query.filter(CareAssignment.patient_id == patient_id)
    rows = query.order_by(CareAssignment.updated_at.desc()).all()
    return [
        {
            "id": row.id,
            "patient_id": row.patient_id,
            "doctor_name": row.doctor_name,
            "nurse_name": row.nurse_name,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None
        }
        for row in rows
    ]


@router.post("/care/assignments")
def upsert_assignment(
    payload: AssignmentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin", "doctor", "nurse", "staff"]))
):
    if not payload.patient_id:
        raise HTTPException(status_code=400, detail="patient_id required")
    existing = (
        db.query(CareAssignment)
        .filter(CareAssignment.patient_id == payload.patient_id)
        .order_by(CareAssignment.updated_at.desc())
        .first()
    )
    if existing:
        if payload.doctor_name is not None:
            existing.doctor_name = payload.doctor_name
        if payload.nurse_name is not None:
            existing.nurse_name = payload.nurse_name
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "patient_id": existing.patient_id}
    assignment = CareAssignment(
        patient_id=payload.patient_id,
        doctor_name=payload.doctor_name,
        nurse_name=payload.nurse_name
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return {"id": assignment.id, "patient_id": assignment.patient_id}


@router.get("/care/interventions")
def list_interventions(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    query = db.query(Intervention)
    if patient_id:
        query = query.filter(Intervention.patient_id == patient_id)
    rows = query.order_by(Intervention.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "patient_id": row.patient_id,
            "type": row.type,
            "status": row.status,
            "note": row.note,
            "risk_before": row.risk_before,
            "risk_after": row.risk_after,
            "created_at": row.created_at.isoformat() if row.created_at else None
        }
        for row in rows
    ]


@router.post("/care/interventions")
def create_intervention(
    payload: InterventionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin", "doctor", "nurse", "staff"]))
):
    if not payload.patient_id or not payload.type:
        raise HTTPException(status_code=400, detail="patient_id and type required")
    row = Intervention(
        patient_id=payload.patient_id,
        type=payload.type,
        status=payload.status or "planned",
        note=payload.note,
        risk_before=payload.risk_before,
        risk_after=payload.risk_after
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.post("/care/audit")
def create_audit(
    payload: AuditIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    if not payload.action:
        raise HTTPException(status_code=400, detail="action required")
    row = AuditEvent(
        user_id=user.id,
        action=payload.action,
        meta=payload.meta or {}
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.post("/care/risk-override")
def risk_override(
    payload: RiskOverrideIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin", "doctor"]))
):
    if payload.risk_score < 0 or payload.risk_score > 100:
        raise HTTPException(status_code=400, detail="risk_score must be 0-100")

    log = None
    if payload.call_log_id:
        log = (
            db.query(CallLog)
            .filter(CallLog.id == payload.call_log_id, CallLog.patient_id == payload.patient_id)
            .first()
        )
    if log is None:
        log = (
            db.query(CallLog)
            .filter(CallLog.patient_id == payload.patient_id)
            .order_by(CallLog.created_at.desc())
            .first()
        )
    if log is None:
        raise HTTPException(status_code=404, detail="Call log not found")

    risk_score = float(payload.risk_score)
    log.risk_score = risk_score
    log.risk_level = "high" if risk_score >= 65 else "medium" if risk_score >= 40 else "low"
    db.commit()

    explanation = {
        "top_factors": [
            {
                "feature": "manual_override",
                "label": "Manual override",
                "impact": 1.0,
                "direction": "increase" if risk_score >= 40 else "decrease"
            }
        ],
        "note": payload.note or "Doctor override"
    }
    risk = ReadmissionRisk(
        patient_id=payload.patient_id,
        call_log_id=log.id,
        score=risk_score,
        level=log.risk_level,
        model_version="manual_override",
        explanation=explanation
    )
    db.add(risk)

    label = 1 if risk_score >= 65 else 0
    audit = AuditEvent(
        user_id=user.id,
        action="risk_override",
        meta={
            "patient_id": payload.patient_id,
            "call_log_id": log.id,
            "value": risk_score,
            "label": label,
            "note": payload.note or ""
        }
    )
    db.add(audit)
    db.commit()
    db.refresh(risk)
    return {"ok": True, "call_log_id": log.id, "risk_score": risk_score, "risk_level": log.risk_level}


@router.post("/care/response-review")
def response_review(
    payload: ResponseReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin", "doctor"]))
):
    if payload.label not in [0, 1]:
        raise HTTPException(status_code=400, detail="label must be 0 or 1")

    log = (
        db.query(CallLog)
        .filter(CallLog.id == payload.call_log_id, CallLog.patient_id == payload.patient_id)
        .first()
    )
    if log is None:
        raise HTTPException(status_code=404, detail="Call log not found")

    audit = AuditEvent(
        user_id=user.id,
        action="response_review",
        meta={
            "patient_id": payload.patient_id,
            "call_log_id": payload.call_log_id,
            "intent_id": payload.intent_id,
            "label": payload.label,
            "reason": payload.reason or ""
        }
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return {"ok": True, "id": audit.id}


def _red_flag_from_correction(intent_id: str, response_type: str, answer: str | None, trend: str | None) -> bool:
    if response_type == "yes_no":
        if intent_id in ["INTENT_14_MED_ADHERENCE", "INTENT_19_MED_ADHERENCE_INHALER"]:
            return answer == "no"
        return answer == "yes"
    if response_type == "trend":
        return trend == "worse"
    if response_type in ["choice", "options", "scale"]:
        return answer == "severe"
    return False


def _format_explanation(features: dict, shap_values: dict) -> dict:
    label_map = {
        "chest_pain_score": "Chest pain",
        "shortness_of_breath": "Shortness of breath",
        "med_adherence": "Medication adherence",
        "red_flag": "Red flag response"
    }
    if shap_values:
        rows = [
            {
                "feature": feature,
                "label": label_map.get(feature, feature.replace("_", " ").title()),
                "impact": float(value),
                "direction": "increase" if float(value) >= 0 else "decrease"
            }
            for feature, value in shap_values.items()
        ]
        if any(abs(r["impact"]) > 1e-6 for r in rows):
            rows.sort(key=lambda r: abs(r["impact"]), reverse=True)
            return {"top_factors": rows[:6]}
    weights = {
        "chest_pain_score": 0.6,
        "shortness_of_breath": 0.3,
        "med_adherence": -0.3,
        "red_flag": 0.8
    }
    fallback = []
    for feature, weight in weights.items():
        value = float(features.get(feature, 0) or 0)
        impact = weight * value
        if abs(impact) < 1e-6:
            continue
        fallback.append({
            "feature": feature,
            "label": label_map.get(feature, feature.replace("_", " ").title()),
            "impact": float(impact),
            "direction": "increase" if impact >= 0 else "decrease"
        })
    fallback.sort(key=lambda r: abs(r["impact"]), reverse=True)
    return {"top_factors": fallback}


def _recompute_risk(db: Session, log: CallLog):
    responses = (
        db.query(AgentResponse)
        .filter(AgentResponse.call_id == log.patient_call_id)
        .all()
    )
    if not responses:
        return None
    payload = {}
    for r in responses:
        payload[r.intent_id] = r.structured_data or {}
        if r.intent_id in ["INTENT_1_CHEST_PAIN", "INTENT_2_EXERTIONAL_CHEST_PAIN", "INTENT_3_PAIN_RADIATION"]:
            payload.setdefault("chest_pain", {})["severity"] = 1.0 if (r.structured_data or {}).get("present") else 0.0
        if r.intent_id in ["INTENT_4_WORSENING_DYSPNEA", "INTENT_17_BREATHING_TREND"]:
            payload.setdefault("sob", {})["present"] = (r.structured_data or {}).get("present") is True or (r.structured_data or {}).get("trend") == "worse"
        if r.intent_id in ["INTENT_14_MED_ADHERENCE", "INTENT_19_MED_ADHERENCE_INHALER"]:
            payload.setdefault("med_adherence", {})["score"] = 1.0 if (r.structured_data or {}).get("present") else 0.3
        if r.red_flag:
            payload.setdefault("red_flag", {})["present"] = True

    features = build_features(payload)
    model = load_model()
    risk = predict_risk(model, features)
    if any(r.red_flag for r in responses) and risk < 0.7:
        risk = 0.7
    level = "high" if risk >= 0.65 else "medium" if risk >= 0.4 else "low"
    explanation = {}
    if model is not None:
        try:
            import pandas as pd
            explanation = explain_risk(model, pd.DataFrame([features]))
        except Exception:
            explanation = {}
    explanation = _format_explanation(features, explanation)
    return float(risk * 100), level, explanation


from fastapi import Request

@router.post("/care/response-correction")
async def response_correction(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin", "doctor", "nurse"]))
):
    from app.agent.intents import INTENTS
    from app.db.models import ResponseCorrection

    try:
        payload = await request.json()
    except Exception as e:
        print(f"DEBUG: Failed to parse JSON: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    print(f"DEBUG: Received correction payload: {payload}")

    patient_id = payload.get("patient_id")
    call_log_id = payload.get("call_log_id")
    intent_id = payload.get("intent_id")

    if not patient_id or not call_log_id or not intent_id:
        raise HTTPException(status_code=400, detail="Missing required fields: patient_id, call_log_id, or intent_id")

    log = (
        db.query(CallLog)
        .filter(CallLog.id == call_log_id, CallLog.patient_id == patient_id)
        .first()
    )
    if log is None or not log.patient_call_id:
        raise HTTPException(status_code=404, detail="Call log not found")

    response = (
        db.query(AgentResponse)
        .filter(AgentResponse.call_id == log.patient_call_id, AgentResponse.intent_id == intent_id)
        .order_by(AgentResponse.created_at.desc())
        .first()
    )
    if response is None:
        raise HTTPException(status_code=404, detail="Response not found")

    # Use response_type from payload or lookup from INTENTS
    response_type = payload.get("response_type")
    if not response_type:
        intent_info = INTENTS.get(intent_id, {})
        response_type = intent_info.get("response_type", "yes_no")
    
    print(f"DEBUG: Resolved response_type: {response_type}")

    structured = response.structured_data or {}
    
    if response_type == "yes_no":
        # Allow transcript-only correction without forcing structured answer to unknown.
        answer_val = payload.get("answer")
        if answer_val is not None and str(answer_val).strip() != "":
            answer = answer_val.lower()
            structured["answer"] = answer
            structured["present"] = answer == "yes"
    elif response_type == "trend":
        trend_val = payload.get("trend")
        if trend_val is not None and str(trend_val).strip() != "":
            trend = trend_val.lower()
            structured["trend"] = trend
    elif response_type in ["choice", "options", "scale"]:
        answer_val = payload.get("answer")
        if answer_val is not None and str(answer_val).strip() != "":
            answer = answer_val.lower()
            structured["answer"] = answer
    
    original_text = response.raw_text or ""
    # DO NOT overwrite response.raw_text here. 
    # We want to keep the original transcription in AgentResponse.
    # The corrected clinical value is stored in structured_data and the tracking table.

    response.structured_data = structured
    response.red_flag = _red_flag_from_correction(
        intent_id,
        response_type,
        structured.get("answer"),
        structured.get("trend")
    )
    db.commit()

    # Save to ResponseCorrection table for historical tracking
    existing_correction = (
        db.query(ResponseCorrection)
        .filter(ResponseCorrection.agent_response_id == response.id)
        .first()
    )
    
    if existing_correction:
        existing_correction.corrected_text = payload.get("corrected_text") or response.raw_text
        existing_correction.correction_reason = payload.get("reason")
        existing_correction.corrected_by_nurse_id = user.id
    else:
        new_correction = ResponseCorrection(
            agent_response_id=response.id,
            call_log_id=log.id,
            patient_id=patient_id,
            original_text=original_text,
            corrected_text=payload.get("corrected_text") or response.raw_text,
            corrected_by_nurse_id=user.id,
            correction_reason=payload.get("reason")
        )
        db.add(new_correction)
    
    db.commit()

    recomputed = _recompute_risk(db, log)
    if recomputed:
        score, level, explanation = recomputed
        log.risk_score = score
        log.risk_level = level
        db.add(ReadmissionRisk(
            patient_id=patient_id,
            call_log_id=log.id,
            score=score,
            level=level,
            model_version="doctor_correction",
            explanation=explanation
        ))
        db.commit()

    audit = AuditEvent(
        user_id=user.id,
        action="response_correction",
        meta={
            "patient_id": patient_id,
            "call_log_id": call_log_id,
            "intent_id": intent_id,
            "response_type": response_type,
            "answer": payload.get("answer"),
            "trend": payload.get("trend"),
            "reason": payload.get("reason") or ""
        }
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return {"ok": True, "id": audit.id}


@router.post("/care/retrain")
def retrain_now(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin", "doctor"]))
):
    ok = train_from_db(db)
    return {"ok": ok}


@router.post("/care/medication/reminders")
def create_medication_reminder(
    payload: MedicationReminderIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse"]))
):
    if not payload.patient_id or not payload.medication_name:
        raise HTTPException(status_code=400, detail="patient_id and medication_name required")
    ist = ZoneInfo("Asia/Kolkata")
    if payload.scheduled_for is None:
        scheduled_for = datetime.now(ist).astimezone(ZoneInfo("UTC"))
    else:
        scheduled_for = payload.scheduled_for
        if scheduled_for.tzinfo is None:
            scheduled_for = scheduled_for.replace(tzinfo=ist).astimezone(ZoneInfo("UTC"))
        else:
            scheduled_for = scheduled_for.astimezone(ZoneInfo("UTC"))
    reminder = MedicationReminder(
        patient_id=payload.patient_id,
        medication_name=payload.medication_name,
        dose=payload.dose,
        scheduled_for=scheduled_for
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    db.add(MedicationEvent(
        reminder_id=reminder.id,
        event_type="scheduled",
        meta={"scheduled_for": scheduled_for.isoformat()}
    ))
    db.commit()
    return {"id": reminder.id, "status": reminder.status}
@router.post("/care/medication/bulk-reminders")
def create_bulk_medication_reminders(
    payload: MedicationBulkIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "staff", "admin"]))
):
    if not payload.patient_id or not payload.medication_name:
        raise HTTPException(status_code=400, detail="patient_id and medication_name required")
    
    ist = ZoneInfo("Asia/Kolkata")
    now_ist = datetime.now(ist)
    
    time_map = {
        "morning": "09:00",
        "afternoon": "14:00",
        "evening": "20:00"
    }

    reminders_created = []
    for day_offset in range(payload.days):
        base_date = now_ist + timedelta(days=day_offset)
        for t_key in payload.times:
            t_str = time_map.get(t_key.lower(), t_key)
            try:
                hour, minute = map(int, t_str.split(':'))
                scheduled_ist = base_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
                
                # If scheduled time is in the past for today, skip or move to tomorrow?
                # Usually better to only schedule future ones if it's "today"
                if day_offset == 0 and scheduled_ist < now_ist:
                    continue
                
                scheduled_utc = scheduled_ist.astimezone(ZoneInfo("UTC"))
                
                reminder = MedicationReminder(
                    patient_id=payload.patient_id,
                    medication_name=payload.medication_name,
                    dose=payload.dose,
                    scheduled_for=scheduled_utc,
                    status="scheduled"
                )
                db.add(reminder)
                db.flush() # Get ID
                
                db.add(MedicationEvent(
                    reminder_id=reminder.id,
                    event_type="scheduled",
                    meta={"scheduled_for": scheduled_utc.isoformat(), "label": t_key}
                ))
                reminders_created.append(reminder.id)
            except Exception as e:
                print(f"Error scheduling {t_key}: {e}")
                continue
    
    db.commit()
    return {"ok": True, "count": len(reminders_created), "ids": reminders_created}


@router.post("/care/medication/reminders/{reminder_id}/trigger-call")
def trigger_medication_call_endpoint(
    reminder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["staff", "nurse", "admin"]))
):
    from app.telephony.twilio_client import make_medication_call
    reminder = db.query(MedicationReminder).filter(MedicationReminder.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    
    patient = db.query(Patient).filter(Patient.id == reminder.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    call = make_medication_call(patient.phone_number, reminder.id)
    reminder.call_placed_at = datetime.utcnow()
    reminder.call_sid = call.sid if call else None
    reminder.status = "call_placed"
    
    db.add(MedicationEvent(
        reminder_id=reminder.id,
        event_type="call_placed",
        meta={"phone": patient.phone_number, "triggered_by": user.id}
    ))
    db.commit()
    return {"ok": True, "call_sid": reminder.call_sid}


@router.get("/care/medication/reminders")
def list_medication_reminders(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    query = db.query(MedicationReminder)
    if patient_id:
        query = query.filter(MedicationReminder.patient_id == patient_id)
    rows = query.order_by(MedicationReminder.created_at.desc()).limit(50).all()
    return [
        {
            "id": row.id,
            "patient_id": row.patient_id,
            "medication_name": row.medication_name,
            "dose": row.dose,
            "scheduled_for": row.scheduled_for.isoformat() if row.scheduled_for else None,
            "sms_sent_at": row.sms_sent_at.isoformat() if row.sms_sent_at else None,
            "call_placed_at": row.call_placed_at.isoformat() if row.call_placed_at else None,
            "status": row.status
        }
        for row in rows
    ]


@router.delete("/care/medication/reminders/{reminder_id}")
def delete_medication_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["staff", "nurse"]))
):
    reminder = db.query(MedicationReminder).filter(MedicationReminder.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    db.query(MedicationEvent).filter(MedicationEvent.reminder_id == reminder_id).delete(synchronize_session=False)
    db.delete(reminder)
    db.commit()
    return {"ok": True}


@router.put("/care/medication/reminders/{reminder_id}")
def update_medication_reminder(
    reminder_id: int,
    payload: MedicationReminderUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["staff", "nurse"]))
):
    reminder = db.query(MedicationReminder).filter(MedicationReminder.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    if payload.scheduled_for is not None:
        scheduled_for = payload.scheduled_for
        if scheduled_for.tzinfo is None:
            scheduled_for = scheduled_for.replace(tzinfo=ZoneInfo("Asia/Kolkata")).astimezone(ZoneInfo("UTC"))
        else:
            scheduled_for = scheduled_for.astimezone(ZoneInfo("UTC"))
        reminder.scheduled_for = scheduled_for

    if payload.dose is not None:
        reminder.dose = payload.dose

    if payload.status is not None:
        status = payload.status.strip().lower()
        allowed = {"scheduled", "paused", "sms_sent", "call_placed", "taken", "missed", "no_response", "not_taken"}
        if status not in allowed:
            raise HTTPException(status_code=400, detail="Invalid reminder status")
        reminder.status = status

    db.commit()
    db.refresh(reminder)
    return {
        "id": reminder.id,
        "patient_id": reminder.patient_id,
        "medication_name": reminder.medication_name,
        "dose": reminder.dose,
        "scheduled_for": reminder.scheduled_for.isoformat() if reminder.scheduled_for else None,
        "status": reminder.status
    }


@router.get("/care/audit")
def list_audit(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    rows = (
        db.query(AuditEvent)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    results = []
    for row in rows:
        meta = row.meta or {}
        patient_name = None
        if meta.get("patient_id") is not None:
            patient = db.query(Patient).filter(Patient.id == meta.get("patient_id")).first()
            patient_name = patient.name if patient else None
        actor = db.query(User).filter(User.id == row.user_id).first()
        doctor_name = actor.name if actor else None
        enriched = dict(meta)
        if patient_name:
            enriched["patient_name"] = patient_name
        if doctor_name:
            enriched["doctor_name"] = doctor_name
        results.append({
            "id": row.id,
            "user_id": row.user_id,
            "action": row.action,
            "meta": enriched,
            "created_at": row.created_at.isoformat() if row.created_at else None
        })
    return results
