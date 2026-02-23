from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.db.session import SessionLocal
from app.db.models import (
    Patient,
    CallLog,
    ReadmissionRisk,
    PatientCall,
    AgentResponse,
    User,
    AuditEvent,
    MedicationReminder,
)


def _risk_level(score: float) -> str:
    if score >= 65:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _intent_payload(intent_id: str, response_type: str, rng: random.Random) -> tuple[dict, str, bool]:
    if response_type == "yes_no":
        answer = rng.choice(["yes", "no"])
        structured = {"answer": answer, "present": answer == "yes"}
        raw_text = "Yes" if answer == "yes" else "No"
        return structured, raw_text, answer == "yes"
    if response_type == "trend":
        trend = rng.choice(["better", "same", "worse"])
        structured = {"trend": trend}
        raw_text = trend.capitalize()
        return structured, raw_text, trend == "worse"
    structured = {}
    raw_text = "OK"
    return structured, raw_text, False


def _seed_user(db: Session) -> User:
    user = db.query(User).filter(User.email == "admin@demo.local").first()
    if user:
        return user
    user = User(
        name="Demo Admin",
        email="admin@demo.local",
        password_hash=hash_password("admin123"),
        role="admin",
        active=True,
        department="IT Administration",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def seed_dummy_data(days: int = 15, patients: int = 10, seed: int = 42) -> dict:
    rng = random.Random(seed)
    db = SessionLocal()
    try:
        demo_names = [
            "Asha Rao", "Kunal Mehta", "Divya Singh", "Rohan Iyer", "Meera Nair",
            "Arjun Shah", "Neha Kapoor", "Vikram Joshi", "Priya Menon", "Sahil Verma",
            "Ananya Gupta", "Rahul Desai", "Ishita Patel", "Nikhil Bansal", "Sanya Malhotra"
        ]
        existing = db.query(Patient).order_by(Patient.id.asc()).all()
        patient_rows: list[Patient] = []
        if existing:
            for idx, patient in enumerate(existing):
                patient.name = demo_names[idx % len(demo_names)]
            db.commit()
            patient_rows = existing
        else:
            admin = _seed_user(db)
            today = datetime.now(timezone.utc).date()
            start_day = today - timedelta(days=days - 1)
            for i in range(patients):
                start_date = datetime.combine(start_day, datetime.min.time(), tzinfo=timezone.utc)
                patient_rows.append(
                    Patient(
                        name=demo_names[i % len(demo_names)],
                        age=rng.randint(35, 78),
                        gender=rng.choice(["male", "female"]),
                        phone_number=f"+919900000{100 + i}",
                        disease_track=rng.choice(["cardiac", "pulmonary", "general"]),
                        protocol=rng.choice(["POST_MI", "COPD", "GENERAL_MONITORING"]),
                        timezone="UTC",
                        call_time=rng.choice(["09:30", "10:00", "11:15"]),
                        start_date=start_date,
                        days_to_monitor=30,
                        active=True,
                        created_at=start_date,
                    )
                )
            db.add_all(patient_rows)
            db.commit()

        admin = _seed_user(db)

        today = datetime.now(timezone.utc).date()
        start_day = today - timedelta(days=days - 1)

        if not db.query(CallLog).first():
            patient_rows = patient_rows or []
            intent_bank = [
                ("INTENT_1_CHEST_PAIN", "yes_no"),
                ("INTENT_4_WORSENING_DYSPNEA", "trend"),
                ("INTENT_11_FATIGUE", "yes_no"),
                ("INTENT_14_MED_ADHERENCE", "yes_no"),
                ("INTENT_25_OVERALL_HEALTH", "trend"),
            ]

            for patient in patient_rows:
                for day_offset in range(days):
                    day = start_day + timedelta(days=day_offset)
                    scheduled_for = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(
                        hours=9 + rng.randint(0, 2),
                        minutes=rng.choice([0, 15, 30, 45]),
                    )
                    started_at = scheduled_for + timedelta(minutes=rng.randint(1, 12))
                    ended_at = started_at + timedelta(minutes=rng.randint(2, 6))

                    patient_call = PatientCall(
                        patient_id=str(patient.id),
                        diagnosis=patient.disease_track,
                        language="en",
                        consent_given=True,
                        created_at=started_at,
                    )
                    db.add(patient_call)
                    db.flush()

                    responses: list[AgentResponse] = []
                    red_flag_hit = False
                    for intent_id, response_type in intent_bank:
                        structured, raw_text, is_red = _intent_payload(intent_id, response_type, rng)
                        red_flag = bool(is_red) and intent_id != "INTENT_11_FATIGUE"
                        red_flag_hit = red_flag_hit or red_flag
                        responses.append(
                            AgentResponse(
                                call_id=patient_call.id,
                                intent_id=intent_id,
                                raw_text=raw_text,
                                structured_data=structured,
                                red_flag=red_flag,
                                confidence=rng.uniform(70, 98),
                                created_at=started_at + timedelta(seconds=rng.randint(5, 120)),
                            )
                        )
                    db.add_all(responses)

                    base_score = rng.uniform(25, 85)
                    if red_flag_hit:
                        base_score = max(base_score, rng.uniform(65, 92))
                    risk_score = round(base_score, 2)
                    risk_level = _risk_level(risk_score)

                    answered = rng.choice([True, True, True, False])
                    status = "completed" if answered else "no_answer"
                    log = CallLog(
                        patient_id=patient.id,
                        patient_call_id=patient_call.id,
                        call_sid=f"demo-{patient.id}-{day_offset + 1}",
                        scheduled_for=scheduled_for,
                        started_at=started_at,
                        ended_at=ended_at,
                        status=status,
                        answered=answered,
                        risk_score=risk_score if answered else None,
                        risk_level=risk_level if answered else None,
                        doctor_note=rng.choice(["", "Stable today.", "Monitor chest pain.", "Increase hydration."]).strip(),
                        flow_log={"steps": ["dial", "connected", "check-in", "completed"]},
                        created_at=started_at,
                    )
                    db.add(log)
                    db.flush()

                    if answered:
                        risk = ReadmissionRisk(
                            patient_id=patient.id,
                            call_log_id=log.id,
                            score=risk_score,
                            level=risk_level,
                            model_version="baseline",
                            explanation={
                                "top_factors": [
                                    {"feature": "chest_pain_score", "label": "Chest pain", "impact": 0.4, "direction": "increase"},
                                    {"feature": "med_adherence", "label": "Medication adherence", "impact": -0.2, "direction": "decrease"},
                                ]
                            },
                            created_at=started_at + timedelta(seconds=30),
                        )
                        db.add(risk)

                    if day_offset % 4 == 0:
                        review_intent = rng.choice(intent_bank)[0]
                        audit = AuditEvent(
                            user_id=admin.id,
                            action="response_review",
                            meta={
                                "patient_id": patient.id,
                                "call_log_id": log.id,
                                "intent_id": review_intent,
                                "label": rng.choice([0, 1]),
                                "reason": rng.choice(["auto-review", "clinician check"]),
                            },
                            created_at=ended_at + timedelta(minutes=5),
                        )
                        db.add(audit)

                    if day_offset % 7 == 0:
                        correction_intent = "INTENT_25_OVERALL_HEALTH"
                        audit = AuditEvent(
                            user_id=admin.id,
                            action="response_correction",
                            meta={
                                "patient_id": patient.id,
                                "call_log_id": log.id,
                                "intent_id": correction_intent,
                                "response_type": "trend",
                                "answer": None,
                                "trend": rng.choice(["better", "same", "worse"]),
                                "reason": "clarified by nurse",
                            },
                            created_at=ended_at + timedelta(minutes=8),
                        )
                        db.add(audit)

        if not db.query(User).filter(User.email != "admin@demo.local").first():
            extra_users = [
                ("Priya Rao", "priya.rao@carepulse.org", "admin", True, "IT Administration"),
                ("Amina Patel", "apatel@carepulse.org", "doctor", True, "Cardiology"),
                ("Leah Gomez", "lgomez@carepulse.org", "nurse", True, "ICU"),
                ("Marcus Chen", "mchen@carepulse.org", "staff", True, "Administration"),
                ("Harish Singh", "hsingh@carepulse.org", "staff", False, "Operations"),
            ]
            for name, email, role, active, department in extra_users:
                if db.query(User).filter(User.email == email).first():
                    continue
                db.add(User(
                    name=name,
                    email=email,
                    password_hash=hash_password("welcome123"),
                    role=role,
                    active=active,
                    department=department
                ))
            db.commit()

        users = db.query(User).all()
        for u in users:
            if not db.query(AuditEvent).filter(AuditEvent.user_id == u.id, AuditEvent.action == "user_login").first():
                db.add(AuditEvent(
                    user_id=u.id,
                    action="user_login",
                    meta={"user_name": u.name, "role": u.role, "email": u.email},
                    created_at=datetime.now(timezone.utc) - timedelta(minutes=rng.randint(5, 240))
                ))
        db.commit()

        if not db.query(MedicationReminder).first() and patient_rows:
            for patient in patient_rows[: min(6, len(patient_rows))]:
                scheduled_for = datetime.now(timezone.utc) + timedelta(hours=rng.randint(-4, 4))
                status = rng.choice(["scheduled", "sms_sent", "call_placed", "taken", "missed"])
                sms_sent_at = scheduled_for - timedelta(minutes=30) if status in ["sms_sent", "call_placed", "taken"] else None
                call_placed_at = scheduled_for if status in ["call_placed", "taken", "missed"] else None
                reminder = MedicationReminder(
                    patient_id=patient.id,
                    medication_name=rng.choice(["Atorvastatin", "Metformin", "Lisinopril"]),
                    dose=rng.choice(["10mg", "20mg", "5mg"]),
                    scheduled_for=scheduled_for,
                    sms_sent_at=sms_sent_at,
                    call_placed_at=call_placed_at,
                    status=status
                )
                db.add(reminder)
            db.commit()

        system_actions = ["ivr_service_restart", "scheduler_delay", "api_failure", "twilio_webhook_error"]
        if not db.query(AuditEvent).filter(AuditEvent.action.in_(system_actions)).first():
            for action in system_actions:
                db.add(AuditEvent(
                    user_id=admin.id,
                    action=action,
                    meta={"service": "IVR", "source": "Scheduler", "impact": "staff"},
                    created_at=datetime.now(timezone.utc) - timedelta(hours=rng.randint(1, 24))
                ))
            db.commit()

        db.commit()
        return {"ok": True, "skipped": False}
    finally:
        db.close()


if __name__ == "__main__":
    result = seed_dummy_data()
    print(result)
