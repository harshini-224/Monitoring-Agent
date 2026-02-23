from app.db.session import SessionLocal
from app.db.models import Patient, AgentResponse, CallLog
from datetime import datetime, date, timezone
import json

def debug_patient_data(name):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.name == name).first()
        if not patient:
            print(f"Patient {name} not found.")
            return
        
        print(f"Patient ID: {patient.id}")
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        
        log = db.query(CallLog).filter(
            CallLog.patient_id == patient.id,
            CallLog.created_at >= today_start
        ).order_by(CallLog.created_at.desc()).first()
        
        if not log:
            print(f"No log for today found for {name}.")
            return
            
        print(f"Latest Log ID: {log.id}, Patient Call ID: {log.patient_call_id}")
        
        responses = db.query(AgentResponse).filter(AgentResponse.call_id == log.patient_call_id).all()
        print(f"Found {len(responses)} responses:")
        for r in responses:
            print(f"- {r.intent_id}: {r.raw_text}")
            
    finally:
        db.close()

if __name__ == "__main__":
    debug_patient_data("Sarah Jenkins")
