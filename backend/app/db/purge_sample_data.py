from __future__ import annotations

import argparse
import json
from typing import Iterable

from sqlalchemy import or_

from app.db.models import (
    AgentResponse,
    AuditEvent,
    CallLog,
    CareAssignment,
    Intervention,
    MedicationEvent,
    MedicationReminder,
    Patient,
    PatientCall,
    ReadmissionRisk,
    SessionToken,
    User,
)
from app.db.session import SessionLocal


DEMO_PATIENT_NAMES = {
    "Asha Rao",
    "Kunal Mehta",
    "Divya Singh",
    "Rohan Iyer",
    "Meera Nair",
    "Arjun Shah",
    "Neha Kapoor",
    "Vikram Joshi",
    "Priya Menon",
    "Sahil Verma",
    "Ananya Gupta",
    "Rahul Desai",
    "Ishita Patel",
    "Nikhil Bansal",
    "Sanya Malhotra",
}

DEMO_USER_EMAILS = {
    "admin@demo.local",
    "priya.rao@carepulse.org",
    "apatel@carepulse.org",
    "lgomez@carepulse.org",
    "mchen@carepulse.org",
    "hsingh@carepulse.org",
}

DEMO_PHONE_PREFIX = "+919900000"


def _to_int_set(values: Iterable[int]) -> set[int]:
    return {int(v) for v in values if v is not None}


def collect_demo_ids(db) -> tuple[set[int], set[int], set[int], set[int], set[int]]:
    patient_ids = _to_int_set(
        row.id
        for row in db.query(Patient.id).filter(
            or_(
                Patient.name.in_(DEMO_PATIENT_NAMES),
                Patient.phone_number.like(f"{DEMO_PHONE_PREFIX}%"),
            )
        )
    )

    patient_ids |= _to_int_set(
        row.patient_id
        for row in db.query(CallLog.patient_id).filter(CallLog.call_sid.like("demo-%"))
        if row.patient_id is not None
    )

    call_log_ids = _to_int_set(
        row.id
        for row in db.query(CallLog.id).filter(
            or_(
                CallLog.patient_id.in_(patient_ids) if patient_ids else False,
                CallLog.call_sid.like("demo-%"),
            )
        )
    )

    patient_call_ids = _to_int_set(
        row.patient_call_id
        for row in db.query(CallLog.patient_call_id).filter(CallLog.id.in_(call_log_ids))
        if row.patient_call_id is not None
    )

    if patient_ids:
        str_ids = [str(pid) for pid in patient_ids]
        patient_call_ids |= _to_int_set(
            row.id for row in db.query(PatientCall.id).filter(PatientCall.patient_id.in_(str_ids))
        )

    reminder_ids = _to_int_set(
        row.id
        for row in db.query(MedicationReminder.id).filter(
            MedicationReminder.patient_id.in_(patient_ids) if patient_ids else False
        )
    )

    demo_user_ids = _to_int_set(
        row.id for row in db.query(User.id).filter(User.email.in_(DEMO_USER_EMAILS))
    )

    return patient_ids, call_log_ids, patient_call_ids, reminder_ids, demo_user_ids


def purge_sample_data(dry_run: bool = False) -> dict:
    db = SessionLocal()
    try:
        patient_ids, call_log_ids, patient_call_ids, reminder_ids, demo_user_ids = collect_demo_ids(db)

        summary = {
            "dry_run": dry_run,
            "patients": len(patient_ids),
            "call_logs": len(call_log_ids),
            "patient_calls": len(patient_call_ids),
            "medication_reminders": len(reminder_ids),
            "demo_users": len(demo_user_ids),
            "deleted": {},
        }

        if dry_run:
            return summary

        deleted = summary["deleted"]

        if reminder_ids:
            deleted["medication_events"] = (
                db.query(MedicationEvent)
                .filter(MedicationEvent.reminder_id.in_(reminder_ids))
                .delete(synchronize_session=False)
            )
            deleted["medication_reminders"] = (
                db.query(MedicationReminder)
                .filter(MedicationReminder.id.in_(reminder_ids))
                .delete(synchronize_session=False)
            )
        else:
            deleted["medication_events"] = 0
            deleted["medication_reminders"] = 0

        if patient_ids:
            deleted["care_assignments"] = (
                db.query(CareAssignment)
                .filter(CareAssignment.patient_id.in_(patient_ids))
                .delete(synchronize_session=False)
            )
            deleted["interventions"] = (
                db.query(Intervention)
                .filter(Intervention.patient_id.in_(patient_ids))
                .delete(synchronize_session=False)
            )
        else:
            deleted["care_assignments"] = 0
            deleted["interventions"] = 0

        if call_log_ids or patient_ids:
            risk_filters = []
            if call_log_ids:
                risk_filters.append(ReadmissionRisk.call_log_id.in_(call_log_ids))
            if patient_ids:
                risk_filters.append(ReadmissionRisk.patient_id.in_(patient_ids))
            deleted["readmission_risks"] = (
                db.query(ReadmissionRisk)
                .filter(or_(*risk_filters))
                .delete(synchronize_session=False)
            )
        else:
            deleted["readmission_risks"] = 0

        if patient_call_ids:
            deleted["agent_responses"] = (
                db.query(AgentResponse)
                .filter(AgentResponse.call_id.in_(patient_call_ids))
                .delete(synchronize_session=False)
            )
        else:
            deleted["agent_responses"] = 0

        if call_log_ids:
            deleted["call_logs"] = (
                db.query(CallLog)
                .filter(CallLog.id.in_(call_log_ids))
                .delete(synchronize_session=False)
            )
        else:
            deleted["call_logs"] = 0

        if patient_call_ids:
            deleted["patient_calls"] = (
                db.query(PatientCall)
                .filter(PatientCall.id.in_(patient_call_ids))
                .delete(synchronize_session=False)
            )
        else:
            deleted["patient_calls"] = 0

        if patient_ids:
            str_ids = [str(pid) for pid in patient_ids]
            deleted["orphan_patient_calls"] = (
                db.query(PatientCall)
                .filter(PatientCall.patient_id.in_(str_ids))
                .delete(synchronize_session=False)
            )
            deleted["patients"] = (
                db.query(Patient)
                .filter(Patient.id.in_(patient_ids))
                .delete(synchronize_session=False)
            )
        else:
            deleted["orphan_patient_calls"] = 0
            deleted["patients"] = 0

        if demo_user_ids:
            deleted["session_tokens"] = (
                db.query(SessionToken)
                .filter(SessionToken.user_id.in_(demo_user_ids))
                .delete(synchronize_session=False)
            )
            deleted["audit_events"] = (
                db.query(AuditEvent)
                .filter(AuditEvent.user_id.in_(demo_user_ids))
                .delete(synchronize_session=False)
            )
            deleted["users"] = (
                db.query(User)
                .filter(User.id.in_(demo_user_ids), User.email.in_(DEMO_USER_EMAILS))
                .delete(synchronize_session=False)
            )
        else:
            deleted["session_tokens"] = 0
            deleted["audit_events"] = 0
            deleted["users"] = 0

        db.commit()
        return summary
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove demo/sample seeded data from database.")
    parser.add_argument("--dry-run", action="store_true", help="Only report rows that would be removed.")
    args = parser.parse_args()

    summary = purge_sample_data(dry_run=args.dry_run)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
