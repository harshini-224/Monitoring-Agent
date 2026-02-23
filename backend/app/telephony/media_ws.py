import json
import base64
import asyncio
import traceback
from datetime import datetime, timedelta

from fastapi import WebSocket
from starlette.websockets import WebSocketState, WebSocketDisconnect

from app.db.session import SessionLocal
from app.db.models import CallLog, Patient, ReadmissionRisk, PatientCall, AgentResponse
from app.telephony.call_context import CallContext
from app.agent.session import AgentSession
from app.agent.protocols import normalize_protocol
from app.agent.extracter import extract
from app.agent.llm_groq import GroqClient, rephrase_question, llm_extract_answer, llm_acknowledge
from app.risk.feature_builder import build_features
from app.risk.predictor import load_model, predict_risk
from app.risk.shap_explainer import explain_risk
from app.risk.alerts import should_alert
from app.risk.trainer import train_from_db
from app.voice.stt_deepgram import DeepgramStreamingSTT
from app.voice.tts_edge import EdgeTTS
from app.telephony.twilio_client import hangup_call
from app.config import DEEPGRAM_API_KEY, GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL


INTRO = "Hello, this is a follow-up call from your care team. I will ask a few short questions about how you are feeling today."
GOODBYE = "Thank you for your time. We wish you a speedy recovery. Goodbye."
INACTIVITY_TIMEOUT_SECONDS = 60
REPEAT_AFTER_SECONDS = 22
REPEAT_MAX_COUNT = 2
REPEAT_GRACE_AFTER_SPEAK_SECONDS = 2
CLARIFY_MAX_COUNT = 1
TTS_CACHE: dict[str, bytes] = {}


async def _handle_start(ctx: CallContext, db, data):
    call_sid = data.get("start", {}).get("callSid") or ctx.call_id
    if call_sid and (ctx.call_id == "unknown" or not ctx.call_id):
        ctx.call_id = call_sid

    log = None
    if call_sid:
        log = db.query(CallLog).filter(CallLog.call_sid == call_sid).first()

    if log is None and ctx.patient_id:
        log = (
            db.query(CallLog)
            .filter(CallLog.patient_id == ctx.patient_id)
            .filter(CallLog.status == "in_progress")
            .order_by(CallLog.started_at.desc().nullslast())
            .first()
        )
        if log and call_sid and not log.call_sid:
            log.call_sid = call_sid

    if log is None and ctx.patient_id:
        log = CallLog(
            patient_id=ctx.patient_id,
            call_sid=call_sid,
            scheduled_for=datetime.utcnow(),
            started_at=datetime.utcnow(),
            status="in_progress",
            answered=False
        )
        db.add(log)
        db.commit()
        db.refresh(log)
    elif log:
        log.started_at = log.started_at or datetime.utcnow()
        log.status = log.status or "in_progress"
        if call_sid and not log.call_sid:
            log.call_sid = call_sid
        db.commit()

    if not log:
        return

    ctx.call_log_id = log.id
    if not ctx.patient_id and log.patient_id:
        ctx.patient_id = log.patient_id

    if ctx.patient_id:
        patient = db.query(Patient).filter(Patient.id == ctx.patient_id).first()
        if patient and (not ctx.protocol or ctx.protocol == "GENERAL_MONITORING"):
            ctx.protocol = normalize_protocol(patient.protocol or "GENERAL_MONITORING")
        if patient and not ctx.patient_name:
            ctx.patient_name = patient.name

    if log.patient_call_id:
        ctx.patient_call_id = log.patient_call_id
    elif ctx.patient_id:
        patient_call = PatientCall(
            patient_id=str(ctx.patient_id),
            diagnosis=ctx.protocol,
            consent_given=False
        )
        db.add(patient_call)
        db.commit()
        db.refresh(patient_call)
        ctx.patient_call_id = patient_call.id
        log.patient_call_id = patient_call.id
        db.commit()


