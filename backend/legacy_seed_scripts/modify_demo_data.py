from app.db.session import SessionLocal
from app.db.models import (
    Patient, CallLog, AgentResponse, ReadmissionRisk, AlertAction, 
    MedicationReminder, CareAssignment, NurseCallAssignment, 
    ResponseCorrection, Intervention, Notification, PatientCall, User
)
from datetime import datetime, timedelta
import json

def modify_demo_data():
    db = SessionLocal()
    try:
        # 1. Remove Rajesh Kumar (ID 85)
        p_id = 85
        patient = db.query(Patient).filter(Patient.id == p_id).first()
        if patient:
            print(f"Removing patient: {patient.name} (ID: {patient.id})")
            
            # Delete in order of constraints
            db.query(Notification).filter(Notification.related_patient_id == p_id).delete()
            db.query(NurseCallAssignment).filter(NurseCallAssignment.patient_id == p_id).delete()
            db.query(AlertAction).filter(AlertAction.patient_id == p_id).delete()
            db.query(ReadmissionRisk).filter(ReadmissionRisk.patient_id == p_id).delete()
            db.query(ResponseCorrection).filter(ResponseCorrection.patient_id == p_id).delete()
            db.query(MedicationReminder).filter(MedicationReminder.patient_id == p_id).delete()
            db.query(CareAssignment).filter(CareAssignment.patient_id == p_id).delete()
            db.query(Intervention).filter(Intervention.patient_id == p_id).delete()
            
            # Call logs and agent responses
            call_logs = db.query(CallLog).filter(CallLog.patient_id == p_id).all()
            log_ids = [log.id for log in call_logs]
            
            if log_ids:
                call_ids = [log.patient_call_id for log in call_logs if log.patient_call_id]
                if call_ids:
                    db.query(AgentResponse).filter(AgentResponse.call_id.in_(call_ids)).delete(synchronize_session=False)
                
                db.query(CallLog).filter(CallLog.id.in_(log_ids)).delete(synchronize_session=False)

                if call_ids:
                    db.query(PatientCall).filter(PatientCall.id.in_(call_ids)).delete(synchronize_session=False)
            
            # Delete patient
            db.query(Patient).filter(Patient.id == p_id).delete()
            print("Successfully removed Rajesh Kumar.")
        else:
            print("Rajesh Kumar (ID 85) not found.")

        # 2. Add Anita Sharma (Low Risk)
        print("Adding Anita Sharma (Low Risk)...")
        new_patient = Patient(
            name="Anita Sharma",
            age=55,
            gender="Female",
            phone_number="+15550303",
            disease_track="Post-MI",
            protocol="POST_MI",
            active=True
        )
        db.add(new_patient)
        db.flush()

        today = datetime.now()
        pcall = PatientCall(patient_id=str(new_patient.id), language="en", created_at=today)
        db.add(pcall)
        db.flush()

        # Low-risk responses
        responses = [
            ("chest_pain", "No, I haven't had any chest pain today.", False, 98.0),
            ("dyspnea", "My breathing is fine, much better than last week.", False, 95.5),
            ("med_adherence", "Yes, I am taking all my medications on time.", False, 99.0),
            ("fatigue", "I feel good, I went for a short walk today.", False, 92.0)
        ]

        for intent, text, red_flag, conf in responses:
            resp = AgentResponse(
                call_id=pcall.id,
                intent_id=intent,
                raw_text=text,
                structured_data={"present": False},
                red_flag=red_flag,
                confidence=conf,
                created_at=today
            )
            db.add(resp)

        log = CallLog(
            patient_id=new_patient.id,
            patient_call_id=pcall.id,
            status="completed",
            answered=True,
            risk_score=0.25,
            risk_level="low",
            created_at=today
        )
        db.add(log)
        db.flush()

        # Risk Explanation for Anita
        expl = {
            "top_factors": [
                {"name": "med_adherence", "impact": -0.15, "value": "100% compliant"},
                {"name": "chest_pain", "impact": -0.10, "value": "absent"},
                {"name": "dyspnea", "impact": -0.05, "value": "stable"},
                {"name": "activity_level", "impact": -0.05, "value": "improving"}
            ]
        }
        risk = ReadmissionRisk(
            patient_id=new_patient.id,
            call_log_id=log.id,
            score=25.0,
            level="low",
            explanation=json.dumps(expl),
            created_at=today
        )
        db.add(risk)

        db.commit()
        print(f"Successfully added Anita Sharma (ID: {new_patient.id}) as low-risk.")

    except Exception as e:
        db.rollback()
        print(f"Error modifying data: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    modify_demo_data()
