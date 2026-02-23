from __future__ import annotations

from datetime import datetime, timezone, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from app.api.auth import require_role
from app.db.models import (
    AgentResponse,
    AuditEvent,
    CallLog,
    CareAssignment,
    Intervention,
    MedicationReminder,
    Patient,
    ReadmissionRisk,
    User,
)
from app.db.session import SessionLocal
from app.telephony.twilio_client import make_call
from app.agent.intents import INTENTS

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _risk_status(score: Optional[float]) -> str:
    if score is None:
        return "monitor"
    if score >= 65:
        return "critical"
    if score >= 40:
        return "monitor"
    return "stable"


def _last_risk(db: Session, patient_id: int) -> tuple[Optional[float], Optional[str]]:
    risk = (
        db.query(ReadmissionRisk)
        .filter(ReadmissionRisk.patient_id == patient_id)
        .order_by(ReadmissionRisk.created_at.desc())
        .first()
    )
    if risk:
        return risk.score, risk.level
    log = (
        db.query(CallLog)
        .filter(CallLog.patient_id == patient_id)
        .order_by(CallLog.created_at.desc())
        .first()
    )
    if not log:
        return None, None
    return log.risk_score, log.risk_level


def _latest_assignment(db: Session, patient_id: int) -> Optional[CareAssignment]:
    return (
        db.query(CareAssignment)
        .filter(CareAssignment.patient_id == patient_id)
        .order_by(CareAssignment.updated_at.desc())
        .first()
    )


