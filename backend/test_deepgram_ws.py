"""
Quick test to verify your Deepgram key has BOTH REST and WebSocket (streaming) access.
Run from the backend/ directory:
    python test_deepgram_ws.py
"""
import asyncio
import sys
import os
import urllib.request
import urllib.error

# Load .env manually
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")


def test_rest():
    print(f"\n1. REST check (GET /v1/projects)...")
    print(f"   Using key: {API_KEY[:8]}...{API_KEY[-4:] if len(API_KEY) > 8 else ''}")
    req = urllib.request.Request(
        "https://api.deepgram.com/v1/projects",
        headers={"Authorization": f"Token {API_KEY}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            print(f"   ✅ REST OK (status={r.status})")
            return True
    except urllib.error.HTTPError as e:
        print(f"   ❌ REST FAILED: HTTP {e.code} — {e.read().decode()[:200]}")
        return False
    except Exception as ex:
        print(f"   ❌ REST FAILED: {ex}")
        return False


async def test_websocket():
    print(f"\n2. WebSocket streaming check (wss://api.deepgram.com/v1/listen)...")
    try:
        import websockets
        from websockets.exceptions import InvalidStatus
    except ImportError:
        print("   ⚠️  'websockets' package not installed. Run: pip install websockets")
        return False

    url = (
        "wss://api.deepgram.com/v1/listen"
        "?encoding=mulaw&sample_rate=8000&channels=1"
        "&model=phonecall&language=en"
    )
    headers = {"Authorization": f"Token {API_KEY}"}
    try:
        ws = await websockets.connect(url, additional_headers=headers, open_timeout=8)
        print(f"   ✅ WebSocket connected — streaming is ENABLED for this key!")
        await ws.close()
        return True
    except InvalidStatus as e:
        code = getattr(e, "status_code", "?")
        print(f"   ❌ WebSocket REJECTED: status={code}")
        if code == 401:
            print("   → The key exists but does NOT have streaming permission.")
            print("   → Go to console.deepgram.com → API Keys → create a new key")
            print("     with 'Member' or 'Owner' role (not restricted scope).")
        elif code == 403:
            print("   → Access forbidden. Check your project quota/billing.")
        return False
    except Exception as ex:
        print(f"   ❌ WebSocket FAILED: {ex}")
        return False


if __name__ == "__main__":
    if not API_KEY:
        print("❌ DEEPGRAM_API_KEY is empty in your .env file!")
        sys.exit(1)

    rest_ok = test_rest()
    ws_ok = asyncio.run(test_websocket())

    print("\n─────────────────────────────")
    if rest_ok and ws_ok:
        print("✅ ALL GOOD — key is valid for both REST and streaming.")
        print("   Restart the backend and test your call.")
    elif rest_ok and not ws_ok:
        print("⚠️  REST works but WebSocket (streaming) FAILS.")
        print("   Create a new Deepgram key with full/Member permissions.")
    else:
        print("❌ Key is invalid or network error. Check key in .env.")
