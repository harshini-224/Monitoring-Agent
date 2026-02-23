import asyncio
import os
import tempfile
import subprocess


class EdgeTTS:
    def __init__(self, voice: str = "en-US-AriaNeural"):
        self.voice = voice

    async def synthesize_ulaw(self, text: str) -> bytes:
        try:
            import edge_tts
        except Exception:
            print("edge-tts not installed. TTS disabled.")
            return b""

        if not text:
            return b""

        with tempfile.TemporaryDirectory() as tmp:
            mp3_path = os.path.join(tmp, "tts.mp3")
            ulaw_path = os.path.join(tmp, "tts.ulaw")

            communicate = edge_tts.Communicate(text, self.voice)
            try:
                await communicate.save(mp3_path)
            except Exception as e:
                print(f"edge-tts save failed: {e}")
                return b""

            # Convert to 8k mulaw
            cmd = [
                "ffmpeg",
                "-y",
                "-i", mp3_path,
                "-ar", "8000",
                "-ac", "1",
                "-f", "mulaw",
                ulaw_path
            ]
            try:
                subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception as e:
                print(f"[EdgeTTS] ffmpeg failed: {e}. Check if ffmpeg is in your PATH.")
                return b""

            try:
                with open(ulaw_path, "rb") as f:
                    return f.read()
            except Exception as e:
                print(f"TTS read failed: {e}")
                return b""
