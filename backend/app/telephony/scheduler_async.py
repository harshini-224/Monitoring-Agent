import asyncio
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import uuid

from app.db.session import SessionLocal
from app.db.models import Patient, CallLog, MedicationReminder, MedicationEvent
from app.telephony.twilio_client import make_call, make_medication_call, send_sms


def _naive(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _within_monitoring_window(patient: Patient, now: datetime) -> bool:
    if not patient.active:
        return False
    # window check still safe in UTC if patient.start_date is UTC
    start_date = _naive(patient.start_date)
    if start_date is None:
        return True
    end_date = start_date + timedelta(days=patient.days_to_monitor or 30)
    return now <= end_date


def _already_called_today(db, patient_id: int, now_ist: datetime) -> bool:
    # Use IST for "today" calculation
    day_start_ist = datetime(now_ist.year, now_ist.month, now_ist.day, tzinfo=ZoneInfo("Asia/Kolkata"))
    day_end_ist = day_start_ist + timedelta(days=1)
    
    # DB stores as UTC, so we compare with UTC equivalents
    day_start_utc = day_start_ist.astimezone(timezone.utc)
    day_end_utc = day_end_ist.astimezone(timezone.utc)
    
    existing = (
        db.query(CallLog)
        .filter(CallLog.patient_id == patient_id)
        .filter(CallLog.scheduled_for >= day_start_utc, CallLog.scheduled_for < day_end_utc)
        .first()
    )
    return existing is not None


async def scheduler_loop():
    ist = ZoneInfo("Asia/Kolkata")
    while True:
        try:
            now_utc = datetime.now(timezone.utc)
            now_ist = datetime.now(ist)
            db = SessionLocal()
            patients = db.query(Patient).all()

            for patient in patients:
                if not _within_monitoring_window(patient, now_utc.replace(tzinfo=None)):
                    continue

                call_time = patient.call_time or "10:00"
                if now_ist.strftime("%H:%M") != call_time:
                    continue

                if _already_called_today(db, patient.id, now_ist):
                    continue

                call_id = f"scheduled-{uuid.uuid4()}"
                call = make_call(
                    patient.phone_number,
                    call_id,
                    patient_id=str(patient.id),
                    protocol=patient.protocol
                )

                log = CallLog(
                    patient_id=patient.id,
                    call_sid=call.sid if call else None,
                    scheduled_for=now_utc,
                    started_at=now_utc,
                    status="in_progress",
                    answered=False
                )
                db.add(log)
                db.commit()

            cutoff = now_utc - timedelta(hours=2)
            missed = (
                db.query(CallLog)
                .filter(CallLog.status == "in_progress")
                .filter(CallLog.started_at != None)
                .filter(CallLog.started_at < cutoff)
                .filter(CallLog.answered.is_(False))
                .all()
            )
            for log in missed:
                log.status = "no_answer"
                # Flag missed monitoring calls as high risk alert
                log.risk_level = "high"
                log.risk_score = 90.0
            if missed:
                db.commit()

            # Medication reminder flow: SMS at time, IVR call after 10 minutes.
            due_sms = (
                db.query(MedicationReminder)
                .filter(MedicationReminder.status == "scheduled")
                .filter(MedicationReminder.scheduled_for <= now_utc)
                .all()
            )
            for reminder in due_sms:
                patient = db.query(Patient).filter(Patient.id == reminder.patient_id).first()
                if not patient:
                    reminder.status = "no_response"
                    continue
                sms_body = (
                    "CarePulse Reminder\n"
                    f"It\u2019s time to take your {reminder.medication_name}"
                    f"{' ' + reminder.dose if reminder.dose else ''}.\n"
                    "You will receive a confirmation call shortly."
                )
                send_sms(patient.phone_number, sms_body)
                reminder.sms_sent_at = now_utc
                reminder.status = "sms_sent"
                db.add(MedicationEvent(
                    reminder_id=reminder.id,
                    event_type="sms_sent",
                    meta={"phone": patient.phone_number}
                ))
            if due_sms:
                db.commit()

            due_call = (
                db.query(MedicationReminder)
                .filter(MedicationReminder.status == "sms_sent")
                .filter(MedicationReminder.sms_sent_at != None)
                .filter(MedicationReminder.sms_sent_at <= (now_utc - timedelta(minutes=2)))
                .all()
            )
            for reminder in due_call:
                patient = db.query(Patient).filter(Patient.id == reminder.patient_id).first()
                if not patient:
                    reminder.status = "no_response"
                    continue
                call = make_medication_call(patient.phone_number, reminder.id)
                reminder.call_placed_at = now_utc
                reminder.call_sid = call.sid if call else None
                reminder.status = "call_placed"
                db.add(MedicationEvent(
                    reminder_id=reminder.id,
                    event_type="call_placed",
                    meta={"phone": patient.phone_number}
                ))
            if due_call:
                db.commit()

            db.close()
        except Exception as e:
            print(f"[scheduler] error: {e}")

        await asyncio.sleep(60)
