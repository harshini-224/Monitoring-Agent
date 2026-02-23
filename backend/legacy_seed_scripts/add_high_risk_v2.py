from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.models import Patient, PatientCall, AgentResponse, CallLog, ReadmissionRisk, AlertAction, User
from datetime import datetime, timedelta
import random
import json

def seed_high_risk_patients():
    db = SessionLocal()
    try:
        # Get a doctor for historical notes
        doctor = db.query(User).filter(User.role == "doctor").first()
        doctor_id = doctor.id if doctor else 1

        # 1. Sarah Jenkins - Heart Failure worsening
        p1 = Patient(
            name="Sarah Jenkins",
            age=72,
            gender="Female",
            phone_number="+15550101",
            disease_track="Heart Failure",
            protocol="HF_MONITOR",
            active=True
        )
        db.add(p1)
        db.flush()

        # Yesterday's call (Stable)
        yesterday = datetime.now() - timedelta(days=1)
        pcall_y1 = PatientCall(patient_id=str(p1.id), language="en", created_at=yesterday)
        db.add(pcall_y1)
        db.flush()

        log_y1 = CallLog(
            patient_id=p1.id,
            patient_call_id=pcall_y1.id,
            status="completed",
            answered=True,
            risk_score=0.45,
            risk_level="medium",
            created_at=yesterday
        )
        db.add(log_y1)
        db.flush()

        # Today's call (Worsening - High Risk)
        today = datetime.now()
        pcall_t1 = PatientCall(patient_id=str(p1.id), language="en", created_at=today)
        db.add(pcall_t1)
        db.flush()

        # Responses for today (Very clear worsening)
        responses1 = [
            ("weight_gain", "Yes, I have gained about 5 pounds since Monday.", True, 98.0),
            ("dyspnea", "It has been very hard to breathe, especially when I lie down.", True, 99.0),
            ("med_adherence", "Yes, I am taking all my pills as prescribed.", False, 95.0),
            ("symptom_progression", "The swelling in my legs is much worse today.", True, 97.0)
        ]

        for intent, text, red_flag, conf in responses1:
            resp = AgentResponse(
                call_id=pcall_t1.id,
                intent_id=intent,
                raw_text=text,
                structured_data={"present": True, "severity": "high"} if red_flag else {"present": True},
                red_flag=red_flag,
                confidence=conf,
                created_at=today
            )
            db.add(resp)

        log_t1 = CallLog(
            patient_id=p1.id,
            patient_call_id=pcall_t1.id,
            status="completed",
            answered=True,
            risk_score=0.88,
            risk_level="high",
            created_at=today
        )
        db.add(log_t1)
        db.flush()

        # Risk Explanation for Sarah
        expl1 = {
            "top_factors": [
                {"name": "weight_gain", "impact": 0.35, "value": "5 lbs"},
                {"name": "dyspnea", "impact": 0.28, "value": "severe"},
                {"name": "symptom_progression", "impact": 0.15, "value": "worsening swelling"},
                {"name": "med_adherence", "impact": -0.10, "value": "adherent"}
            ]
        }
        risk1 = ReadmissionRisk(
            patient_id=p1.id,
            call_log_id=log_t1.id,
            score=88.0,
            level="high",
            explanation=json.dumps(expl1),
            created_at=today
        )
        db.add(risk1)

        # 2. Robert Miller - Post-MI Red Flags
        p2 = Patient(
            name="Robert Miller",
            age=65,
            gender="Male",
            phone_number="+15550202",
            disease_track="Post-MI",
            protocol="POST_MI",
            active=True
        )
        db.add(p2)
        db.flush()

        # Today's call (Critical - Red Flags)
        pcall_t2 = PatientCall(patient_id=str(p2.id), language="en", created_at=today)
        db.add(pcall_t2)
        db.flush()

        # Responses for today (Critical)
        responses2 = [
            ("chest_pain", "Yes, I have a crushing feeling in my chest for the last hour.", True, 99.5),
            ("dyspnea", "I am feeling quite short of breath.", True, 96.0),
            ("fatigue", "I feel very weak and a bit nauseous.", True, 94.0),
            ("symptom_progression", "This pain is new and getting worse.", True, 98.0)
        ]

        for intent, text, red_flag, conf in responses2:
            resp = AgentResponse(
                call_id=pcall_t2.id,
                intent_id=intent,
                raw_text=text,
                structured_data={"present": True, "severity": "critical"},
                red_flag=red_flag,
                confidence=conf,
                created_at=today
            )
            db.add(resp)

        log_t2 = CallLog(
            patient_id=p2.id,
            patient_call_id=pcall_t2.id,
            status="completed",
            answered=True,
            risk_score=0.95,
            risk_level="high",
            created_at=today
        )
        db.add(log_t2)
        db.flush()

        # Risk Explanation for Robert
        expl2 = {
            "top_factors": [
                {"name": "chest_pain", "impact": 0.45, "value": "crushing/new"},
                {"name": "fatigue", "impact": 0.20, "value": "nausea/weakness"},
                {"name": "dyspnea", "impact": 0.18, "value": "present"},
                {"name": "symptom_progression", "impact": 0.12, "value": "acute onset"}
            ]
        }
        risk2 = ReadmissionRisk(
            patient_id=p2.id,
            call_log_id=log_t2.id,
            score=95.0,
            level="high",
            explanation=json.dumps(expl2),
            created_at=today
        )
        db.add(risk2)

        # Historical note for context (e.g. from 2 days ago)
        two_days_ago = datetime.now() - timedelta(days=2)
        db.add(AlertAction(
            call_log_id=log_y1.id, # Using Sarah's log from yesterday for simplicity
            patient_id=p1.id,
            risk_score=45.0,
            action="confirmed",
            doctor_note="Patient was stable, advised to continue monitoring weight.",
            doctor_id=doctor_id,
            created_at=two_days_ago
        ))

        db.commit()
        print("Successfully added 2 high-risk patients with correct IVR responses.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed_high_risk_patients()
