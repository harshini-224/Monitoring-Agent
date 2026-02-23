import random
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.models import (
    Patient, CallLog, ReadmissionRisk, PatientCall, AgentResponse,
    User, AuditEvent, MedicationReminder, MedicationEvent, Intervention, AlertAction,
    ResponseCorrection, NurseCallAssignment, Notification
)
from app.auth.security import hash_password
from app.agent.protocols import PROTOCOLS

def seed_realistic_data():
    db = SessionLocal()
    try:
        # 1. Clean up existing data in correct dependency order
        db.query(Notification).delete()
        db.query(AlertAction).delete()
        db.query(ResponseCorrection).delete()
        db.query(Intervention).delete()
        db.query(MedicationEvent).delete()
        db.query(MedicationReminder).delete()
        db.query(ReadmissionRisk).delete()
        db.query(NurseCallAssignment).delete()
        db.query(CallLog).delete() # Delete child first
        db.query(AgentResponse).delete()
        db.query(PatientCall).delete() # Parent of CallLog (via patient_call_id) and AgentResponse
        db.query(Patient).delete()

        # 2. Ensure Users exist
        # 2. Ensure Users exist with correct passwords
        users_to_seed = [
            {"name": "Admin User", "email": "admin@carepulse.com", "password": "admin123", "role": "admin", "key": "admin"},
            {"name": "Bharath Teja", "email": "bharath@carepulse.com", "password": "doctor123", "role": "doctor", "key": "doctor"},
            {"name": "Akshara", "email": "akshara@carepulse.com", "password": "nurse123", "role": "nurse", "key": "nurse"}
        ]
        
        seeded_users = {}
        for u_data in users_to_seed:
            user = db.query(User).filter(User.email == u_data["email"]).first()
            if not user:
                user = User(
                    name=u_data["name"],
                    email=u_data["email"],
                    password_hash=hash_password(u_data["password"]),
                    role=u_data["role"]
                )
                db.add(user)
            else:
                user.name = u_data["name"]
                user.password_hash = hash_password(u_data["password"])
                user.role = u_data["role"]
            db.flush() # Get IDs
            seeded_users[u_data["key"]] = user

        admin = seeded_users["admin"]
        doctor = seeded_users["doctor"]
        nurse = seeded_users["nurse"]
        
        db.commit()

        # 3. Patient Scenarios
        scenarios = [
            {
                "name": "Rajesh Kumar",
                "age": 62,
                "gender": "male",
                "disease": "cardiac",
                "protocol": "POST_MI",
                "day": 10,
                "risk_trend": [30, 35, 45, 60, 75, 82, 85, 80, 78, 85],
                "meds": [("Aspirin", "75mg"), ("Atorvastatin", "40mg")]
            },
            {
                "name": "Lakshmi Reddy",
                "age": 58,
                "gender": "female",
                "disease": "pulmonary",
                "protocol": "COPD",
                "day": 12,
                "risk_trend": [40, 42, 45, 50, 55, 60, 65, 75, 82, 85, 88, 90],
                "meds": [("Salbutamol", "100mcg")]
            },
            {
                "name": "Sanjay Kapoor",
                "age": 55,
                "gender": "male",
                "disease": "cardiac",
                "protocol": "POST_MI",
                "day": 8,
                "risk_trend": [20, 25, 45, 60, 70, 75, 82, 88],
                "meds": [("Metoprolol", "25mg")]
            },
            {
                "name": "Divya Patel",
                "age": 70,
                "gender": "female",
                "disease": "cardiac",
                "protocol": "HEART_FAILURE",
                "day": 12,
                "risk_trend": [50, 55, 65, 75, 80, 85, 90, 92, 95, 92, 90, 92],
                "meds": [("Furosemide", "40mg")]
            },
            {
                "name": "Arjun Shah",
                "age": 45,
                "gender": "male",
                "disease": "general",
                "protocol": "GENERAL_MONITORING",
                "day": 5,
                "risk_trend": [25, 22, 28, 26, 28],
                "meds": [("Multivitamin", "1 tab")]
            },
            {
                "name": "Meera Joshi",
                "age": 65,
                "gender": "female",
                "disease": "cardiac",
                "protocol": "POST_MI",
                "day": 5,
                "risk_trend": [35, 32, 35, 38, 40],
                "meds": [("Clopidogrel", "75mg")]
            }
        ]

        now = datetime.now(timezone.utc)
        
        for s in scenarios:
            # Create Patient
            start_date = now - timedelta(days=s["day"] - 1)
            patient = Patient(
                name=s["name"],
                age=s["age"],
                gender=s["gender"],
                phone_number=f"+91{random.randint(6000000000, 9999999999)}",
                disease_track=s["disease"],
                protocol=s["protocol"],
                start_date=start_date,
                active=True
            )
            db.add(patient)
            db.flush()

            # Create daily history
            daily_logs = []
            for d in range(s["day"]):
                call_date = start_date + timedelta(days=d)
                # Use 0-1 scale for risk scores
                risk_score = s["risk_trend"][d] / 100.0
                risk_level = "high" if risk_score >= 0.7 else ("medium" if risk_score >= 0.4 else "low")
                
                # Create Call Log
                log = CallLog(
                    patient_id=patient.id,
                    call_sid=f"call_{patient.id}_{d}",
                    scheduled_for=call_date.replace(hour=10),
                    started_at=call_date.replace(hour=10, minute=5),
                    ended_at=call_date.replace(hour=10, minute=10),
                    status="completed",
                    answered=True,
                    risk_score=risk_score,
                    risk_level=risk_level,
                    created_at=call_date.replace(hour=10, minute=11)
                )
                db.add(log)
                db.flush()
                daily_logs.append(log)

                # Create Readmission Risk
                risk = ReadmissionRisk(
                    patient_id=patient.id,
                    call_log_id=log.id,
                    score=risk_score,
                    level=risk_level,
                    explanation={
                        "top_factors": [
                            {"feature": "symptom_progression", "label": "Symptom progression", "impact": 0.3 * risk_score, "direction": "increase"},
                            {"feature": "med_adherence", "label": "Medication adherence", "impact": -0.1, "direction": "decrease"}
                        ],
                        "summary": f"Risk is {risk_level} due to {s['disease']} patterns."
                    },
                    created_at=log.created_at
                )
                db.add(risk)

                # Create Patient Call and Agent Responses
                pcall = PatientCall(
                    patient_id=str(patient.id),
                    diagnosis=s["disease"],
                    created_at=log.started_at
                )
                db.add(pcall)
                db.flush()
                log.patient_call_id = pcall.id

                # Add responses for ALL intents
                protocol_key = s["protocol"]
                base_intents = PROTOCOLS.get(protocol_key, ["INTENT_25_OVERALL_HEALTH"])

                for intent in base_intents:
                    # Logic for RED FLAG markers
                    if risk_score > 0.7:
                        text = random.choice(["I feel much worse.", "It's getting harder to breathe.", "I'm very tired today."])
                        is_red = True
                    elif risk_score > 0.4:
                        text = random.choice(["I feel a bit off.", "I'm okay but tired.", "A little bit of discomfort."])
                        is_red = False
                    else:
                        text = random.choice(["I'm doing well.", "No complaints.", "Feeling strong today."])
                        is_red = False

                    resp = AgentResponse(
                        call_id=pcall.id,
                        intent_id=intent,
                        raw_text=text,
                        structured_data={"trend": "worse" if risk_score > 0.7 else "same"},
                        red_flag=is_red,
                        confidence=random.uniform(85, 98),
                        created_at=log.started_at + timedelta(seconds=random.randint(10, 60))
                    )
                    db.add(resp)
                    db.flush()

                # Add AlertAction (Doctor Note) ONLY for PAST days
                # This ensures today's high alert stays "PENDING" and visible on dashboard
                if d < s["day"] - 1:
                    if risk_score >= 0.7 or random.random() < 0.3:
                        db.add(AlertAction(
                            call_log_id=log.id,
                            patient_id=patient.id,
                            risk_score=risk_score,
                            action="confirmed",
                            doctor_note=random.choice([
                                "Patient stable. Monitoring respiratory rate.",
                                "Medication compliance verified. Standard recovery.",
                                "Bilateral edema noted. Escalated monitoring.",
                                "Patient reports improved mobility. Continuing current plan."
                            ]),
                            doctor_id=doctor.id,
                            intervention_required=False,
                            created_at=log.created_at + timedelta(hours=2)
                        ))


        db.commit()
        print(f"Successfully seeded realistic data for {len(scenarios)} patients with full history.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_realistic_data()
