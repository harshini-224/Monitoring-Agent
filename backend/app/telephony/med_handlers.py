from fastapi import Request
from fastapi.responses import Response
from xml.sax.saxutils import escape
from datetime import datetime, timezone
import traceback

from app.db.session import SessionLocal
from app.db.models import MedicationReminder, MedicationEvent
from app.config import BASE_URL


def _twiml(text: str) -> Response:
    safe = escape(text)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">{safe}</Say>
</Response>
"""
    return Response(content=xml, media_type="text/xml")


async def med_ivr(request: Request):
    try:
        params = dict(request.query_params)
        reminder_id = params.get("reminder_id")
        if not reminder_id:
            return _twiml("We could not locate your reminder. Goodbye.")

        action_url = f"{BASE_URL}/telephony/med-ivr/handle?reminder_id={reminder_id}"
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello. This is CarePulse from your hospital.</Say>
  <Pause length="1" />
  <Gather input="dtmf" numDigits="1" timeout="6" action="{escape(action_url)}" method="POST" actionOnEmptyResult="true">
    <Say voice="alice">If you have taken your medication, press 1.</Say>
    <Pause length="1" />
    <Say voice="alice">If you have not taken your medication, press 2.</Say>
  </Gather>
  <Say voice="alice">We did not receive your input. We will follow up.</Say>
</Response>
"""
        return Response(content=xml, media_type="text/xml")
    except Exception as e:
        print(f"Error in med_ivr: {e}")
        traceback.print_exc()
        return _twiml("An error occurred. Please try again later. Goodbye.")


async def med_ivr_handle(request: Request):
    try:
        params = dict(request.query_params)
        reminder_id = params.get("reminder_id")
        form = await request.form()
        digits = (form.get("Digits") or "").strip()
        if not reminder_id:
            return _twiml("We could not record your response. Goodbye.")

        db = SessionLocal()
        try:
            reminder = db.query(MedicationReminder).filter(MedicationReminder.id == int(reminder_id)).first()
            if not reminder:
                return _twiml("We could not record your response. Goodbye.")
            
            if digits == "1":
                reminder.status = "taken"
                db.add(MedicationEvent(reminder_id=reminder.id, event_type="taken", meta={"digits": digits}))
                db.commit()
                return _twiml("Thank you. Your medication has been marked as taken.")
            if digits == "2":
                reminder.status = "not_taken"
                db.add(MedicationEvent(reminder_id=reminder.id, event_type="not_taken", meta={"digits": digits}))
                db.commit()
                return _twiml("Thank you. We have recorded that you have not taken your medication.")
            
            reminder.status = "no_response"
            db.add(MedicationEvent(reminder_id=reminder.id, event_type="no_response", meta={"digits": digits}))
            db.commit()
            return _twiml("We did not receive your input. We will follow up.")
        finally:
            db.close()
    except Exception as e:
        print(f"Error in med_ivr_handle: {e}")
        traceback.print_exc()
        return _twiml("An error occurred while recording your response. Goodbye.")
