from app.db.session import SessionLocal
from app.db.models import AlertAction, MedicationReminder
from datetime import datetime
import pytz

def add_clinical_data():
    db = SessionLocal()
    try:
        # Configuration
        patient_id = 88
        call_log_id = 848
        doctor_id = 25
        risk_score = 0.92
        feb13_date = datetime(2026, 2, 13, 15, 41, 51, tzinfo=pytz.timezone('Asia/Kolkata'))
        med_date = datetime(2026, 2, 13, 9, 0, 0, tzinfo=pytz.timezone('Asia/Kolkata'))

        # 1. Add Doctor's Note
        print("Adding doctor's note...")
        note = AlertAction(
            call_log_id=call_log_id,
            patient_id=patient_id,
            risk_score=risk_score,
            action="confirmed",
            doctor_note="Patient reported mild dizziness. Advised to increase fluid intake and monitored medication adherence.",
            doctor_id=doctor_id,
            created_at=feb13_date
        )
        db.add(note)

        # 2. Add Medication Reminder
        print("Adding medication record...")
        med = MedicationReminder(
            patient_id=patient_id,
            medication_name="Lisinopril",
            dose="10mg",
            scheduled_for=med_date,
            status="taken",
            created_at=feb13_date
        )
        db.add(med)

        db.commit()
        print("Successfully added clinical data for Divya Patel.")

    except Exception as e:
        db.rollback()
        print(f"Error adding clinical data: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    add_clinical_data()
