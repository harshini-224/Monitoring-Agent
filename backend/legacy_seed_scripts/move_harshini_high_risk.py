from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.models import Patient, PatientCall, AgentResponse, CallLog, ReadmissionRisk
from datetime import datetime
import json

def move_harshini_to_high_risk():
    db = SessionLocal()
    try:
        # Find Harshini
        patient = db.query(Patient).filter(Patient.name == "Harshini").first()
        if not patient:
            print("Patient 'Harshini' not found!")
            return

        print(f"Found patient: {patient.name} (ID: {patient.id})")

        # Today's call (High Risk)
        today = datetime.now()
        pcall = PatientCall(patient_id=str(patient.id), language="en", created_at=today)
        db.add(pcall)
        db.flush()

        # Responses for today (High Risk - Chest Pain & Dyspnea)
        responses = [
            ("chest_pain", "Yes, I have been having severe chest pain since this morning.", True, 99.0),
            ("dyspnea", "I am short of breath even when sitting down.", True, 98.0),
            ("med_adherence", "I took my medications but they don't seem to be helping.", False, 95.0),
            ("symptom_progression", "The pain is getting worse quickly.", True, 97.0)
        ]

        for intent, text, red_flag, conf in responses:
            resp = AgentResponse(
                call_id=pcall.id,
                intent_id=intent,
                raw_text=text,
                structured_data={"present": True, "severity": "high"} if red_flag else {"present": True},
                red_flag=red_flag,
                confidence=conf,
                created_at=today
            )
            db.add(resp)

        # Create Call Log
        log = CallLog(
            patient_id=patient.id,
            patient_call_id=pcall.id,
            status="completed",
            answered=True,
            risk_score=0.92,
            risk_level="high",
            created_at=today
        )
        db.add(log)
        db.flush()

        # Risk Explanation
        expl = {
            "top_factors": [
                {"name": "chest_pain", "impact": 0.40, "value": "severe/consistent"},
                {"name": "dyspnea", "impact": 0.30, "value": "at rest"},
                {"name": "symptom_progression", "impact": 0.20, "value": "worsening"},
                {"name": "red_flags", "impact": 0.10, "value": "multiple present"}
            ]
        }
        
        risk = ReadmissionRisk(
            patient_id=patient.id,
            call_log_id=log.id,
            score=92.0,
            level="high",
            explanation=json.dumps(expl),
            created_at=today
        )
        db.add(risk)

        db.commit()
        print(f"Successfully moved '{patient.name}' to high risk (Scope: 0.92).")
        
    except Exception as e:
        db.rollback()
        print(f"Error updating patient: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    move_harshini_to_high_risk()
