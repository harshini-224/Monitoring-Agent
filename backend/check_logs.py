from app.db.session import SessionLocal
from app.db.models import CallLog, User
from datetime import datetime

db = SessionLocal()
# Divya Patel is ID 88
patient_id = 88
logs = db.query(CallLog).filter(CallLog.patient_id == patient_id).all()
print(f"--- Logs for Divya Patel (ID {patient_id}) ---")
for l in logs:
    print(f"ID: {l.id}, Date: {l.created_at}, Risk: {l.risk_score}")

doctor = db.query(User).filter(User.role == 'doctor').first()
if doctor:
    print(f"\nDoctor found: {doctor.name} (ID: {doctor.id})")
else:
    print("\nNo doctor found.")
db.close()
