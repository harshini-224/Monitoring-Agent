from app.db.session import SessionLocal
from app.db.models import Patient, CallLog

db = SessionLocal()
patients = db.query(Patient).all()
print(f"{'ID':<5} {'Name':<20} {'Risk':<10}")
print('-'*40)
for p in patients:
    latest_call = db.query(CallLog).filter(CallLog.patient_id == p.id).order_by(CallLog.created_at.desc()).first()
    risk = latest_call.risk_score if latest_call else 'N/A'
    print(f"{p.id:<5} {p.name:<20} {risk}")
db.close()
