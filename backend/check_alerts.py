from app.db.session import SessionLocal
from app.db.models import Patient, CallLog
from datetime import datetime, date, timezone

def check_high_alerts():
    db = SessionLocal()
    try:
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        alerts = (
            db.query(CallLog, Patient)
            .join(Patient, CallLog.patient_id == Patient.id)
            .filter(
                CallLog.risk_score >= 0.7,
                CallLog.created_at >= today_start,
                Patient.active == True
            )
            .all()
        )
        print(f"Found {len(alerts)} high alert patients today:")
        for log, patient in alerts:
            print(f"- {patient.name}: Risk {log.risk_score * 100:.0f}% at {log.created_at}")
    finally:
        db.close()

if __name__ == "__main__":
    check_high_alerts()
