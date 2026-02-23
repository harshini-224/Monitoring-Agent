import asyncio
import json
import urllib.request
import urllib.error


class DeepgramStreamingSTT:
    def __init__(self, api_key: str, on_transcript=None, on_activity=None):
        self.api_key = api_key
        self.enabled = bool(api_key)
        self.on_transcript = on_transcript
        self.on_activity = on_activity
        self._ws = None
        self._receiver_task = None
        self._keepalive_task = None
        self._closed = False
        self._lock = asyncio.Lock()
        self._last_interim_log = 0.0

    async def start(self):
        if not self.enabled:
            print("Deepgram API key missing. STT disabled.")
            return
        try:
            import websockets
            from websockets.exceptions import InvalidStatus
        except Exception:
            print("websockets package missing. Install websockets to enable STT.")
            self.enabled = False
            return

        if not await self._rest_check():
            print("[Deepgram] REST check failed - but attempting WebSocket anyway...")

        url = (
            "wss://api.deepgram.com/v1/listen"
            "?encoding=mulaw&sample_rate=8000&channels=1"
            "&model=nova-2&language=en&smart_format=true"
            "&interim_results=true&utterance_end_ms=1000"
        )
        headers = {"Authorization": f"Token {self.api_key}"}
        async with self._lock:
            if self._ws and not self._closed:
                return
            self._closed = False
            try:
                # Increased timeout to 15s to handle handshake delays
                self._ws = await websockets.connect(
                    url,
                    additional_headers=headers,
                    ping_interval=20,
                    ping_timeout=20,
                    open_timeout=15
                )
            except Exception as e:
                print(f"[Deepgram] Connection FAILED: {type(e).__name__}: {e}")
                self.enabled = False
                return
            print(f"[Deepgram] WebSocket connected OK. Starting receiver...")


            self._receiver_task = asyncio.create_task(self._receiver())
            self._keepalive_task = asyncio.create_task(self._keepalive())

    async def _receiver(self):
        print("[Deepgram] Receiver task started. Waiting for transcripts...")
        try:
            async for message in self._ws:
                data = json.loads(message)
                if data.get("type") == "Results" or data.get("channel"):
                    is_final = data.get("is_final", False)
                    transcript = data["channel"]["alternatives"][0].get("transcript", "") if data.get("channel") else ""
                    
                    if transcript:
                        print(f"[Deepgram] Got result. is_final={is_final} transcript='{transcript}'")
                        if self.on_activity:
                            asyncio.create_task(self.on_activity())
                    
                    if is_final and transcript and self.on_transcript:
                        # Use create_task so we don't block the receiver while the handler runs/sleeps
                        asyncio.create_task(self.on_transcript(transcript))

                else:
                    # Log any other message types (errors, metadata, etc.)
                    msg_type = data.get("type", "unknown")
                    if msg_type not in ("UtteranceEnd", "SpeechStarted", "Metadata"):
                        print(f"[Deepgram] Message type={msg_type}: {str(data)[:120]}")
        except Exception as e:
            if not self._closed:
                print(f"Deepgram receiver error: {e}")
            self._closed = True

    async def _keepalive(self):
        try:
            while True:
                if self._ws and not self._closed:
                    await self._ws.send(json.dumps({"type": "KeepAlive"}))
                await asyncio.sleep(5)
        except Exception as e:
            if not self._closed:
                print(f"Deepgram keepalive error: {e}")
            self._closed = True

    async def send_audio(self, pcm: bytes):
        if not self.enabled:
            return
        if self._closed or not self._ws:
            try:
                await self.start()
            except Exception as e:
                print(f"Deepgram reconnect failed: {e}")
                return
        try:
            await self._ws.send(pcm)
        except Exception as e:
            print(f"Deepgram send error: {e}")
            self._closed = True

    async def close(self):
        try:
            if self._receiver_task:
                self._receiver_task.cancel()
            if self._keepalive_task:
                self._keepalive_task.cancel()
            if self._ws:
                self._closed = True
                await self._ws.close()
        except Exception:
            pass

    async def _rest_check(self) -> bool:
        def _check():
            req = urllib.request.Request(
                "https://api.deepgram.com/v1/projects",
                headers={"Authorization": f"Token {self.api_key}"}
            )
            try:
                with urllib.request.urlopen(req, timeout=6) as resp:
                    return resp.status, resp.read().decode("utf-8")
            except urllib.error.HTTPError as e:
                try:
                    body = e.read().decode("utf-8")
                except Exception:
                    body = ""
                return e.code, body
            except Exception as e:
                return None, str(e)

        status, body = await asyncio.to_thread(_check)
        if status == 200:
            return True
        print(f"Deepgram REST check failed. status={status} body={body}")
        return False
