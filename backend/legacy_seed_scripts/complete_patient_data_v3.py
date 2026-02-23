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
        
        doctor = db.query(User).filter(User.role == "doctor").first()
        doctor_id = doctor.id if doctor else 1

        patient_names = ["Sarah Jenkins", "Robert Miller", "David Thompson"]
        patients = db.query(Patient).filter(Patient.name.in_(patient_names)).all()
        
        for p in patients:
            print(f"Updating {p.name}")
            
            # Find a real call log ID to use for the previous note if possible
            past_log = db.query(CallLog).filter(CallLog.patient_id == p.id).first()
            log_id = past_log.id if past_log else None 
            
            if log_id:
                # Add historical note
                db.add(AlertAction(
                    call_log_id=log_id,
                    patient_id=p.id,
                    risk_score=45.0,
                    action="confirmed",
                    doctor_note=f"Previous Clinical Review: Patient advised on lifestyle modifications and daily symptom monitoring. No immediate intervention was required at that time.",
                    doctor_id=doctor_id,
                    created_at=yesterday
                ))

            # Update responses for all protocol questions
            intents = get_protocol_intents(p.protocol)
            current_log = db.query(CallLog).filter(CallLog.patient_id == p.id, CallLog.created_at >= today_start).order_by(CallLog.created_at.desc()).first()
            
            if current_log and current_log.patient_call_id:
                db.query(AgentResponse).filter(AgentResponse.call_id == current_log.patient_call_id).delete()
                
                for intent in intents:
                    if intent in ["INTENT_0_DAILY_CHECKIN", "INTENT_29_SAFETY_CLOSE"]: continue
                    
                    response_text = "No symptoms or issues reported by patient."
                    is_red = False
                    
                    if p.name == "Sarah Jenkins":
                        if "WEIGHT_GAIN" in intent: response_text = "I've gained 5 pounds since Monday and both ankles are swollen."; is_red = True
                        elif "DYSPNEA" in intent: response_text = "Very short of breath, propped up with 4 pillows."; is_red = True
                        elif "EDEMA" in intent: response_text = "Severe swelling in both legs up to the knees."; is_red = True
                        elif "MED_ADHERENCE" in intent: response_text = "I am taking all my medications as directed."
                    elif p.name == "Robert Miller":
                        if "CHEST_PAIN" in intent: response_text = "Heavy squeezing pressure in the center of my chest."; is_red = True
                        elif "DYSPNEA" in intent: response_text = "Significant difficulty catching my breath while sitting."; is_red = True
                        elif "MED_ADHERENCE" in intent: response_text = "Struggling to manage pills due to severe discomfort."
                    elif p.name == "David Thompson":
                        if "FEVER" in intent: response_text = "High fever of 101.8 F and body chills today."; is_red = True
                        elif "REDNESS" in intent: response_text = "Surgical site is hot, bright red, and painful."; is_red = True
                        elif "BREATHING" in intent: response_text = "Breathing has become shallow and difficult."; is_red = True

                    db.add(AgentResponse(
                        call_id=current_log.patient_call_id,
                        intent_id=intent,
                        raw_text=response_text,
                        red_flag=is_red,
                        confidence=99.0,
                        created_at=now
                    ))
        
        db.commit()
        print("Success: Previous notes and all protocol responses updated.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    update_all_questions_and_notes()
