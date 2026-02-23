from app.db.session import SessionLocal
from app.db.models import Patient, CallLog, AlertAction, ReadmissionRisk, AgentResponse
from datetime import datetime, date, timezone

def cleanup_and_keep_new():
    db = SessionLocal()
    try:
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        keep_names = ["Sarah Jenkins", "Robert Miller"]
        
        # Find patients to remove (those who are high risk today but NOT in our keep list)
        to_remove = (
            db.query(Patient)
            .join(CallLog, CallLog.patient_id == Patient.id)
            .filter(
                CallLog.risk_score >= 0.7,
                CallLog.created_at >= today_start,
                Patient.name.notin_(keep_names)
            )
            .all()
        )
        
        for patient in to_remove:
            print(f"Removing other high-risk patient: {patient.name}")
            # Simplified cleanup for these
            p_id = patient.id
            db.query(AlertAction).filter(AlertAction.patient_id == p_id).delete()
            db.query(ReadmissionRisk).filter(ReadmissionRisk.patient_id == p_id).delete()
            
            call_logs = db.query(CallLog).filter(CallLog.patient_id == p_id).all()
            for log in call_logs:
                if log.patient_call_id:
                    db.query(AgentResponse).filter(AgentResponse.call_id == log.patient_call_id).delete()
            
            db.query(CallLog).filter(CallLog.patient_id == p_id).delete()
            db.query(Patient).filter(Patient.id == p_id).delete()
            
        db.commit()
        print("Cleanup complete. Only Sarah and Robert should remain as high alerts for today.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_and_keep_new()
