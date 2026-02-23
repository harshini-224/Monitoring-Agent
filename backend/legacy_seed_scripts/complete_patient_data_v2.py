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
            
            # Use raw SQL to insert the alert action to bypass Pydantic/Validator issues if any
            from sqlalchemy import text
            db.execute(text("""
                INSERT INTO alert_actions (call_log_id, patient_id, risk_score, action, doctor_note, doctor_id, created_at)
                VALUES (:log_id, :p_id, :score, :action, :note, :d_id, :created)
            """), {
                "log_id": 0,
                "p_id": p.id,
                "score": 45.0, # Using 0-100 range as per model check constraint
                "action": "confirmed",
                "note": f"Previous review: Patient was informed of monitoring protocols. Adherence is priority.",
                "d_id": doctor_id,
                "created": yesterday
            })

            intents = get_protocol_intents(p.protocol)
            log = db.query(CallLog).filter(CallLog.patient_id == p.id, CallLog.created_at >= today_start).order_by(CallLog.created_at.desc()).first()
            
            if log and log.patient_call_id:
                db.query(AgentResponse).filter(AgentResponse.call_id == log.patient_call_id).delete()
                
                for intent in intents:
                    if intent in ["INTENT_0_DAILY_CHECKIN", "INTENT_29_SAFETY_CLOSE"]:
                        continue
                        
                    response_text = "Patient reports no issues."
                    is_red = False
                    
                    if p.name == "Sarah Jenkins":
                        if "WEIGHT_GAIN" in intent:
                            response_text = "I've gained 5 pounds this week and ankles are very swollen."
                            is_red = True
                        elif "DYSPNEA" in intent or "ORTHOPNEA" in intent:
                            response_text = "Significant shortness of breath, needing extra pillows at night."
                            is_red = True
                        elif "EDEMA" in intent:
                            response_text = "Noticeable swelling in both legs, worse in the evening."
                            is_red = True
                            
                    elif p.name == "Robert Miller":
                        if "CHEST_PAIN" in intent:
                            response_text = "Experiencing sharp, squeezing pain in center of chest."
                            is_red = True
                        elif "DYSPNEA" in intent:
                            response_text = "Persistent shortness of breath even when sitting still."
                            is_red = True

                    elif p.name == "David Thompson":
                        if "FEVER" in intent:
                            response_text = "Temperature reached 101.8 F with accompanying chills."
                            is_red = True
                        elif "BREATHING" in intent:
                            response_text = "Breathing feels shallow and laboured since afternoon."
                            is_red = True

                    db.add(AgentResponse(
                        call_id=log.patient_call_id,
                        intent_id=intent,
                        raw_text=response_text,
                        red_flag=is_red,
                        confidence=98.0,
                        created_at=now
                    ))
        
        db.commit()
        print("Updated successfully via raw SQL for notes.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    update_all_questions_and_notes()