async def _send_audio(ws: WebSocket, stream_sid: str, ulaw: bytes) -> bool:
    if not ulaw:
        print(f"[send_audio] Empty ulaw. Skipping.")
        return False
    if ws.client_state != WebSocketState.CONNECTED:
        print(f"[send_audio] WebSocket not connected state={ws.client_state}")
        return False

    chunk_size = 160  # 20ms @ 8kHz mulaw (Twilio-friendly)
    for i in range(0, len(ulaw), chunk_size):
        chunk = ulaw[i:i + chunk_size]
        payload = base64.b64encode(chunk).decode("utf-8")
        try:
            await ws.send_text(json.dumps({
                "event": "media",
                "streamSid": stream_sid,
                "media": {"payload": payload, "track": "outbound"}
            }))
        except Exception as e:
            print(f"[send_audio] send failed: {e}")
            return False
        await asyncio.sleep(0.02)
    return True



async def media_socket(ws: WebSocket):
    print(f"[media_socket] WebSocket connection attempt from client")
    await ws.accept()
    print(f"[media_socket] WebSocket accepted")
    db = SessionLocal()

    params = dict(ws.query_params)
    call_id = params.get("call_id", "unknown")
    protocol = normalize_protocol(params.get("protocol"))
    patient_id = params.get("patient_id")
    patient_id_int = int(patient_id) if patient_id and patient_id.isdigit() else None
    ctx = CallContext(call_id=call_id, protocol=protocol, patient_id=patient_id_int)
    print(f"[media_ws] query_params call_id={call_id} protocol={protocol} patient_id={patient_id}")
    session = None
    model = load_model()
    tts = EdgeTTS()
    groq = GroqClient(api_key=GROQ_API_KEY, model=GROQ_MODEL, base_url=GROQ_BASE_URL)

    stream_sid = None

    last_speak_end = None
    speaking = False
    pending_question_ts = None
    no_response_count = 0
    flow_events = []
    last_media_ts = None
    media_packet_count = 0
    last_transcript_ts = None
    last_repeat_check_ts = None
    completed = False
    spoken_question_cache: dict[str, str] = {}
    clarify_counts: dict[str, int] = {}

    def _log_flow(message: str):
        ts = datetime.utcnow().isoformat()
        flow_events.append({"ts": ts, "message": message})
        print(f"[{ctx.call_id}] {message}")

    async def _speak_text(text: str):
        nonlocal speaking, last_speak_end
        _log_flow(f"_speak_text request: {text[:20]}...")
        speaking = True
        ulaw = TTS_CACHE.get(text)
        if ulaw is None:
            _log_flow("_speak_text: Cache miss. Synthesizing...")
            ulaw = await tts.synthesize_ulaw(text)
            if ulaw:
                TTS_CACHE[text] = ulaw
                _log_flow(f"_speak_text: Synthesis complete. {len(ulaw)} bytes.")
        else:
                _log_flow("_speak_text: Cache hit.")

        if not ulaw:
            _log_flow("TTS produced no audio (empty payload).")
        else:
            _log_flow(f"TTS audio bytes: {len(ulaw)}")
        
        if stream_sid:
            _log_flow(f"_speak_text: Sending to stream {stream_sid}")
            sent = await _send_audio(ws, stream_sid, ulaw)
            if not sent:
                _log_flow("_speak_text: internal send failed")
                speaking = False
                last_speak_end = datetime.utcnow()
                return
        else:
            _log_flow("TTS skipped: missing streamSid.")
        
        if not ulaw:
            _log_flow("TTS produced no audio. Check edge-tts/ffmpeg installation.")
        speaking = False
        last_speak_end = datetime.utcnow()
        _log_flow("_speak_text: Complete.")

    async def _hangup():
        call_sid = ctx.call_id
        if not call_sid or not call_sid.startswith("CA"):
            return
        try:
            await asyncio.to_thread(hangup_call, call_sid)
            _log_flow(f"Call hangup requested: {call_sid}")
        except Exception as e:
            _log_flow(f"Call hangup failed: {e}")

    async def _get_spoken_question(q: dict) -> str:
        if not q:
            return ""
        response_type = q.get("response_type", "yes_no")
        if response_type == "none":
            return q.get("question", "")
        intent_id = q.get("intent_id") or ""
        cached = spoken_question_cache.get(intent_id)
        if cached:
            return cached
        question = q.get("question", "")
        spoken = await rephrase_question(groq, question, ctx.patient_name)
        if not spoken:
            spoken = question
        if intent_id:
            spoken_question_cache[intent_id] = spoken
        return spoken

    def _is_unknown(parsed: dict, response_type: str, options: list[str] | None = None) -> bool:
        if response_type == "yes_no":
            return parsed.get("answer") not in ["yes", "no"]
        if response_type == "trend":
            return parsed.get("trend") not in ["better", "same", "worse"]
        if response_type in ["choice", "options", "scale"]:
            opts = [(o or "").strip().lower() for o in (options or []) if (o or "").strip()]
            return parsed.get("answer") not in opts
        return False

    def _normalize_parsed(parsed: dict, response_type: str, options: list[str] | None = None) -> dict:
        parsed = parsed or {}
        if response_type == "yes_no":
            answer = parsed.get("answer")
            if answer not in ["yes", "no"]:
                answer = "unknown"
            parsed["answer"] = answer
            parsed["present"] = answer == "yes"
            return parsed
        if response_type == "trend":
            trend = parsed.get("trend")
            if trend not in ["better", "same", "worse"]:
                trend = "unknown"
            parsed["trend"] = trend
            return parsed
        if response_type in ["choice", "options", "scale"]:
            opts = [(o or "").strip().lower() for o in (options or []) if (o or "").strip()]
            answer = parsed.get("answer")
            if answer not in opts:
                answer = "unknown"
            parsed["answer"] = answer
            return parsed
        return parsed

    def _clarify_prompt(response_type: str, options: list[str] | None = None) -> str:
        if response_type == "yes_no":
            return "Just to confirm, please say yes or no."
        if response_type == "trend":
            return "Just to confirm, is it better, the same, or worse?"
        if response_type in ["choice", "options", "scale"]:
            opts = [(o or "").strip().lower() for o in (options or []) if (o or "").strip()]
            if opts:
                return "Just to confirm, please say " + ", ".join(opts) + "."
        return "Sorry, I did not catch that."

    def _ack_summary(response_type: str, parsed: dict) -> str:
        if response_type == "yes_no":
            return f"Patient said {parsed.get('answer', 'unknown')}."
        if response_type == "trend":
            return f"Patient said {parsed.get('trend', 'unknown')}."
        if response_type in ["choice", "options", "scale"]:
            return f"Patient answered {parsed.get('answer', 'unknown')}."
        return "Patient response recorded."

    async def _ask_question(q: dict):
        nonlocal pending_question_ts, no_response_count
        if not q:
            return
        response_type = q.get("response_type", "yes_no")
        spoken = await _get_spoken_question(q)
        _log_flow(f"Asked: {spoken}")
        no_response_count = 0
        await _speak_text(spoken)
        if response_type == "none":
            next_q = session.advance()
            if next_q:
                await _ask_question(next_q)
            else:
                _log_flow("No more questions. Sending goodbye.")
                await _speak_text(GOODBYE)
                await _hangup()
                _finalize_call("completed flow", compute_risk=True)
                try:
                    train_from_db(db)
                except Exception as e:
                    print(f"[{call_id}] model retrain failed: {e}")
                if ctx.call_log_id:
                    log = db.query(CallLog).filter(CallLog.id == ctx.call_log_id).first()
                    if log and should_alert((log.risk_score or 0) / 100):
                        _log_flow("Alert: high risk")
                _log_flow("Call ended")
        else:
            pending_question_ts = datetime.utcnow()


    def _format_explanation(features: dict, shap_values: dict) -> dict:
        label_map = {
            "chest_pain_score": "Chest pain",
            "shortness_of_breath": "Shortness of breath",
            "med_adherence": "Medication adherence",
            "red_flag": "Red flag response"
        }
        if shap_values:
            rows = [
                {
                    "feature": feature,
                    "label": label_map.get(feature, feature.replace("_", " ").title()),
                    "impact": float(value),
                    "direction": "increase" if float(value) >= 0 else "decrease"
                }
                for feature, value in shap_values.items()
            ]
            if any(abs(r["impact"]) > 1e-6 for r in rows):
                rows.sort(key=lambda r: abs(r["impact"]), reverse=True)
                return {"top_factors": rows[:6]}
        # Fallback to heuristic weights if SHAP is missing or all-zero.
        weights = {
            "chest_pain_score": 0.6,
            "shortness_of_breath": 0.3,
            "med_adherence": -0.3,
            "red_flag": 0.8
        }
        fallback = []
        for feature, weight in weights.items():
            value = float(features.get(feature, 0) or 0)
            impact = weight * value
            if abs(impact) < 1e-6:
                continue
            fallback.append({
                "feature": feature,
                "label": label_map.get(feature, feature.replace("_", " ").title()),
                "impact": float(impact),
                "direction": "increase" if impact >= 0 else "decrease"
            })
        fallback.sort(key=lambda r: abs(r["impact"]), reverse=True)
        return {"top_factors": fallback}

    def _finalize_call(reason: str, compute_risk: bool = True):
        nonlocal completed
        if completed:
            return
        completed = True
        log = None
        if ctx.call_log_id:
            log = db.query(CallLog).filter(CallLog.id == ctx.call_log_id).first()
        if log is None and ctx.call_id:
            log = db.query(CallLog).filter(CallLog.call_sid == ctx.call_id).first()
            if log and not ctx.call_log_id:
                ctx.call_log_id = log.id
                if not ctx.patient_id and log.patient_id:
                    ctx.patient_id = log.patient_id
        if log:
            log.status = "completed"
            log.ended_at = datetime.utcnow()
            log.flow_log = flow_events
            if compute_risk and log.risk_score is None and session is not None:
                features = build_features(session.to_feature_payload())
                risk = predict_risk(model, features)
                any_red_flag = any(r.get("red_flag") for r in session.responses.values())
                if any_red_flag and risk < 0.7:
                    risk = 0.7
                level = "high" if risk >= 0.65 else "medium" if risk >= 0.4 else "low"
                explanation = {}
                if model is not None:
                    try:
                        import pandas as pd
                        explanation = explain_risk(model, pd.DataFrame([features]))
                    except Exception:
                        explanation = {}
                explanation = _format_explanation(features, explanation)
                log.risk_score = float(risk * 100)
                log.risk_level = level
                db.add(ReadmissionRisk(
                    patient_id=ctx.patient_id,
                    call_log_id=log.id,
                    score=float(risk * 100),
                    level=level,
                    explanation=explanation
                ))
            db.commit()
        _log_flow(f"Call finalized: {reason}")
    async def on_transcript(text: str):
        nonlocal stream_sid, no_response_count, pending_question_ts, last_transcript_ts
        if not text:
            return
        _log_flow(f"[STT] Transcript received: '{text}'")
        if session is None:
            _log_flow("[STT] Transcript ignored: session not ready yet.")
            return
        if speaking:
            # Patient spoke while agent was talking (natural overlap).
            # Wait a short moment for TTS to finish, then process it.
            _log_flow(f"[STT] Transcript arrived during speech — will process after agent finishes.")
            await asyncio.sleep(1.2)
            if speaking:
                _log_flow("[STT] Still speaking after wait — dropping transcript.")
                return
        if last_speak_end and (datetime.utcnow() - last_speak_end) < timedelta(milliseconds=200):
            _log_flow("[STT] Transcript dropped — too close to end of agent speech (echo suppression).")
            return

        last_transcript_ts = datetime.utcnow()
        if ctx.call_log_id:
            log = db.query(CallLog).filter(CallLog.id == ctx.call_log_id).first()
            if log and not log.answered:
                log.answered = True
                db.commit()
        current_q = session.current()
        if not current_q:
            return
        response_type = current_q.get("response_type", "yes_no")
        options = current_q.get("options") or []
        parsed = extract(
            current_q["intent_id"],
            response_type,
            text,
            question=current_q.get("question", ""),
            clinical_meaning="",
            options=options
        )
        parsed = _normalize_parsed(parsed, response_type, options)
        if _is_unknown(parsed, response_type, options):
            llm_answer = await llm_extract_answer(groq, current_q.get("question", ""), response_type, text, options)
            if response_type == "yes_no":
                parsed["answer"] = llm_answer
                parsed["present"] = llm_answer == "yes"
            elif response_type == "trend":
                parsed["trend"] = llm_answer
            elif response_type in ["choice", "options", "scale"]:
                parsed["answer"] = llm_answer
            parsed = _normalize_parsed(parsed, response_type, options)

        if _is_unknown(parsed, response_type, options):
            intent_id = current_q.get("intent_id")
            count = clarify_counts.get(intent_id, 0)
            if count < CLARIFY_MAX_COUNT:
                clarify_counts[intent_id] = count + 1
                _log_flow(f"Unclear response for {intent_id}. Clarifying.")
                await _speak_text(_clarify_prompt(response_type, options))
                await _speak_text(await _get_spoken_question(current_q))
                pending_question_ts = datetime.utcnow()
                return

        session.record_response(text, parsed)
        no_response_count = 0
        pending_question_ts = None
        response = session.responses.get(current_q["intent_id"]) or {}
        structured = response.get("structured") or {}
        _log_flow(f"Structured response: {structured} (type={response_type})")
        _log_flow(f"Recorded response for {current_q['intent_id']}")

        if ctx.patient_call_id:
            db.add(AgentResponse(
                call_id=ctx.patient_call_id,
                intent_id=current_q["intent_id"],
                raw_text=text,
                structured_data=structured,
                red_flag=response.get("red_flag", False)
            ))
            db.commit()
            _log_flow(f"Stored response for {current_q['intent_id']}")
            ack_text = await llm_acknowledge(groq, ctx.patient_name, _ack_summary(response_type, structured))
            await _speak_text(ack_text)

        next_q = session.advance()
        if next_q:
            await _ask_question(next_q)
        else:
            _log_flow("No more questions. Sending goodbye.")
            await _speak_text(GOODBYE)
            await _hangup()
            _finalize_call("completed flow", compute_risk=True)
            try:
                train_from_db(db)
            except Exception as e:
                print(f"[{call_id}] model retrain failed: {e}")

            if ctx.call_log_id:
                log = db.query(CallLog).filter(CallLog.id == ctx.call_log_id).first()
                if log and should_alert((log.risk_score or 0) / 100):
                    _log_flow("Alert: high risk")
            _log_flow("Call ended")

    async def on_activity():
        nonlocal last_transcript_ts
        last_transcript_ts = datetime.utcnow()

    stt = DeepgramStreamingSTT(DEEPGRAM_API_KEY, on_transcript=on_transcript, on_activity=on_activity)

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=INACTIVITY_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                _log_flow("Inactivity timeout. Finalizing call.")
                await stt.close()
                _finalize_call("inactivity timeout", compute_risk=True)
                break
            except WebSocketDisconnect:
                _log_flow("WebSocket disconnected (client closed). Ending call.")
                break
            except Exception:
                _log_flow("WebSocket disconnected. Ending call.")
                break
            try:
                data = json.loads(raw)
            except Exception as e:
                _log_flow(f"Invalid JSON from media socket: {repr(e)}")
                continue
            event = data.get("event")
            # Only log non-media events to avoid flooding the terminal
            if event and event != "media":
                _log_flow(f"Event: {event}")


            if event == "start":
                try:
                    stream_sid = data.get("start", {}).get("streamSid")
                    
                    if not stream_sid:
                        _log_flow(f"ERROR: streamSid missing from START event! Full event data: {data}")
                        _log_flow("Cannot proceed without streamSid. Ending call.")
                        _finalize_call("missing_stream_sid", compute_risk=False)
                        break
                    
                    custom = data.get("start", {}).get("customParameters") or {}
                    custom_protocol = custom.get("protocol")
                    custom_patient_id = custom.get("patient_id")
                    if custom:
                        _log_flow(f"Start customParameters: {custom}")
                    if custom_protocol:
                        ctx.protocol = normalize_protocol(custom_protocol)
                    if custom_patient_id and str(custom_patient_id).isdigit():
                        ctx.patient_id = int(custom_patient_id)
                    await _handle_start(ctx, db, data)
                    if session is None:
                        session = AgentSession(protocol=ctx.protocol)
                    _log_flow(f"Protocol resolved: {ctx.protocol}")
                    _log_flow(f"Session initialized with {len(session.questions)} questions")
                    if not session.questions:
                        _log_flow(f"WARNING: No questions loaded for protocol {ctx.protocol}! Check protocols.py and intents.py")
                    
                    # Start STT in background so it doesn't block the intro speech or timeout
                    async def _start_stt():
                        try:
                            await stt.start()
                            if stt.enabled and stt._ws:
                                _log_flow("[STT] Deepgram WebSocket connected successfully.")
                            else:
                                _log_flow("[STT] WARNING: STT not enabled after start attempt.")
                        except Exception as e:
                            _log_flow(f"[STT] Background start failed: {e}")

                    asyncio.create_task(_start_stt())

                    if not DEEPGRAM_API_KEY:
                        _log_flow("[STT] ERROR: DEEPGRAM_API_KEY is empty.")
                    _log_flow(f"Call started. streamSid={stream_sid}")

                    current = session.current()
                    if current:
                        # Delay to ensure media stream is ready
                        await asyncio.sleep(0.5)
                        _log_flow(f"Agent intro: {INTRO}")
                        try:
                            await _speak_text(INTRO)
                            await _ask_question(current)
                        except Exception as intro_err:
                            _log_flow(f"Error during intro/first question: {intro_err}")
                            traceback.print_exc()
                            error_msg = "I'm sorry, there was an error starting the call. Please try again later."
                            await _speak_text(error_msg)
                            await _hangup()
                            _finalize_call("intro_error", compute_risk=False)
                    else:
                        _log_flow("No questions available for this protocol. Ending call.")
                        error_msg = "I'm sorry, there are no questions configured for this monitoring protocol."
                        await _speak_text(error_msg)
                        await _hangup()
                        _finalize_call("no_questions", compute_risk=False)
                except Exception as e:
                    _log_flow(f"Error in START handler: {e}")
                    traceback.print_exc()

            if event == "media":
                try:
                    media = data.get("media", {}) or {}
                    track = media.get("track") or "inbound"
                    payload = media.get("payload", "")
                    if payload and track == "inbound":
                        audio = base64.b64decode(payload)
                        await stt.send_audio(audio)
                    media_packet_count += 1
                    if media_packet_count == 1:
                        _log_flow("First media packet received.")
                    last_media_ts = datetime.utcnow()
                    # Check for no-response timeout on every packet (not just the first)
                    if pending_question_ts and not speaking and session is not None:
                        now = datetime.utcnow()
                        if last_repeat_check_ts and (now - last_repeat_check_ts).total_seconds() < 1:
                            continue
                        last_repeat_check_ts = now
                        elapsed = (now - pending_question_ts).total_seconds()
                        if elapsed > REPEAT_AFTER_SECONDS:
                            current_q = session.current()
                            if current_q:
                                response_type = current_q.get("response_type", "yes_no")
                                if response_type == "none":
                                    continue
                                if last_speak_end and (now - last_speak_end).total_seconds() < REPEAT_GRACE_AFTER_SPEAK_SECONDS:
                                    continue
                                if last_transcript_ts and (now - last_transcript_ts).total_seconds() < 8:
                                    continue
                                if no_response_count < REPEAT_MAX_COUNT:
                                    _log_flow(f"No response for {current_q['intent_id']}. Repeating question.")
                                    no_response_count += 1
                                    await _speak_text("I did not hear a response. Please answer the question.")
                                    await _speak_text(await _get_spoken_question(current_q))
                                    pending_question_ts = datetime.utcnow()
                                else:
                                    _log_flow(f"No response for {current_q['intent_id']}. Skipping question.")
                                    no_response_count = 0
                                    next_q = session.advance()
                                    if next_q:
                                        await _speak_text(next_q["question"])
                                        pending_question_ts = datetime.utcnow()
                                    else:
                                        await _speak_text(GOODBYE)
                                        await _hangup()
                                        _finalize_call("no response end", compute_risk=True)
                                        break
                except Exception as e:
                    _log_flow(f"Error in MEDIA handler: {e}")
                    traceback.print_exc()

            if event == "stop":
                _log_flow(f"Stream stop event payload: {data}")
                await stt.close()
                _finalize_call("stream stop", compute_risk=True)
                _log_flow("Call ended")
                break

    except Exception:
        _log_flow(f"media socket error: {traceback.format_exc().strip()}")
    finally:
        _finalize_call("socket closed", compute_risk=True)
        db.close()
        try:
            await ws.close()
        except Exception:
            pass
