from fastapi import Request
from fastapi.responses import Response


async def sms_reply(request: Request):
    # No SMS replies expected. Return empty TwiML.
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
"""
    return Response(content=xml, media_type="text/xml")
