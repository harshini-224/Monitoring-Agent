from app.db.session import SessionLocal
from app.db.models import Patient, AgentResponse, CallLog, PatientCall, ReadmissionRisk
from datetime import datetime, date, timezone
import json

def update_to_short_responses():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        
        patient_names = ["Sarah Jenkins", "Robert Miller", "David Thompson"]
        patients = db.query(Patient).filter(Patient.name.in_(patient_names)).all()
        
        for p in patients:
            print(f"Updating {p.name} with short realistic responses")
            # Find latest call log for today
            log = db.query(CallLog).filter(CallLog.patient_id == p.id, CallLog.created_at >= today_start).order_by(CallLog.created_at.desc()).first()
            
            if log and log.patient_call_id:
                # Clear existing responses for this call
                db.query(AgentResponse).filter(AgentResponse.call_id == log.patient_call_id).delete()
                
                short_responses = []
                if p.name == "Sarah Jenkins":
                    short_responses = [
                        ("INTENT_8_WEIGHT_GAIN", "Yes, I'm up 5 pounds since Monday and my ankles are swollen.", True),
                        ("INTENT_4_WORSENING_DYSPNEA", "I can't breathe lying down, I need 4 pillows now.", True),
                        ("INTENT_14_MED_ADHERENCE", "Yes, I'm taking all my heart medications daily.", False)
                    ]
                elif p.name == "Robert Miller":
                    short_responses = [
                        ("INTENT_1_CHEST_PAIN", "It's heavy pressure in the center, like a squeezing feeling.", True),
                        ("INTENT_4_WORSENING_DYSPNEA", "Yes, I'm very short of breath even while resting.", True),
                        ("INTENT_14_MED_ADHERENCE", "I've started taking them but the pain is making it hard.", False)
                    ]
                elif p.name == "David Thompson":
                    short_responses = [
                        ("INTENT_22_FEVER", "My temp is 101.8 and I've been having chills all day.", True),
                        ("INTENT_20_COUGH", "A bit of a dry cough, but the incision pain is worse.", False),
                        ("INTENT_17_BREATHING_TREND", "It's been getting harder to breathe since this morning.", True)
                    ]
                
                for intent, text, red_flag in short_responses:
                    db.add(AgentResponse(
                        call_id=log.patient_call_id,
                        intent_id=intent,
                        raw_text=text,
                        red_flag=red_flag,
                        confidence=99.0,
                        created_at=now
                    ))
        
        db.commit()
        print("Updated to short, high-impact responses.")
    finally:
        db.close()

if __name__ == "__main__":
    update_to_short_responses()
