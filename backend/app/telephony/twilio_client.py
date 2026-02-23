from app.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, BASE_URL


def make_call(phone_number, call_id, patient_id=None, protocol="POST_MI"):
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_FROM_NUMBER or not BASE_URL:
        print("Twilio config missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, BASE_URL in .env.")
        return None
    try:
        from twilio.rest import Client
    except Exception:
        print("Twilio client not installed.")
        return None

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    params = f"call_id={call_id}&protocol={protocol}"
    if patient_id:
        params += f"&patient_id={patient_id}"
    try:
        return client.calls.create(
            to=phone_number,
            from_=TWILIO_FROM_NUMBER,
            url=f"{BASE_URL}/telephony/voice?{params}",
            method="POST"
        )
    except Exception as e:
        print(f"Twilio call failed: {e}")
        return None


def make_medication_call(phone_number, reminder_id: int):
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_FROM_NUMBER or not BASE_URL:
        print("Twilio config missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, BASE_URL in .env.")
        return None
    try:
        from twilio.rest import Client
    except Exception:
        print("Twilio client not installed.")
        return None

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    url = f"{BASE_URL}/telephony/med-ivr?reminder_id={reminder_id}"
    try:
        return client.calls.create(
            to=phone_number,
            from_=TWILIO_FROM_NUMBER,
            url=url,
            method="POST",
            status_callback=f"{BASE_URL}/telephony/status/medication?reminder_id={reminder_id}",
            status_callback_event=['completed', 'busy', 'no-answer', 'failed', 'canceled']
        )
    except Exception as e:
        print(f"Twilio medication call failed: {e}")
        return None


def send_sms(phone_number: str, body: str):
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_FROM_NUMBER:
        print("Twilio config missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env.")
        return None
    try:
        from twilio.rest import Client
    except Exception:
        print("Twilio client not installed.")
        return None
    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        return client.messages.create(
            to=phone_number,
            from_=TWILIO_FROM_NUMBER,
            body=body
        )
    except Exception as e:
        print(f"Twilio sms failed: {e}")
        return None


def hangup_call(call_sid: str):
    try:
        from twilio.rest import Client
    except Exception:
        print("Twilio client not installed.")
        return None

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        return client.calls(call_sid).update(status="completed")
    except Exception as e:
        print(f"Twilio hangup failed: {e}")
        return None
