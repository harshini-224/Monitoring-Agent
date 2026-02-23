from fastapi import Request
from fastapi.responses import Response
from urllib.parse import urlencode
from app.config import BASE_URL
from app.agent.protocols import normalize_protocol
from xml.sax.saxutils import escape


def _ws_base(url: str) -> str:
    if url.startswith("https://"):
        return url.replace("https://", "wss://")
    if url.startswith("http://"):
        return url.replace("http://", "ws://")
    return url


async def voice_handler(request: Request):
    try:
        params = dict(request.query_params)
        if "call_id" not in params:
            for key in list(params.keys()):
                if key.endswith("call_id"):
                    params["call_id"] = params[key]
                    break
        if "protocol" not in params:
            for key in list(params.keys()):
                if key.endswith("protocol"):
                    params["protocol"] = params[key]
                    break
        if "patient_id" not in params:
            for key in list(params.keys()):
                if key.endswith("patient_id"):
                    params["patient_id"] = params[key]
                    break

        call_id = params.get("call_id") or params.get("CallSid") or "unknown"
        protocol = normalize_protocol(params.get("protocol") or "GENERAL_MONITORING")
        patient_id = params.get("patient_id")
        print(f"[voice_handler] call_id={call_id} protocol={protocol} patient_id={patient_id}")


        stream_params = {
            "call_id": call_id,
            "protocol": protocol
        }
        if patient_id:
            stream_params["patient_id"] = patient_id

        ws_url = f"{_ws_base(BASE_URL)}/telephony/media?{urlencode(stream_params)}"
        print(f"[voice_handler] ws_url={ws_url}")

        # Escape the URL for XML to ensure & becomes &amp;
        ws_url_escaped = escape(ws_url)
        
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="{ws_url_escaped}" />
  </Connect>
</Response>
"""
        return Response(content=xml, media_type="text/xml")
    except Exception as e:
        print(f"Error in voice_handler: {e}")
        import traceback
        traceback.print_exc()
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We are currently experiencing technical difficulties. Please try again later.</Say>
</Response>
"""
        return Response(content=xml, media_type="text/xml")
