from app.db.session import SessionLocal
from app.db.models import Patient, AgentResponse, CallLog, PatientCall
from datetime import datetime, date, timezone
import json

def clean_and_reseed():
    db = SessionLocal()
    try:
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        
        # 1. Clean up today's logs for target patients
        patient_names = ["Sarah Jenkins", "Robert Miller", "David Thompson"]
        patients = db.query(Patient).filter(Patient.name.in_(patient_names)).all()
        p_ids = [p.id for p in patients]
        
        if p_ids:
            # Delete responses tied to today's calls for these patients
            logs = db.query(CallLog).filter(CallLog.patient_id.in_(p_ids), CallLog.created_at >= today_start).all()
            log_ids = [l.id for l in logs]
            pcall_ids = [l.patient_call_id for l in logs if l.patient_call_id]
            
            if pcall_ids:
                db.query(AgentResponse).filter(AgentResponse.call_id.in_(pcall_ids)).delete()
            
            if log_ids:
                from app.db.models import ReadmissionRisk
                db.query(ReadmissionRisk).filter(ReadmissionRisk.call_log_id.in_(log_ids)).delete()
                db.query(CallLog).filter(CallLog.id.in_(log_ids)).delete()

        # 2. Reseed with highly realistic data
        now = datetime.now(timezone.utc)
        
        for p in patients:
            print(f"Reseeding {p.name}")
            # Create a new call
            pc = PatientCall(patient_id=str(p.id), created_at=now)
            db.add(pc)
            db.flush()
            
            risk_score = 0
            responses = []
            expl = {}
            
            if p.name == "Sarah Jenkins":
                risk_score = 0.88
                responses = [
                    ("weight_gain", "Well, I stepped on the scale this morning and it said 158. I was 152 on Monday... it's just coming on so fast, my ankles are like balloons.", True),
                    ("dyspnea", "It's awful, I had to prop myself up with four pillows last night just to get a bit of sleep. I'm gasping if I even try to talk much.", True),
                    ("med_adherence", "Oh yes, I'm very careful with my heart pills. I have one of those weekly boxes to keep track.", False),
                    ("symptom_progression", "The swelling in my legs is moving up to my knees now. It's quite painful to walk, actually.", True)
                ]
                expl = {"top_factors": [{"name": "weight_gain", "impact": 0.35, "value": "5 lbs"}, {"name": "dyspnea", "impact": 0.28, "value": "orthopnea"}, {"name": "swelling", "impact": 0.15, "value": "pitting edema"}]}
            
            elif p.name == "Robert Miller":
                risk_score = 0.95
                responses = [
                    ("chest_pain", "It's like... a heavy pressure, right here in the center. Like someone is squeezing my heart. It's been going on for over an hour now and it's not letting up.", True),
                    ("dyspnea", "I... I can't catch my breath. I'm breathing fast but I'm just not getting enough air.", True),
                    ("fatigue", "I feel so washed out. A bit dizzy too, and my stomach feels all knotted up, like I might be sick.", True),
                    ("symptom_progression", "I haven't felt anything like this since the heart attack. It's scary... it feels exactly the same.", True)
                ]
                expl = {"top_factors": [{"name": "chest_pain", "impact": 0.45, "value": "pressure"}, {"name": "dyspnea", "impact": 0.20, "value": "acute"}, {"name": "vagus_nerve", "impact": 0.10, "value": "nausea"}]}

            elif p.name == "David Thompson":
                risk_score = 0.78
                responses = [
                    ("fever", "I developed a bit of a chill this afternoon. My thermometer is showing 101.8 right now.", True),
                    ("pain", "The incision on my hip is really starting to throb. It's much deeper than it was yesterday.", True),
                    ("redness", "Actually, looking at it now, the skin around the staples is bright red and feels quite hot to the touch.", True),
                    ("symptom_progression", "I was feeling okay yesterday morning, but since last night I've just been feeling worse and worse.", True)
                ]
                expl = {"top_factors": [{"name": "fever", "impact": 0.40, "value": "101.8 F"}, {"name": "inflammation", "impact": 0.25, "value": "erythema"}, {"name": "pain", "impact": 0.15, "value": "throbbing"}]}

            log = CallLog(
                patient_id=p.id,
                patient_call_id=pc.id,
                status="completed",
                answered=True,
                risk_score=risk_score,
                risk_level="high",
                created_at=now
            )
            db.add(log)
            db.flush()
            
            for intent, text, red_flag in responses:
                db.add(AgentResponse(
                    call_id=pc.id,
                    intent_id=intent,
                    raw_text=text,
                    red_flag=red_flag,
                    confidence=98.0,
                    created_at=now
                ))
            
            from app.db.models import ReadmissionRisk
            db.add(ReadmissionRisk(
                patient_id=p.id,
                call_log_id=log.id,
                score=risk_score * 100,
                level="high",
                explanation=json.dumps(expl),
                created_at=now
            ))
            
        db.commit()
        print("Final reseed complete.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_and_reseed()
