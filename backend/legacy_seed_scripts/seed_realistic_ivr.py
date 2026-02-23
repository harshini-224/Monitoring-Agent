from app.db.session import SessionLocal
from app.db.models import Patient, AgentResponse, CallLog, User, ReadmissionRisk
from datetime import datetime, timezone
import json

def update_to_realistic():
    db = SessionLocal()
    try:
        # 1. Sarah Jenkins (Heart Failure) - Let's make her responses more "human"
        sarah = db.query(Patient).filter(Patient.name == "Sarah Jenkins").first()
        if sarah:
            print(f"Updating Sarah Jenkins (ID: {sarah.id})")
            log = db.query(CallLog).filter(CallLog.patient_id == sarah.id).order_by(CallLog.created_at.desc()).first()
            if log and log.patient_call_id:
                # Remove old responses
                db.query(AgentResponse).filter(AgentResponse.call_id == log.patient_call_id).delete()
                
                # Add new realistic responses
                responses = [
                    ("weight_gain", "Well, I stepped on the scale this morning and it said 158. I was 152 on Monday... it's just coming on so fast, my ankles are like balloons.", True),
                    ("dyspnea", "It's awful, I had to prop myself up with four pillows last night just to get a bit of sleep. I'm gasping if I even try to talk much.", True),
                    ("med_adherence", "Oh yes, I'm very careful with my heart pills. I have one of those weekly boxes to keep track.", False),
                    ("symptom_progression", "The swelling in my legs is moving up to my knees now. It's quite painful to walk, actually.", True)
                ]
                
                for intent, text, red_flag in responses:
                    resp = AgentResponse(
                        call_id=log.patient_call_id,
                        intent_id=intent,
                        raw_text=text,
                        structured_data={"present": True, "severity": "high"} if red_flag else {"present": True},
                        red_flag=red_flag,
                        confidence=95.0,
                        created_at=datetime.now(timezone.utc)
                    )
                    db.add(resp)

        # 2. Robert Miller (Post-MI) - Make his responses sound like acute distress
        robert = db.query(Patient).filter(Patient.name == "Robert Miller").first()
        if robert:
            print(f"Updating Robert Miller (ID: {robert.id})")
            log = db.query(CallLog).filter(CallLog.patient_id == robert.id).order_by(CallLog.created_at.desc()).first()
            if log and log.patient_call_id:
                db.query(AgentResponse).filter(AgentResponse.call_id == log.patient_call_id).delete()
                
                responses = [
                    ("chest_pain", "It's like... a heavy pressure, right here in the center. Like someone is squeezing my heart. It's been going on for over an hour now and it's not letting up.", True),
                    ("dyspnea", "I... I can't catch my breath. I'm breathing fast but I'm just not getting enough air.", True),
                    ("fatigue", "I feel so washed out. A bit dizzy too, and my stomach feels all knotted up, like I might be sick.", True),
                    ("symptom_progression", "I haven't felt anything like this since the heart attack. It's scary... it feels exactly the same.", True)
                ]
                
                for intent, text, red_flag in responses:
                    resp = AgentResponse(
                        call_id=log.patient_call_id,
                        intent_id=intent,
                        raw_text=text,
                        structured_data={"present": True, "severity": "critical"},
                        red_flag=red_flag,
                        confidence=98.0,
                        created_at=datetime.now(timezone.utc)
                    )
                    db.add(resp)

        # 3. Add a new one: David Thompson (Post-op Infection risk)
        david = Patient(
            name="David Thompson",
            age=54,
            gender="Male",
            phone_number="+15550303",
            disease_track="Post-Surgical",
            protocol="POST_OP",
            active=True
        )
        db.add(david)
        db.flush()
        
        pcall = datetime.now(timezone.utc)
        # Create a nested structure for the call
        from app.db.models import PatientCall
        pc = PatientCall(patient_id=str(david.id), created_at=pcall)
        db.add(pc)
        db.flush()
        
        log = CallLog(
            patient_id=david.id,
            patient_call_id=pc.id,
            status="completed",
            answered=True,
            risk_score=0.78,
            risk_level="high",
            created_at=pcall
        )
        db.add(log)
        db.flush()
        
        responses = [
            ("fever", "I developed a bit of a chill this afternoon. My thermometer is showing 101.8 right now.", True),
            ("pain", "The incision on my hip is really starting to throb. It's much deeper than it was yesterday.", True),
            ("redness", "Actually, looking at it now, the skin around the staples is bright red and feels quite hot to the touch.", True),
            ("symptom_progression", "I was feeling okay yesterday morning, but since last night I've just been feeling worse and worse.", True)
        ]
        
        for intent, text, red_flag in responses:
            db.add(AgentResponse(
                call_id=pc.id,
                intent_id=intent,
                raw_text=text,
                red_flag=red_flag,
                confidence=96.0,
                created_at=pcall
            ))
            
        expl = {
            "top_factors": [
                {"name": "fever", "impact": 0.40, "value": "101.8 F"},
                {"name": "redness", "impact": 0.25, "value": "localized inflammation"},
                {"name": "pain", "impact": 0.15, "value": "worsening"},
                {"name": "symptom_progression", "impact": 0.10, "value": "acute change"}
            ]
        }
        db.add(ReadmissionRisk(
            patient_id=david.id,
            call_log_id=log.id,
            score=78.0,
            level="high",
            explanation=json.dumps(expl),
            created_at=pcall
        ))

        db.commit()
        print("Updated Sarah and Robert, and added David with realistic responses.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    update_to_realistic()
