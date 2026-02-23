from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
import json
import time

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models import Patient, CallLog, ReadmissionRisk, PatientCall, AgentResponse, AuditEvent, MedicationReminder, Intervention
from app.api.auth import get_current_user, require_role
from app.db.models import SessionToken, User
from app.telephony.twilio_client import make_call
from app.config import DEFAULT_COUNTRY_CODE
from app.agent.intents import INTENTS
from app.agent.protocols import normalize_protocol

router = APIRouter()


class PatientCreate(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone_number: str
    disease_track: str
    protocol: Optional[str] = None
    timezone: Optional[str] = "UTC"
    call_time: Optional[str] = "10:00"
    days_to_monitor: Optional[int] = 30
    diagnosis: Optional[str] = None
    medications_text: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    phone_number: Optional[str] = None
    disease_track: Optional[str] = None
    protocol: Optional[str] = None
    timezone: Optional[str] = None
    call_time: Optional[str] = None
    days_to_monitor: Optional[int] = None
    diagnosis: Optional[str] = None
    medications_text: Optional[str] = None


class PatientOut(BaseModel):
    id: int
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone_number: str
    disease_track: str
    protocol: str
    timezone: Optional[str] = None
    call_time: Optional[str] = None
    days_to_monitor: Optional[int] = None
    active: bool
    risk_score: Optional[float] = None
    diagnosis: Optional[str] = None
    medications_text: Optional[str] = None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _user_from_token(db: Session, token: str) -> User | None:
    if not token:
        return None
    session = db.query(SessionToken).filter(SessionToken.token == token).first()
    if not session or session.expires_at < datetime.now(timezone.utc):
        return None
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.active:
        return None
    return user


def _get_patient_profile_meta(db: Session, patient_id: int) -> dict:
    row = (
        db.query(Intervention)
        .filter(Intervention.patient_id == patient_id, Intervention.type == "patient_profile")
        .order_by(Intervention.created_at.desc())
        .first()
    )
    if not row or not row.note:
        return {}
    try:
        parsed = json.loads(row.note)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _save_patient_profile_meta(db: Session, patient_id: int, diagnosis: Optional[str], medications_text: Optional[str]):
    payload = {
        "diagnosis": diagnosis or "",
        "medications_text": medications_text or ""
    }
    row = Intervention(
        patient_id=patient_id,
        type="patient_profile",
        status="active",
        note=json.dumps(payload),
        risk_before=None,
        risk_after=None
    )
    db.add(row)
    db.commit()


def track_to_protocol(track: str) -> str:
    t = (track or "").lower()
    # Cardiovascular Category
    if any(k in t for k in ["cardio", "mi", "heart attack", "post-mi"]):
        return "POST_MI"
    if any(k in t for k in ["failure", "chf", "hf"]):
        return "HEART_FAILURE"
    if any(k in t for k in ["hypertension", "bp", "blood pressure"]):
        return "HYPERTENSION"
    if any(k in t for k in ["arrhythmia", "palpitation", "afib", "arrhythmia"]):
        return "ARRHYTHMIA"
    
    # Pulmonary Category
    if "copd" in t:
        return "COPD"
    if "asthma" in t:
        return "ASTHMA"
    if "pneumonia" in t:
        return "PNEUMONIA"
    if any(k in t for k in ["pe", "embolism", "pulm"]):
        return "PE"
    if any(k in t for k in ["ild", "covid", "interstitial"]):
        return "ILD_POST_COVID"
    
    # Defaults
    if "pulm" in t: return "COPD"
    if "cardio" in t: return "POST_MI"
    
    return "GENERAL_MONITORING"


def normalize_phone(phone: str) -> str:
    p = (phone or "").strip()
    if p.startswith("+"):
        return p
    if p.isdigit() and len(p) == 10:
        return f"{DEFAULT_COUNTRY_CODE}{p}"
    return p


def _get_zoneinfo(tz_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _compute_next_call(patient: Patient) -> dict:
    tz = _get_zoneinfo(patient.timezone)
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(tz)

    start_date = patient.start_date
    if start_date and start_date.tzinfo is None:
        start_date = start_date.replace(tzinfo=timezone.utc)
    if start_date:
        start_local = start_date.astimezone(tz)
    else:
        start_local = now_local

    end_local = start_local + timedelta(days=patient.days_to_monitor or 30)
    if not patient.active or now_local.date() > end_local.date():
        return {
            "next_call_at": None,
            "days_remaining": 0,
            "monitor_end": end_local.date().isoformat()
        }

    call_time = patient.call_time or "10:00"
    try:
        hour, minute = [int(x) for x in call_time.split(":")]
    except Exception:
        hour, minute = 10, 0

    candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now_local:
        candidate = candidate + timedelta(days=1)

    days_remaining = max(0, (end_local.date() - now_local.date()).days + 1)
    return {
        "next_call_at": candidate.isoformat(),
        "days_remaining": days_remaining,
        "monitor_end": end_local.date().isoformat()
    }


@router.get("/patients", response_model=List[PatientOut])
def list_patients(db: Session = Depends(get_db), user=Depends(get_current_user)):
    patients = db.query(Patient).all()
    results = []
    for p in patients:
        risk = (
            db.query(ReadmissionRisk)
            .filter(ReadmissionRisk.patient_id == p.id)
            .order_by(ReadmissionRisk.created_at.desc())
            .first()
        )
        results.append({
            "id": p.id,
            "name": p.name,
            "age": p.age,
            "gender": p.gender,
            "phone_number": p.phone_number,
            "disease_track": p.disease_track,
            "protocol": p.protocol,
            "timezone": p.timezone,
            "call_time": p.call_time,
            "days_to_monitor": p.days_to_monitor,
            "active": p.active,
            "risk_score": risk.score if risk else None,
            "diagnosis": _get_patient_profile_meta(db, p.id).get("diagnosis"),
            "medications_text": _get_patient_profile_meta(db, p.id).get("medications_text")
        })
    return results


@router.post("/patients", response_model=PatientOut)
def create_patient(payload: PatientCreate, db: Session = Depends(get_db), user=Depends(require_role(["staff"]))):
    protocol = normalize_protocol(payload.protocol or track_to_protocol(payload.disease_track))
    patient = Patient(
        name=payload.name,
        age=payload.age,
        gender=payload.gender,
        phone_number=normalize_phone(payload.phone_number),
        disease_track=payload.disease_track,
        protocol=protocol,
        timezone=payload.timezone,
        call_time=payload.call_time,
        days_to_monitor=payload.days_to_monitor,
        active=True
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    if payload.diagnosis or payload.medications_text:
        _save_patient_profile_meta(db, patient.id, payload.diagnosis, payload.medications_text)
    return {
        "id": patient.id,
        "name": patient.name,
        "age": patient.age,
        "gender": patient.gender,
        "phone_number": patient.phone_number,
        "disease_track": patient.disease_track,
        "protocol": patient.protocol,
        "timezone": patient.timezone,
        "call_time": patient.call_time,
        "days_to_monitor": patient.days_to_monitor,
        "active": patient.active,
        "risk_score": None,
        "diagnosis": payload.diagnosis,
        "medications_text": payload.medications_text
    }


@router.put("/patients/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: int, payload: PatientUpdate, db: Session = Depends(get_db), user=Depends(require_role(["staff", "nurse", "admin"]))):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if payload.name is not None:
        patient.name = payload.name
    if payload.age is not None:
        patient.age = payload.age
    if payload.gender is not None:
        patient.gender = payload.gender
    if payload.phone_number is not None:
        patient.phone_number = normalize_phone(payload.phone_number)
    if payload.disease_track is not None:
        patient.disease_track = payload.disease_track
    if payload.protocol is not None:
        patient.protocol = normalize_protocol(payload.protocol)
    if payload.timezone is not None:
        patient.timezone = payload.timezone
    if payload.call_time is not None:
        patient.call_time = payload.call_time
    if payload.days_to_monitor is not None:
        patient.days_to_monitor = payload.days_to_monitor

    db.commit()
    db.refresh(patient)

    if payload.diagnosis is not None or payload.medications_text is not None:
        existing = _get_patient_profile_meta(db, patient_id)
        _save_patient_profile_meta(
            db,
            patient_id,
            payload.diagnosis if payload.diagnosis is not None else existing.get("diagnosis"),
            payload.medications_text if payload.medications_text is not None else existing.get("medications_text")
        )

    risk = (
        db.query(ReadmissionRisk)
        .filter(ReadmissionRisk.patient_id == patient.id)
        .order_by(ReadmissionRisk.created_at.desc())
        .first()
    )
    profile = _get_patient_profile_meta(db, patient.id)
    return {
        "id": patient.id,
        "name": patient.name,
        "age": patient.age,
        "gender": patient.gender,
        "phone_number": patient.phone_number,
        "disease_track": patient.disease_track,
        "protocol": patient.protocol,
        "timezone": patient.timezone,
        "call_time": patient.call_time,
        "days_to_monitor": patient.days_to_monitor,
        "active": patient.active,
        "risk_score": risk.score if risk else None,
        "diagnosis": profile.get("diagnosis"),
        "medications_text": profile.get("medications_text")
    }


@router.delete("/patients/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db), user=Depends(require_role(["admin", "nurse", "staff"]))):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Remove related care workflow rows first to satisfy FK constraints.
    from app.db.models import CareAssignment, Intervention
    db.query(CareAssignment).filter(CareAssignment.patient_id == patient_id).delete(synchronize_session=False)
    db.query(Intervention).filter(Intervention.patient_id == patient_id).delete(synchronize_session=False)

    call_logs = db.query(CallLog).filter(CallLog.patient_id == patient_id).all()
    log_ids = [l.id for l in call_logs]
    if log_ids:
        db.query(ReadmissionRisk).filter(ReadmissionRisk.call_log_id.in_(log_ids)).delete(synchronize_session=False)
    db.query(CallLog).filter(CallLog.patient_id == patient_id).delete(synchronize_session=False)

    # Remove any patient-level risk rows not tied to a call log.
    db.query(ReadmissionRisk).filter(ReadmissionRisk.patient_id == patient_id).delete(synchronize_session=False)

    calls = db.query(PatientCall).filter(PatientCall.patient_id == str(patient_id)).all()
    call_ids = [c.id for c in calls]
    if call_ids:
        db.query(AgentResponse).filter(AgentResponse.call_id.in_(call_ids)).delete(synchronize_session=False)
    db.query(PatientCall).filter(PatientCall.patient_id == str(patient_id)).delete(synchronize_session=False)

    db.delete(patient)
    db.commit()
    return {"ok": True}


@router.get("/patients/{patient_id}/all-logs")
def patient_logs(patient_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    logs = (
        db.query(CallLog)
        .filter(CallLog.patient_id == patient_id)
        .order_by(CallLog.created_at.asc())
        .all()
    )
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    result = []
    for log in logs:
        risk = (
            db.query(ReadmissionRisk)
            .filter(ReadmissionRisk.call_log_id == log.id)
            .order_by(ReadmissionRisk.created_at.desc())
            .first()
        )
        responses = []
        transcripts = []
        if log.patient_call_id:
            resp_rows = (
                db.query(AgentResponse)
                .filter(AgentResponse.call_id == log.patient_call_id)
                .order_by(AgentResponse.created_at.asc())
                .all()
            )
            review_rows = (
                db.query(AuditEvent)
                .filter(AuditEvent.action.in_(["response_review", "response_correction"]))
                .order_by(AuditEvent.created_at.desc())
                .all()
            )
            review_map = {}
            correction_map = {}
            for row in review_rows:
                meta = row.meta or {}
                if str(meta.get("call_log_id")) != str(log.id):
                    continue
                intent_id = meta.get("intent_id")
                if not intent_id:
                    continue
                if row.action == "response_review" and intent_id not in review_map:
                    review_map[intent_id] = {
                        "label": meta.get("label"),
                        "reason": meta.get("reason") or "",
                        "created_at": row.created_at
                    }
                if row.action == "response_correction" and intent_id not in correction_map:
                    correction_map[intent_id] = {
                        "answer": meta.get("answer"),
                        "trend": meta.get("trend"),
                        "reason": meta.get("reason") or "",
                        "created_at": row.created_at
                    }
            responses = [
                {
                    "intent_id": r.intent_id,
                    "label": INTENTS.get(r.intent_id, {}).get("clinical_meaning") or r.intent_id,
                    "question": (INTENTS.get(r.intent_id, {}).get("allowed_phrases") or [None])[0],
                    "domain": INTENTS.get(r.intent_id, {}).get("domain"),
                    "response_type": INTENTS.get(r.intent_id, {}).get("response_type"),
                    "raw_text": r.raw_text,
                    "structured_data": r.structured_data,
                    "red_flag": r.red_flag,
                    "confidence": r.confidence,
                    "review_status": (
                        "confirmed" if (review_map.get(r.intent_id, {}).get("label") == 1)
                        else "cleared" if (review_map.get(r.intent_id, {}).get("label") == 0)
                        else None
                    ),
                    "review_reason": review_map.get(r.intent_id, {}).get("reason"),
                    "corrected_answer": correction_map.get(r.intent_id, {}).get("answer"),
                    "corrected_trend": correction_map.get(r.intent_id, {}).get("trend"),
                    "corrected_reason": correction_map.get(r.intent_id, {}).get("reason")
                }
                for r in resp_rows
            ]
            transcripts = [r.raw_text for r in resp_rows if r.raw_text]
        explanation = risk.explanation if risk else None
        risk_source = risk.model_version if risk else None
        if isinstance(explanation, str):
            try:
                explanation = json.loads(explanation)
            except Exception:
                explanation = None
        if explanation is None:
            explanation = {"top_factors": []}

        entry = {
            "id": log.id,
            "patient_id": log.patient_id,
            "protocol": patient.protocol if patient else None,
            "created_at": log.created_at,
            "risk_score": log.risk_score,
            "risk_level": log.risk_level,
            "explanation": explanation,
            "risk_source": risk_source or "model",
            "status": log.status,
            "answered": log.answered,
            "transcripts": transcripts,
            "responses": responses,
            "doctor_note": log.doctor_note if user.role in ["doctor", "admin", "nurse"] else None,
            "flow_log": log.flow_log,
            "scheduled_for": log.scheduled_for,
            "started_at": log.started_at,
            "ended_at": log.ended_at
        }
        if user.role == "staff":
            entry["explanation"] = {"top_factors": []}
        result.append(entry)
    return result


class DoctorNoteIn(BaseModel):
    note: str


@router.put("/patients/{patient_id}/logs/{log_id}/note")
def save_doctor_note(patient_id: int, log_id: int, payload: DoctorNoteIn, db: Session = Depends(get_db), user=Depends(require_role(["doctor", "admin"]))):
    log = (
        db.query(CallLog)
        .filter(CallLog.id == log_id, CallLog.patient_id == patient_id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    log.doctor_note = payload.note
    db.commit()
    return {"ok": True}


@router.post("/call/{phone}")
def manual_call(
    phone: str,
    patient_id: Optional[int] = None,
    protocol: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(require_role(["doctor", "staff", "nurse", "admin"]))
):
    if patient_id:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if patient:
            if not protocol:
                protocol = normalize_protocol(patient.protocol or track_to_protocol(patient.disease_track))
            phone = patient.phone_number
    protocol = normalize_protocol(protocol or "GENERAL_MONITORING")
    phone = normalize_phone(phone)
    call_id = f"manual-{int(datetime.utcnow().timestamp())}"
    call = make_call(phone, call_id, patient_id=str(patient_id) if patient_id else None, protocol=protocol)
    if call is None:
        raise HTTPException(status_code=400, detail="Twilio config missing or call failed")

    if patient_id:
        log = CallLog(
            patient_id=patient_id,
            call_sid=getattr(call, "sid", None),
            scheduled_for=datetime.utcnow(),
            started_at=datetime.utcnow(),
            status="in_progress",
            answered=False
        )
        db.add(log)
        db.commit()
    return {"ok": True, "call_id": call_id}


@router.get("/reports/daily")
def daily_report(report_date: Optional[date] = None, db: Session = Depends(get_db)):
    day = report_date or datetime.utcnow().date()
    start = datetime.combine(day, datetime.min.time())
    end = datetime.combine(day, datetime.max.time())

    total = db.query(CallLog).filter(CallLog.created_at.between(start, end)).count()
    answered = db.query(CallLog).filter(
        CallLog.created_at.between(start, end),
        CallLog.answered.is_(True)
    ).count()
    high_risk = db.query(CallLog).filter(
        CallLog.created_at.between(start, end),
        CallLog.risk_level == "high"
    ).count()
    failed = db.query(CallLog).filter(
        CallLog.created_at.between(start, end),
        CallLog.answered.is_(False)
    ).count()

    reminders_scheduled = db.query(MedicationReminder).filter(
        MedicationReminder.scheduled_for.between(start, end)
    ).count()
    reminder_sms_sent = db.query(MedicationReminder).filter(
        MedicationReminder.sms_sent_at != None,
        MedicationReminder.sms_sent_at.between(start, end)
    ).count()
    confirmation_calls = db.query(MedicationReminder).filter(
        MedicationReminder.call_placed_at != None,
        MedicationReminder.call_placed_at.between(start, end)
    ).count()
    confirmation_success = db.query(MedicationReminder).filter(
        MedicationReminder.call_placed_at != None,
        MedicationReminder.call_placed_at.between(start, end),
        MedicationReminder.status == "taken"
    ).count()
    success_rate = 0
    if confirmation_calls:
        success_rate = round((confirmation_success / confirmation_calls) * 100)

    return {
        "date": str(day),
        "total_calls": total,
        "answered_calls": answered,
        "high_risk_calls": high_risk,
        "ivr_calls_day": total,
        "failed_calls": failed,
        "reminders_scheduled": reminders_scheduled,
        "reminder_sms_sent": reminder_sms_sent,
        "confirmation_calls": confirmation_calls,
        "confirmation_success_rate": success_rate
    }


@router.get("/reports/system")
def system_report(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    minute_ago = now - timedelta(minutes=1)

    calls_per_min = (
        db.query(CallLog)
        .filter(CallLog.created_at >= minute_ago)
        .count()
    )

    queue = db.query(CallLog).filter(
        CallLog.status == "scheduled",
        CallLog.scheduled_for.isnot(None),
        CallLog.scheduled_for <= now
    ).count()

    in_progress = db.query(CallLog).filter(CallLog.status == "in_progress").count()
    scheduled_future = db.query(CallLog).filter(
        CallLog.status == "scheduled",
        CallLog.scheduled_for.isnot(None),
        CallLog.scheduled_for > now
    ).count()

    last_success = db.query(CallLog).filter(
        CallLog.ended_at.isnot(None)
    ).order_by(CallLog.ended_at.desc()).first()

    incident = (
        db.query(AuditEvent)
        .filter(AuditEvent.action.in_(["api_failure", "twilio_webhook_error", "ivr_service_restart"]))
        .order_by(AuditEvent.created_at.desc())
        .first()
    )
    system_status = "operational"
    if queue >= 20:
        system_status = "degraded"
    if incident and incident.created_at and (now - incident.created_at) < timedelta(hours=6):
        system_status = "incident"

    return {
        "timestamp": now.isoformat(),
        "ivr_calls_per_minute": calls_per_min,
        "queue_size": queue,
        "active_calls": in_progress,
        "retry_queue_size": queue,
        "twilio_status": "Operational",
        "twilio_checked_at": now.isoformat(),
        "scheduler_running": in_progress + scheduled_future,
        "scheduler_delayed": queue,
        "scheduler_last_success": last_success.ended_at.isoformat() if last_success and last_success.ended_at else None,
        "system_status": system_status,
        "last_incident": incident.created_at.isoformat() if incident and incident.created_at else None
    }


@router.get("/reports/overview")
def overview_report(report_date: Optional[date] = None, db: Session = Depends(get_db)):
    day = report_date or datetime.utcnow().date()
    start = datetime.combine(day, datetime.min.time())
    end = datetime.combine(day, datetime.max.time())

    monitoring_calls = db.query(CallLog).filter(CallLog.created_at.between(start, end)).count()
    sms_sent = db.query(MedicationReminder).filter(
        MedicationReminder.sms_sent_at != None,
        MedicationReminder.sms_sent_at.between(start, end)
    ).count()
    confirmation_calls = db.query(MedicationReminder).filter(
        MedicationReminder.call_placed_at != None,
        MedicationReminder.call_placed_at.between(start, end)
    ).count()

    return {
        "date": str(day),
        "monitoring_calls": monitoring_calls,
        "medication_sms": sms_sent,
        "confirmation_calls": confirmation_calls
    }


@router.get("/scheduler")
def scheduler_view(db: Session = Depends(get_db), user=Depends(get_current_user)):
    patients = db.query(Patient).all()
    results = []
    for p in patients:
        schedule = _compute_next_call(p)
        results.append({
            "id": p.id,
            "name": p.name,
            "phone_number": p.phone_number,
            "protocol": p.protocol,
            "timezone": p.timezone,
            "call_time": p.call_time,
            "next_call_at": schedule["next_call_at"],
            "days_remaining": schedule["days_remaining"],
            "monitor_end": schedule["monitor_end"],
            "active": p.active
        })
    return results


@router.get("/stream/logs")
def stream_logs(
    patient_id: int,
    token: str = Query(default="")
):
    db = SessionLocal()
    try:
        user = _user_from_token(db, token)
    finally:
        db.close()
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    def event_generator():
        last_count = -1
        while True:
            db_local = SessionLocal()
            try:
                logs = (
                    db_local.query(CallLog)
                    .filter(CallLog.patient_id == patient_id)
                    .order_by(CallLog.created_at.asc())
                    .all()
                )
                if len(logs) != last_count:
                    last_count = len(logs)
                    payload = []
                    for log in logs:
                        risk = (
                            db_local.query(ReadmissionRisk)
                            .filter(ReadmissionRisk.call_log_id == log.id)
                            .order_by(ReadmissionRisk.created_at.desc())
                            .first()
                        )
                        explanation = risk.explanation if risk else None
                        risk_source = risk.model_version if risk else None
                        if isinstance(explanation, str):
                            try:
                                explanation = json.loads(explanation)
                            except Exception:
                                explanation = None
                        if explanation is None:
                            explanation = {"top_factors": []}

                        responses = []
                        transcripts = []
                        if log.patient_call_id:
                            resp_rows = (
                                db_local.query(AgentResponse)
                                .filter(AgentResponse.call_id == log.patient_call_id)
                                .order_by(AgentResponse.created_at.asc())
                                .all()
                            )
                            responses = [
                                {
                                    "intent_id": r.intent_id,
                                    "label": INTENTS.get(r.intent_id, {}).get("clinical_meaning") or r.intent_id,
                                    "question": (INTENTS.get(r.intent_id, {}).get("allowed_phrases") or [None])[0],
                                    "domain": INTENTS.get(r.intent_id, {}).get("domain"),
                                    "response_type": INTENTS.get(r.intent_id, {}).get("response_type"),
                                    "raw_text": r.raw_text,
                                    "structured_data": r.structured_data,
                                    "red_flag": r.red_flag,
                                    "confidence": r.confidence
                                }
                                for r in resp_rows
                            ]
                            transcripts = [r.raw_text for r in resp_rows if r.raw_text]

                        entry = {
                            "id": log.id,
                            "protocol": None,
                            "created_at": log.created_at.isoformat() if log.created_at else None,
                            "risk_score": log.risk_score,
                            "risk_level": log.risk_level,
                            "explanation": explanation,
                            "risk_source": risk_source or "model",
                            "status": log.status,
                            "answered": log.answered,
                            "transcripts": transcripts,
                            "responses": responses,
                            "doctor_note": log.doctor_note if user.role in ["doctor", "admin", "nurse"] else None,
                            "flow_log": log.flow_log,
                            "scheduled_for": log.scheduled_for.isoformat() if log.scheduled_for else None,
                            "started_at": log.started_at.isoformat() if log.started_at else None,
                            "ended_at": log.ended_at.isoformat() if log.ended_at else None
                        }
                        if user.role == "staff":
                            entry["explanation"] = {"top_factors": []}
                        payload.append(entry)

                    data = json.dumps(payload)
                    yield f"event: logs\ndata: {data}\n\n"
            finally:
                db_local.close()
            time.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/stream/patients")
def stream_patients(
    token: str = Query(default="")
):
    db = SessionLocal()
    try:
        user = _user_from_token(db, token)
    finally:
        db.close()
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    def event_generator():
        last_signature = ""
        while True:
            db_local = SessionLocal()
            try:
                patients = db_local.query(Patient).all()
                payload = []
                for p in patients:
                    risk = (
                        db_local.query(ReadmissionRisk)
                        .filter(ReadmissionRisk.patient_id == p.id)
                        .order_by(ReadmissionRisk.created_at.desc())
                        .first()
                    )
                    payload.append({
                        "id": p.id,
                        "name": p.name,
                        "phone_number": p.phone_number,
                        "disease_track": p.disease_track,
                        "protocol": p.protocol,
                        "active": p.active,
                        "risk_score": risk.score if risk else None
                    })
                data = json.dumps(payload, sort_keys=True)
                signature = str(hash(data))
                if signature != last_signature:
                    last_signature = signature
                    yield f"event: patients\ndata: {data}\n\n"
            finally:
                db_local.close()
            time.sleep(3)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/stream/scheduler")
def stream_scheduler(
    token: str = Query(default="")
):
    db = SessionLocal()
    try:
        user = _user_from_token(db, token)
    finally:
        db.close()
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    def event_generator():
        last_signature = ""
        while True:
            db_local = SessionLocal()
            try:
                patients = db_local.query(Patient).all()
                payload = []
                for p in patients:
                    schedule = _compute_next_call(p)
                    payload.append({
                        "id": p.id,
                        "name": p.name,
                        "phone_number": p.phone_number,
                        "protocol": p.protocol,
                        "timezone": p.timezone,
                        "call_time": p.call_time,
                        "next_call_at": schedule["next_call_at"],
                        "days_remaining": schedule["days_remaining"],
                        "monitor_end": schedule["monitor_end"],
                        "active": p.active
                    })
                data = json.dumps(payload, sort_keys=True)
                signature = str(hash(data))
                if signature != last_signature:
                    last_signature = signature
                    yield f"event: scheduler\ndata: {data}\n\n"
            finally:
                db_local.close()
            time.sleep(3)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/stream/alerts")
def stream_alerts(
    token: str = Query(default="")
):
    db = SessionLocal()
    try:
        user = _user_from_token(db, token)
    finally:
        db.close()
    if not user or user.role not in ["doctor", "nurse", "admin", "staff"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    def event_generator():
        last_signature = ""
        while True:
            db_local = SessionLocal()
            try:
                logs = (
                    db_local.query(CallLog)
                    .filter(CallLog.risk_level == "high")
                    .order_by(CallLog.created_at.desc())
                    .limit(50)
                    .all()
                )
                payload = []
                for log in logs:
                    patient = db_local.query(Patient).filter(Patient.id == log.patient_id).first()
                    payload.append({
                        "log_id": log.id,
                        "patient_id": log.patient_id,
                        "patient_name": patient.name if patient else None,
                        "protocol": patient.protocol if patient else None,
                        "risk_score": log.risk_score,
                        "created_at": log.created_at.isoformat() if log.created_at else None
                    })
                data = json.dumps(payload, sort_keys=True)
                signature = str(hash(data))
                if signature != last_signature:
                    last_signature = signature
                    yield f"event: alerts\ndata: {data}\n\n"
            finally:
                db_local.close()
            time.sleep(5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/meta/intents")
def intents_meta(user=Depends(get_current_user)):
    payload = {}
    for intent_id, meta in INTENTS.items():
        label = intent_id
        if intent_id.startswith("INTENT_"):
            label = intent_id.split("_", 2)[-1].lower()
        payload[intent_id] = {
            "label": label,
            "question": (meta.get("allowed_phrases") or [None])[0],
            "clinical_meaning": meta.get("clinical_meaning")
        }
    return payload
