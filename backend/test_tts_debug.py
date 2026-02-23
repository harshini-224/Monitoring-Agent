import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.voice.tts_edge import EdgeTTS

async def test_tts():
    print("Testing EdgeTTS...")
    tts = EdgeTTS()
    text = "Hello, this is a test of the emergency broadcast system."
    
    print(f"Synthesizing: '{text}'")
    try:
        audio = await tts.synthesize_ulaw(text)
        if audio:
            print(f"Success! Generated {len(audio)} bytes of audio.")
            with open("test_output.ulaw", "wb") as f:
                f.write(audio)
            print("Saved to test_output.ulaw")
        else:
            print("Failed: Generated 0 bytes.")
    except Exception as e:
        print(f"Exception during synthesis: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_tts())
