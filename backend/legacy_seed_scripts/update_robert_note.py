from app.db.session import SessionLocal
from app.db.models import Patient, AlertAction
from datetime import datetime, timezone, timedelta

def update_robert_note():
    db = SessionLocal()
    try:
        robert = db.query(Patient).filter(Patient.name == "Robert Miller").first()
        if not robert:
            print("Robert Miller not found.")
            return

        # Find the historical action (the one we added for yesterday)
        yesterday_start = datetime.now(timezone.utc) - timedelta(days=1.5)
        yesterday_end = datetime.now(timezone.utc) - timedelta(hours=12)
        
        note = db.query(AlertAction).filter(
            AlertAction.patient_id == robert.id,
            AlertAction.created_at >= yesterday_start,
            AlertAction.created_at <= yesterday_end
        ).first()

        if note:
            note.doctor_note = "Stable post-MI; continued monitoring of chest pain and med adherence advised."
            print(f"Updated Robert Miller's previous note to: {note.doctor_note}")
        else:
            # If for some reason we can't find the exact one, just update the most recent previous one
            recent_notes = db.query(AlertAction).filter(
                AlertAction.patient_id == robert.id
            ).order_by(AlertAction.created_at.desc()).all()
            
            # We want the one BEFORE today's alert (if any today)
            # But usually we just want the oldest one we created as 'previous'
            if len(recent_notes) > 0:
                recent_notes[-1].doctor_note = "Stable post-MI; continued monitoring of chest pain and med adherence advised."
                print(f"Updated most historical note to: {recent_notes[-1].doctor_note}")

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    update_robert_note()
