from app.db.session import SessionLocal
from app.db.models import Patient, AgentResponse, CallLog, PatientCall, ReadmissionRisk, AlertAction, User
from app.agent.protocols import get_protocol_intents
from datetime import datetime, date, timezone, timedelta
import json

def update_all_questions_and_notes():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        yesterday = now - timedelta(days=1)
        
        # Get a doctor for notes
        doctor = db.query(User).filter(User.role == "doctor").first()
        doctor_id = doctor.id if doctor else 1

        patient_names = ["Sarah Jenkins", "Robert Miller", "David Thompson"]
        patients = db.query(Patient).filter(Patient.name.in_(patient_names)).all()
        
        for p in patients:
            print(f"Updating {p.name} - Adding previous notes and full response set")
            
            # 1. Add a meaningful previous note/action from yesterday if not exists
            existing_note = db.query(AlertAction).filter(AlertAction.patient_id == p.id).first()
            if not existing_note:
                action = AlertAction(
                    call_log_id=0, # Placeholder or link to a past log if exists
                    patient_id=p.id,
                    risk_score=0.45,
                    action="confirmed",
                    doctor_note=f"Initial assessment for {p.name}. Stable but advised to report any new symptoms immediately.",
                    doctor_id=doctor_id,
                    created_at=yesterday
                )
                db.add(action)

            # 2. Get all protocol intents and provide responses
            intents = get_protocol_intents(p.protocol)
            
            # Find today's latest call log
            log = db.query(CallLog).filter(CallLog.patient_id == p.id, CallLog.created_at >= today_start).order_by(CallLog.created_at.desc()).first()
            
            if log and log.patient_call_id:
                # Clear existing responses
                db.query(AgentResponse).filter(AgentResponse.call_id == log.patient_call_id).delete()
                
                for intent in intents:
                    # Skip intro/outro
                    if intent in ["INTENT_0_DAILY_CHECKIN", "INTENT_29_SAFETY_CLOSE"]:
                        continue
                        
                    text = "No specific issues reported for this item."
                    red_flag = False
                    
                    # Custom logic for "High Impact" responses for the primary risk intents
                    if p.name == "Sarah Jenkins":
                        if "WEIGHT_GAIN" in intent:
                            text = "Yes, I'm up 5 pounds since Monday and my ankles are swollen."
                            red_flag = True
                        elif "DYSPNEA" in intent or "ORTHOPNEA" in intent:
                            text = "I can't breathe lying down, I need 4 pillows now."
                            red_flag = True
                        elif "EDEMA" in intent:
                            text = "My legs are swelling up past my ankles, very tight."
                            red_flag = True
                        elif "MED_ADHERENCE" in intent:
                            text = "Yes, I'm taking all my heart medications daily."
                    
                    elif p.name == "Robert Miller":
                        if "CHEST_PAIN" in intent:
                            text = "It's heavy pressure in the center, like a squeezing feeling."
                            red_flag = True
                        elif "DYSPNEA" in intent:
                            text = "Yes, I'm very short of breath even while resting."
                            red_flag = True
                        elif "MED_ADHERENCE" in intent:
                            text = "I've started taking them but the pain is making it hard."
                        elif "BLEEDING" in intent:
                            text = "No unusual bruising or bleeding noticed."

                    elif p.name == "David Thompson":
                        if "FEVER" in intent:
                            text = "My temp is 101.8 and I've been having chills all day."
                            red_flag = True
                        elif "PAIN" in intent:
                            text = "The incision on my hip is really starting to throb."
                            red_flag = True
                        elif "COUGH" in intent:
                            text = "A bit of a dry cough, but the incision pain is worse."
                        elif "BREATHING_TREND" in intent:
                            text = "It's been getting harder to breathe since this morning."
                            red_flag = True

                    db.add(AgentResponse(
                        call_id=log.patient_call_id,
                        intent_id=intent,
                        raw_text=text,
                        red_flag=red_flag,
                        confidence=99.0,
                        created_at=now
                    ))
        
        db.commit()
        print("Updated all patients with previous notes and full protocol response sets.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    update_all_questions_and_notes()
