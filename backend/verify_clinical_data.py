from app.db.session import SessionLocal
from app.db.models import AlertAction, MedicationReminder
from datetime import datetime

db = SessionLocal()
patient_id = 88
note = db.query(AlertAction).filter(AlertAction.patient_id == patient_id).order_by(AlertAction.created_at.desc()).first()
# Search specifically for Feb 13 medication
med = db.query(MedicationReminder).filter(
    MedicationReminder.patient_id == patient_id,
    MedicationReminder.medication_name == "Lisinopril",
    MedicationReminder.scheduled_for >= datetime(2026, 2, 13),
    MedicationReminder.scheduled_for < datetime(2026, 2, 14)
).first()

print(f"--- Verification for Divya Patel (ID {patient_id}) ---")
if note:
    print(f"Note Found: {note.doctor_note}")
    print(f"Date: {note.created_at}")
else:
    print("No note found.")

if med:
    print(f"Medication Found: {med.medication_name} {med.dose}")
    print(f"Scheduled for: {med.scheduled_for}")
    print(f"Status: {med.status}")
else:
    print("No medication found.")

db.close()
