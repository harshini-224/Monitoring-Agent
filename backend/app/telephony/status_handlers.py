from fastapi import Request, BackgroundTasks
from app.db.session import SessionLocal
from app.db.models import MedicationReminder, MedicationEvent
import traceback

async def med_call_status(request: Request, background_tasks: BackgroundTasks):
    try:
        params = await request.form()
        call_sid = params.get("CallSid")
        call_status = params.get("CallStatus")
        reminder_id = request.query_params.get("reminder_id")
        
        print(f"[med_call_status] CallSid={call_sid} Status={call_status} ReminderID={reminder_id}")

        if not reminder_id:
            return {"status": "ignored", "reason": "no_reminder_id"}

        # "completed" means the call was answered. We rely on the IVR input handler (med_handlers.py)
        # to set the final status (taken/not_taken).
        # We only care if the call failed to connect or was not answered.
        missed_statuses = ["busy", "no-answer", "failed", "canceled"]
        
        if call_status in missed_statuses:
            background_tasks.add_task(_update_missed_status, int(reminder_id), call_status)
        
        return {"status": "received"}
    except Exception as e:
        print(f"Error in med_call_status: {e}")
        traceback.print_exc()
        return {"status": "error"}

def _update_missed_status(reminder_id: int, status_reason: str):
    db = SessionLocal()
    try:
        reminder = db.query(MedicationReminder).filter(MedicationReminder.id == reminder_id).first()
        if not reminder:
            print(f"Reminder {reminder_id} not found for status update.")
            return

        # Only update if it's still in a 'pending' state
        # If the user answered and hung up without input, it might be 'no_response' (handled by IVR gather timeout if reached)
        # But if CallStatus is busy/no-answer, they clearly didn't answer.
        # We check if it's already final to avoid overwriting a concurrent 'taken' update (race condition unlikely but safer)
        if reminder.status in ["scheduled", "call_placed", "sms_sent"]:
            print(f"Marking reminder {reminder_id} as MISSED due to {status_reason}")
            reminder.status = "missed"
            db.add(MedicationEvent(
                reminder_id=reminder.id, 
                event_type="missed", 
                meta={"reason": status_reason}
            ))
            db.commit()
    except Exception as e:
        print(f"Error updating missed status: {e}")
        traceback.print_exc()
    finally:
        db.close()