def _safe_zone(tz_name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _monitoring_date_range(patient: Patient) -> tuple[date, date]:
    tz = _safe_zone(patient.timezone)
    start_dt = patient.start_date or datetime.now(timezone.utc)
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    start_local = start_dt.astimezone(tz).date()
    total_days = max(1, int(patient.days_to_monitor or 30))
    end_local = start_local + timedelta(days=total_days - 1)
    return start_local, end_local


def _resolve_selected_date(patient: Patient, selected_date: Optional[date]) -> tuple[date, date, date]:
    start_local, end_local = _monitoring_date_range(patient)
    tz = _safe_zone(patient.timezone)
    today_local = datetime.now(timezone.utc).astimezone(tz).date()
    effective = selected_date or today_local
    print(f"DEBUG_DATE: effective={effective}, start={start_local}, end={end_local}")
    if effective < start_local or effective > end_local:
        print(f"DEBUG_DATE: Out of range!")
        # For now, relax the check to allow debugging on frontend vs blocking
        # raise HTTPException(
        #     status_code=400,
        #     detail=f"Date out of range. Monitoring from {start_local} to {end_local}"
        # )
        pass
    return effective, start_local, end_local


def _medications_for_date(db: Session, patient_id: int, effective_date: date) -> list[dict]:
    # Get reminders scheduled for this date (in any timezone, converted to date)
    # This is a simplification; for production, rigorous timezone overlap is needed.
    # Here we assume scheduled_for is stored in UTC.
    
    start_of_day = datetime.combine(effective_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(effective_date, datetime.max.time()).replace(tzinfo=timezone.utc)

    reminders = (
        db.query(MedicationReminder)
        .filter(
            MedicationReminder.patient_id == patient_id,
            MedicationReminder.scheduled_for >= start_of_day,
            MedicationReminder.scheduled_for <= end_of_day
        )
        .order_by(MedicationReminder.scheduled_for.asc())
        .all()
    )

    return [
        {
            "id": r.id,
            "medication_name": r.medication_name,
            "dose": r.dose,
            "scheduled_for": r.scheduled_for.isoformat(),
            "status": r.status,
            "sms_sent_at": r.sms_sent_at.isoformat() if r.sms_sent_at else None
        }
        for r in reminders
    ]


def _date_bounds_utc(patient: Patient, target_date: date) -> tuple[datetime, datetime]:
    tz = _safe_zone(patient.timezone)
    start_local = datetime(target_date.year, target_date.month, target_date.day, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def _latest_log_for_date(db: Session, patient: Patient, target_date: date) -> Optional[CallLog]:
    start, end = _date_bounds_utc(patient, target_date)
    return (
        db.query(CallLog)
        .filter(
            CallLog.patient_id == patient.id,
            CallLog.created_at >= start,
            CallLog.created_at < end
        )
        .order_by(CallLog.created_at.desc())
        .first()
    )


def _latest_reminder_for_date(db: Session, patient: Patient, target_date: date) -> Optional[MedicationReminder]:
    start, end = _date_bounds_utc(patient, target_date)
    return (
        db.query(MedicationReminder)
        .filter(
            MedicationReminder.patient_id == patient.id,
            MedicationReminder.scheduled_for >= start,
            MedicationReminder.scheduled_for < end
        )
        .order_by(MedicationReminder.scheduled_for.desc())
        .first()
    )


def _last_response_state(log: Optional[CallLog]) -> str:
    if not log:
        return "pending"
    if log.answered:
        return "received"
    if (log.status or "").lower() in ["no_answer", "failed", "missed"]:
        return "missed"
    return "pending"


def _follow_up_required(
    risk_score: Optional[float],
    last_log: Optional[CallLog],
    last_reminder: Optional[MedicationReminder],
    has_open_followup: bool
) -> bool:
    if (risk_score or 0) >= 65:
        return True
    if last_log and not last_log.answered and (last_log.status or "").lower() in ["no_answer", "missed", "failed"]:
        return True
    if last_reminder and (last_reminder.status or "").lower() in ["missed", "no_response"]:
        return True
    if has_open_followup:
        return True
    return False


def _patient_or_404(db: Session, patient_id: int) -> Patient:
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def _open_followup_exists(db: Session, patient_id: int) -> bool:
    row = (
        db.query(Intervention)
        .filter(
            Intervention.patient_id == patient_id,
            Intervention.type == "nurse_followup_call",
            Intervention.status.in_(["assigned", "planned"])
        )
        .order_by(Intervention.created_at.desc())
        .first()
    )
    return row is not None


@router.get("/nurse/dashboard")
def nurse_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin", "doctor"]))
):
    patients = db.query(Patient).filter(Patient.active.is_(True)).all()
    rows = []
    for patient in patients:
        risk_score, risk_level = _last_risk(db, patient.id)
        last_log = (
            db.query(CallLog)
            .filter(CallLog.patient_id == patient.id)
            .order_by(CallLog.created_at.desc())
            .first()
        )
        reminder = _latest_reminder_for_date(db, patient, datetime.now(timezone.utc).date())
        open_followup = _open_followup_exists(db, patient.id)
        followup = _follow_up_required(risk_score, last_log, reminder, open_followup)
        last_response = _last_response_state(last_log)
        priority_rank = 0
        if (risk_score or 0) >= 65:
            priority_rank = 3
        elif (risk_score or 0) >= 40:
            priority_rank = 2
        elif followup:
            priority_rank = 1
        rows.append({
            "patient_id": patient.id,
            "patient_name": patient.name,
            "name": patient.name,  # Added for frontend card compatibility
            "phone_number": patient.phone_number,
            "protocol": patient.protocol,
            "risk_score": risk_score,
            "risk_level": (risk_level or _risk_status(risk_score)).lower(),
            "last_response": last_response,
            "follow_up_required": followup,
            "priority_rank": priority_rank,
            "last_log_at": last_log.created_at.isoformat() if last_log and last_log.created_at else None
        })
    rows.sort(key=lambda r: (r["priority_rank"], r["risk_score"] or 0, r["last_log_at"] or ""), reverse=True)
    
    # Categorize for frontend compatibility
    high_risk = [r for r in rows if r["risk_level"] in ["critical", "high"]]
    medium_risk = [r for r in rows if r["risk_level"] in ["monitor", "medium"]]
    low_risk = [r for r in rows if r["risk_level"] in ["stable", "low"]]
    
    # Ensure all patients are in at least one list if not already
    categorized_ids = {r["patient_id"] for r in high_risk + medium_risk + low_risk}
    for r in rows:
        if r["patient_id"] not in categorized_ids:
            low_risk.append(r)

    return {
        "items": rows,
        "high_risk": high_risk,
        "medium_risk": medium_risk,
        "low_risk": low_risk
    }


def _response_severity(response: AgentResponse) -> str:
    if response.red_flag:
        return "critical"
    confidence = float(response.confidence or 0)
    if confidence < 60:
        return "monitor"
    return "stable"


def _response_correction_map(db: Session, call_log_id: int) -> dict:
    from app.db.models import ResponseCorrection
    rows = (
        db.query(ResponseCorrection)
        .filter(ResponseCorrection.call_log_id == call_log_id)
        .all()
    )
    out = {}
    for row in rows:
        # Get intent_id from the associated AgentResponse
        agent_resp = db.query(AgentResponse).filter(AgentResponse.id == row.agent_response_id).first()
        if not agent_resp:
            continue
        
        intent_id = agent_resp.intent_id
        if intent_id and intent_id not in out:
            out[intent_id] = {
                "corrected_text": row.corrected_text,
                "reason": row.correction_reason or "",
                "created_at": row.created_at.isoformat() if row.created_at else None
            }
    return out


def _ivr_for_date(db: Session, patient: Patient, selected_date: date, day_log: Optional[CallLog]) -> dict:
    if not day_log or not day_log.patient_call_id:
        return {
            "date": selected_date.isoformat(),
            "items": [],
            "empty_message": "No IVR responses recorded for this day"
        }

    responses = (
        db.query(AgentResponse)
        .filter(AgentResponse.call_id == day_log.patient_call_id)
        .order_by(AgentResponse.created_at.asc())
        .all()
    )
    corrections = _response_correction_map(db, day_log.id)
    items = []
    for row in responses:
        summary = row.raw_text or ""
        if not summary and isinstance(row.structured_data, dict):
            summary = str(row.structured_data.get("value") or row.structured_data.get("summary") or "")
        intent_data = INTENTS.get(row.intent_id, {})
        question = intent_data.get("allowed_phrases", [row.intent_id])[0]
        
        items.append({
            "id": row.id,
            "intent_id": row.intent_id,
            "question": question,
            "summary_answer": summary or "-",
            "full_response": row.raw_text or "-",
            "severity": _response_severity(row),
            "speech_correction": corrections.get(row.intent_id),
            "timestamp": row.created_at.isoformat() if row.created_at else None
        })
    return {
        "date": selected_date.isoformat(),
        "items": items,
        "empty_message": "No IVR responses recorded for this day"
    }


def _tagged_note(note: Optional[str], selected_date: date) -> str:
    raw = (note or "").strip()
    return f"[for {selected_date.isoformat()}] {raw}" if raw else f"[for {selected_date.isoformat()}]"


def _strip_date_tag(note: Optional[str]) -> str:
    text = (note or "").strip()
    if text.startswith("[for ") and "] " in text:
        return text.split("] ", 1)[1].strip()
    return text


def _daily_notes_section(db: Session, patient: Patient, selected_date: date) -> list[dict]:
    start, end = _date_bounds_utc(patient, selected_date)
    selected_iso = selected_date.isoformat()
    events = []

    interventions = db.query(Intervention).filter(Intervention.patient_id == patient.id).order_by(Intervention.created_at.desc()).all()
    for row in interventions:
        tagged_for = None
        note_text = (row.note or "").strip()
        if note_text.startswith("[for "):
            head = note_text.split("]", 1)[0]
            tagged_for = head.replace("[for ", "").strip() if head else None
        in_day = bool(row.created_at and start <= row.created_at < end)
        if not in_day and tagged_for != selected_iso:
            continue
        events.append({
            "time": row.created_at.isoformat() if row.created_at else None,
            "author": "Nurse",
            "type": "nurse_note",
            "read_only": False,
            "note": _strip_date_tag(row.note)
        })

    logs = (
        db.query(CallLog)
        .filter(CallLog.patient_id == patient.id, CallLog.created_at >= start, CallLog.created_at < end)
        .order_by(CallLog.created_at.desc())
        .all()
    )
    for row in logs:
        if not (row.doctor_note or "").strip():
            continue
        events.append({
            "time": row.created_at.isoformat() if row.created_at else None,
            "author": "Doctor",
            "type": "doctor_note",
            "read_only": True,
            "note": row.doctor_note
        })

    events.sort(key=lambda e: e["time"] or "", reverse=True)
    return events


@router.get("/nurse/patient/{patient_id}")
def nurse_patient_page(
    patient_id: int,
    selected_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin", "doctor"]))
):
    patient = _patient_or_404(db, patient_id)
    
    # Manually parse date to avoid 422 validation issues
    parsed_date = None
    if selected_date:
        try:
            parsed_date = date.fromisoformat(selected_date)
        except ValueError:
            pass # Fallback to None (today) if parse fails logic exists in resolve

    effective_date, monitor_start, monitor_end = _resolve_selected_date(patient, parsed_date)
    risk_score, _ = _last_risk(db, patient_id)
    assignment = _latest_assignment(db, patient_id)
    day_log = _latest_log_for_date(db, patient, effective_date)
    day_reminder = _latest_reminder_for_date(db, patient, effective_date)
    open_followup = _open_followup_exists(db, patient_id)
    followup = _follow_up_required(risk_score, day_log, day_reminder, open_followup)

    conditions = [patient.disease_track] if patient.disease_track else []
    tz = _safe_zone(patient.timezone)
    today_local = datetime.now(timezone.utc).astimezone(tz).date()
    monitor_day = max(1, min((today_local - monitor_start).days + 1, int(patient.days_to_monitor or 30)))
    profile = {
        "patient_id": patient.id,
        "patient_name": patient.name,
        "name": patient.name,
        "age": patient.age,
        "gender": patient.gender,
        "phone_number": patient.phone_number,
        "disease_track": patient.disease_track,
        "protocol": patient.protocol,
        "created_at": patient.created_at.isoformat() if patient.created_at else None,
        "conditions": conditions,
        "risk_percent": risk_score,
        "risk_score": risk_score,
        "status": _risk_status(risk_score),
        "monitoring_day": monitor_day,
        "days_to_monitor": patient.days_to_monitor,
        "monitoring_total_days": int(patient.days_to_monitor or 30),
        "assigned_doctor": assignment.doctor_name if assignment else None,
        "assigned_nurse": assignment.nurse_name if assignment else None
    }
    reminder_status = (day_reminder.status or "").lower() if day_reminder else ""
    daily_status = {
        "selected_date": effective_date.isoformat(),
        "ivr_call": "Answered" if (day_log and day_log.answered) else "Missed",
        "medication": "Taken" if reminder_status == "taken" else "Not Taken",
        "reminder": "Sent" if (day_reminder and day_reminder.sms_sent_at is not None) else "Not Sent",
        "follow_up_required": followup
    }
    date_control = {
        "selected_date": effective_date.isoformat(),
        "min_date": monitor_start.isoformat(),
        "max_date": monitor_end.isoformat(),
        "can_prev": effective_date > monitor_start,
        "can_next": effective_date < monitor_end
    }
    # Fetch doctor notes (from interventions AND call logs for this date)
    start_utc, end_utc = _date_bounds_utc(patient, effective_date)
    
    # 1. Notes from Interventions
    intervention_notes = (
        db.query(Intervention)
        .filter(
            Intervention.patient_id == patient_id,
            Intervention.type == "doctor_note",
            Intervention.created_at >= start_utc,
            Intervention.created_at < end_utc
        )
        .all()
    )
    
    # 2. Notes from CallLogs
    call_logs_with_notes = (
        db.query(CallLog)
        .filter(
            CallLog.patient_id == patient_id,
            CallLog.created_at >= start_utc,
            CallLog.created_at < end_utc,
            CallLog.doctor_note.isnot(None),
            CallLog.doctor_note != ""
        )
        .all()
    )
    
    formatted_notes = []
    seen_notes = set()

    def add_note(text, created_at):
        clean_text = _strip_date_tag(text)
        if clean_text and clean_text not in seen_notes:
            formatted_notes.append({
                "note": clean_text,
                "created_at": created_at.isoformat()
            })
            seen_notes.add(clean_text)

    for n in intervention_notes:
        add_note(n.note, n.created_at)
    for cl in call_logs_with_notes:
        add_note(cl.doctor_note, cl.created_at)
    
    # Sort by time desc
    formatted_notes.sort(key=lambda x: x["created_at"], reverse=True)

    # Fetch corrections from the dedicated table
    from app.db.models import ResponseCorrection
    corrections_list = []
    if day_log:
        corrections_rows = (
            db.query(ResponseCorrection)
            .filter(ResponseCorrection.call_log_id == day_log.id)
            .all()
        )
        for c in corrections_rows:
            corrections_list.append({
                "id": c.id,
                "agent_response_id": c.agent_response_id,
                "original_text": c.original_text,
                "corrected_text": c.corrected_text,
                "correction_reason": c.correction_reason,
                "created_at": c.created_at.isoformat() if c.created_at else None
            })

    return {
        **profile,  # Flatten profile to top level
        "profile_header": profile, # Keep for backward compatibility if needed
        "date_control": date_control,
        "daily_status": daily_status,
        "nurse_actions": {
            "follow_up_required": followup,
            "actions": ["call_patient", "mark_taken", "mark_not_taken", "no_response", "add_note"]
        },
        "ivr_data": _ivr_for_date(db, patient, effective_date, day_log)["items"],
        "corrections": corrections_list,
        "call_log_id": day_log.id if day_log else None,
        "doctor_notes": formatted_notes,
        "medications": _medications_for_date(db, patient.id, effective_date)
    }


class TriggerCallIn(BaseModel):
    protocol: Optional[str] = None
    selected_date: Optional[date] = None


class SendReminderIn(BaseModel):
    medication_name: str
    dose: Optional[str] = None
    scheduled_for: Optional[datetime] = None
    selected_date: Optional[date] = None


class NurseNoteIn(BaseModel):
    note: str
    selected_date: Optional[date] = None


class AssignNurseIn(BaseModel):
    nurse_name: str
    doctor_name: Optional[str] = None


class MarkMedicationTakenIn(BaseModel):
    reminder_id: Optional[int] = None
    note: Optional[str] = None
    selected_date: Optional[date] = None


class MarkMedicationNotTakenIn(BaseModel):
    reminder_id: Optional[int] = None
    note: Optional[str] = None
    selected_date: Optional[date] = None


class MarkNoResponseIn(BaseModel):
    reminder_id: Optional[int] = None
    note: Optional[str] = None
    selected_date: Optional[date] = None


def _audit_nurse_action(
    db: Session,
    user_id: int,
    patient_id: int,
    action: str,
    meta: Optional[dict] = None,
    selected_date: Optional[date] = None,
    user_name: Optional[str] = None
):
    row = AuditEvent(
        user_id=user_id,
        action="nurse_action",
        meta={
            "patient_id": patient_id,
            "action": action,
            "selected_date": selected_date.isoformat() if selected_date else None,
            "user_name": user_name or "",
            **(meta or {})
        }
    )
    db.add(row)
    db.commit()


def _ensure_date_reminder(
    db: Session,
    patient: Patient,
    target_date: date,
    reminder_id: Optional[int],
    default_status: str = "scheduled"
) -> MedicationReminder:
    reminder = None
    if reminder_id:
        reminder = (
            db.query(MedicationReminder)
            .filter(MedicationReminder.id == reminder_id, MedicationReminder.patient_id == patient.id)
            .first()
        )
    if reminder is None:
        reminder = _latest_reminder_for_date(db, patient, target_date)
    if reminder is not None:
        return reminder

    start, _ = _date_bounds_utc(patient, target_date)
    reminder = MedicationReminder(
        patient_id=patient.id,
        medication_name="Medication",
        dose=None,
        scheduled_for=start + timedelta(hours=12),
        status=default_status
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


@router.post("/nurse/patient/{patient_id}/actions/trigger-call")
def nurse_trigger_call(
    patient_id: int,
    payload: TriggerCallIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin"]))
):
    patient = _patient_or_404(db, patient_id)
    effective_date, _, _ = _resolve_selected_date(patient, payload.selected_date)
    protocol = payload.protocol or patient.protocol or "GENERAL_MONITORING"
    call_id = f"nurse-{patient_id}-{int(datetime.now(timezone.utc).timestamp())}"
    call = make_call(patient.phone_number, call_id, patient_id=str(patient_id), protocol=protocol)
    if call is None:
        raise HTTPException(status_code=400, detail="Call failed")
    db.add(Intervention(
        patient_id=patient_id,
        type="nurse_call_attempt",
        status="completed",
        note=_tagged_note("Triggered from nurse action bar", effective_date)
    ))
    db.commit()
    _audit_nurse_action(
        db, user.id, patient_id, "trigger_call",
        {"call_id": call_id},
        selected_date=effective_date,
        user_name=user.name
    )
    return {"ok": True, "call_id": call_id}


@router.post("/nurse/patient/{patient_id}/actions/send-reminder")
def nurse_send_reminder(
    patient_id: int,
    payload: SendReminderIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin"]))
):
    patient = _patient_or_404(db, patient_id)
    effective_date, _, _ = _resolve_selected_date(patient, payload.selected_date)
    scheduled_for = payload.scheduled_for
    if scheduled_for is None:
        start, _ = _date_bounds_utc(patient, effective_date)
        scheduled_for = start + timedelta(hours=12)
    reminder = MedicationReminder(
        patient_id=patient_id,
        medication_name=payload.medication_name,
        dose=payload.dose,
        scheduled_for=scheduled_for,
        status="scheduled"
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    db.add(Intervention(
        patient_id=patient_id,
        type="nurse_medication_reminder",
        status="planned",
        note=_tagged_note(f"Reminder created for {payload.medication_name}", effective_date)
    ))
    db.commit()
    _audit_nurse_action(
        db, user.id, patient_id, "send_reminder",
        {"reminder_id": reminder.id},
        selected_date=effective_date,
        user_name=user.name
    )
    return {"ok": True, "reminder_id": reminder.id}


@router.post("/nurse/patient/{patient_id}/actions/add-note")
def nurse_add_note(
    patient_id: int,
    payload: NurseNoteIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin"]))
):
    patient = _patient_or_404(db, patient_id)
    effective_date, _, _ = _resolve_selected_date(patient, payload.selected_date)
    row = Intervention(
        patient_id=patient_id,
        type="nurse_note",
        status="logged",
        note=_tagged_note(payload.note, effective_date)
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit_nurse_action(
        db, user.id, patient_id, "add_note",
        {"note_id": row.id, "note": payload.note},
        selected_date=effective_date,
        user_name=user.name
    )
    return {"ok": True, "note_id": row.id}


@router.post("/nurse/patient/{patient_id}/actions/assign-nurse")
def nurse_assign(
    patient_id: int,
    payload: AssignNurseIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin", "staff"]))
):
    _patient_or_404(db, patient_id)
    assignment = _latest_assignment(db, patient_id)
    if assignment:
        assignment.nurse_name = payload.nurse_name
        if payload.doctor_name is not None:
            assignment.doctor_name = payload.doctor_name
        db.commit()
        db.refresh(assignment)
    else:
        assignment = CareAssignment(
            patient_id=patient_id,
            doctor_name=payload.doctor_name,
            nurse_name=payload.nurse_name
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
    _audit_nurse_action(db, user.id, patient_id, "assign_nurse", {"nurse_name": payload.nurse_name})
    return {"ok": True, "assignment_id": assignment.id}


@router.post("/nurse/patient/{patient_id}/actions/mark-medication-taken")
def nurse_mark_taken(
    patient_id: int,
    payload: MarkMedicationTakenIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin"]))
):
    patient = _patient_or_404(db, patient_id)
    effective_date, _, _ = _resolve_selected_date(patient, payload.selected_date)
    reminder = _ensure_date_reminder(db, patient, effective_date, payload.reminder_id)
    reminder.status = "taken"
    reminder.call_placed_at = datetime.now(timezone.utc)
    db.commit()

    note = payload.note or f"Medication marked taken by nurse {user.name}"
    db.add(Intervention(
        patient_id=patient_id,
        type="nurse_followup_call",
        status="completed",
        note=_tagged_note(note, effective_date)
    ))
    db.commit()
    _audit_nurse_action(
        db, user.id, patient_id, "mark_medication_taken",
        {"reminder_id": reminder.id},
        selected_date=effective_date,
        user_name=user.name
    )
    return {"ok": True, "reminder_id": reminder.id, "status": reminder.status}


@router.post("/nurse/patient/{patient_id}/actions/mark-medication-not-taken")
def nurse_mark_not_taken(
    patient_id: int,
    payload: MarkMedicationNotTakenIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin"]))
):
    patient = _patient_or_404(db, patient_id)
    effective_date, _, _ = _resolve_selected_date(patient, payload.selected_date)
    reminder = _ensure_date_reminder(db, patient, effective_date, payload.reminder_id)
    reminder.status = "missed"
    reminder.call_placed_at = datetime.now(timezone.utc)
    db.commit()
    note = payload.note or f"Medication marked not taken by nurse {user.name}"
    db.add(Intervention(
        patient_id=patient_id,
        type="nurse_followup_call",
        status="planned",
        note=_tagged_note(note, effective_date)
    ))
    db.commit()
    _audit_nurse_action(
        db, user.id, patient_id, "mark_medication_not_taken",
        {"reminder_id": reminder.id},
        selected_date=effective_date,
        user_name=user.name
    )
    return {"ok": True, "reminder_id": reminder.id, "status": reminder.status}


@router.post("/nurse/patient/{patient_id}/actions/mark-no-response")
def nurse_mark_no_response(
    patient_id: int,
    payload: MarkNoResponseIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["nurse", "admin"]))
):
    patient = _patient_or_404(db, patient_id)
    effective_date, _, _ = _resolve_selected_date(patient, payload.selected_date)
    reminder = _ensure_date_reminder(db, patient, effective_date, payload.reminder_id)
    reminder.status = "no_response"
    reminder.call_placed_at = datetime.now(timezone.utc)
    db.commit()
    note = payload.note or f"No response marked by nurse {user.name}"
    db.add(Intervention(
        patient_id=patient_id,
        type="nurse_followup_call",
        status="planned",
        note=_tagged_note(note, effective_date)
    ))
    db.commit()
    _audit_nurse_action(
        db, user.id, patient_id, "mark_no_response",
        {"reminder_id": reminder.id},
        selected_date=effective_date,
        user_name=user.name
    )
    return {"ok": True, "reminder_id": reminder.id, "status": reminder.status}
