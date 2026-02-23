from app.db.session import SessionLocal
from app.db.models import Patient, AgentResponse, CallLog, PatientCall, ReadmissionRisk
from datetime import datetime, date, timezone
import json

def reseed_with_correct_intents():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        
        # 1. Sarah Jenkins (Heart Failure)
        sarah = db.query(Patient).filter(Patient.name == "Sarah Jenkins").first()
        if not sarah:
            sarah = Patient(name="Sarah Jenkins", age=72, gender="Female", phone_number="+15550101", 
                           disease_track="Heart Failure", protocol="HEART_FAILURE", active=True)
            db.add(sarah)
            db.flush()
        else:
            sarah.protocol = "HEART_FAILURE"
            # Clear today's logs
            logs = db.query(CallLog).filter(CallLog.patient_id == sarah.id, CallLog.created_at >= today_start).all()
            for l in logs:
                if l.patient_call_id:
                    db.query(AgentResponse).filter(AgentResponse.call_id == l.patient_call_id).delete()
                db.query(ReadmissionRisk).filter(ReadmissionRisk.call_log_id == l.id).delete()
                db.query(CallLog).filter(CallLog.id == l.id).delete()

        pc1 = PatientCall(patient_id=str(sarah.id), created_at=now)
        db.add(pc1)
        db.flush()
        
        sarah_responses = [
            ("INTENT_8_WEIGHT_GAIN", "Well, I stepped on the scale this morning and it said 158. I was 152 on Monday... it's just coming on so fast, my ankles are like balloons.", True),
            ("INTENT_4_WORSENING_DYSPNEA", "It's awful, I had to prop myself up with four pillows last night just to get a bit of sleep. I'm gasping if I even try to talk much.", True),
            ("INTENT_14_MED_ADHERENCE", "Oh yes, I'm very careful with my heart pills. I have one of those weekly boxes to keep track.", False),
            ("INTENT_7_EDEMA", "The swelling in my legs is moving up to my knees now. It's quite painful to walk, actually.", True)
        ]
        
        for intent, text, red_flag in sarah_responses:
            db.add(AgentResponse(call_id=pc1.id, intent_id=intent, raw_text=text, red_flag=red_flag, confidence=98.0, created_at=now))
            
        log1 = CallLog(patient_id=sarah.id, patient_call_id=pc1.id, status="completed", answered=True, risk_score=0.88, risk_level="high", created_at=now)
        db.add(log1)
        db.flush()
        
        db.add(ReadmissionRisk(patient_id=sarah.id, call_log_id=log1.id, score=88.0, level="high", explanation=json.dumps({"top_factors": [{"name": "Weight Gain", "impact": 0.35, "value": "5 lbs"}, {"name": "Orthopnea", "impact": 0.28, "value": "4 pillows"}]}), created_at=now))


        # 2. Robert Miller (Post-MI)
        robert = db.query(Patient).filter(Patient.name == "Robert Miller").first()
        if not robert:
            robert = Patient(name="Robert Miller", age=65, gender="Male", phone_number="+15550202", 
                            disease_track="Post-MI", protocol="POST_MI", active=True)
            db.add(robert)
            db.flush()
        else:
            robert.protocol = "POST_MI"
            logs = db.query(CallLog).filter(CallLog.patient_id == robert.id, CallLog.created_at >= today_start).all()
            for l in logs:
                if l.patient_call_id:
                    db.query(AgentResponse).filter(AgentResponse.call_id == l.patient_call_id).delete()
                db.query(ReadmissionRisk).filter(ReadmissionRisk.call_log_id == l.id).delete()
                db.query(CallLog).filter(CallLog.id == l.id).delete()

        pc2 = PatientCall(patient_id=str(robert.id), created_at=now)
        db.add(pc2)
        db.flush()
        
        robert_responses = [
            ("INTENT_1_CHEST_PAIN", "It's like... a heavy pressure, right here in the center. Like someone is squeezing my heart. It's been going on for over an hour now and it's not letting up.", True),
            ("INTENT_4_WORSENING_DYSPNEA", "I... I can't catch my breath. I'm breathing fast but I'm just not getting enough air.", True),
            ("INTENT_14_MED_ADHERENCE", "I've been taking them, but honestly the pain is so bad I can't think straight.", False)
        ]
        
        for intent, text, red_flag in robert_responses:
            db.add(AgentResponse(call_id=pc2.id, intent_id=intent, raw_text=text, red_flag=red_flag, confidence=99.0, created_at=now))
            
        log2 = CallLog(patient_id=robert.id, patient_call_id=pc2.id, status="completed", answered=True, risk_score=0.95, risk_level="high", created_at=now)
        db.add(log2)
        db.flush()
        
        db.add(ReadmissionRisk(patient_id=robert.id, call_log_id=log2.id, score=95.0, level="high", explanation=json.dumps({"top_factors": [{"name": "Chest Pain", "impact": 0.45, "value": "Crushing"}, {"name": "Acute Distress", "impact": 0.25, "value": "Severe"}]}), created_at=now))

        db.commit()
        print("Reseed with explicit INTENT IDs complete.")
    finally:
        db.close()

if __name__ == "__main__":
    reseed_with_correct_intents()
