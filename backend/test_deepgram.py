import asyncio
import urllib.request
import urllib.error
import json
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.config import DEEPGRAM_API_KEY

async def test_deepgram():
    print(f"Testing Deepgram API Key: {DEEPGRAM_API_KEY[:5]}...")
    
    url = "https://api.deepgram.com/v1/projects"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Token {DEEPGRAM_API_KEY}"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
            print(f"Success! Status: {status}")
            print(f"Projects: {body[:100]}...")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        try:
            print(e.read().decode("utf-8"))
        except:
            pass
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_deepgram())
