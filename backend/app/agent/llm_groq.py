import asyncio
import json
import urllib.request
import urllib.error
import re
from typing import List

from app.config import GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL


class GroqClient:
    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None, timeout: int = 12):
        self.api_key = api_key or GROQ_API_KEY
        self.model = model or GROQ_MODEL
        self.base_url = (base_url or GROQ_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.enabled = bool(self.api_key)

    async def chat(self, messages: list[dict], temperature: float = 0.2, max_tokens: int = 64):
        if not self.enabled:
            return None
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        return await asyncio.to_thread(self._chat_sync, payload)

    def _chat_sync(self, payload: dict):
        url = f"{self.base_url}/chat/completions"
        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
            body = json.loads(raw)
            return body.get("choices", [{}])[0].get("message", {}).get("content")
        except Exception:
            return None


def _first_sentence(text: str) -> str:
    if not text:
        return ""
    m = re.split(r"(?<=[.!?])\s+", text.strip())
    return (m[0] if m else text).strip()


def _clean_one_word(text: str) -> str:
    if not text:
        return ""
    t = text.strip().lower()
    t = re.sub(r"[^a-z_]+", "", t)
    return t


def _allowed_for_response_type(response_type: str, options: List[str] | None = None) -> list[str]:
    if response_type == "yes_no":
        return ["yes", "no", "unknown"]
    if response_type == "trend":
        return ["better", "same", "worse", "unknown"]
    if response_type in ["choice", "options", "scale"]:
        base = [(o or "").strip().lower() for o in (options or []) if (o or "").strip()]
        if "unknown" not in base:
            base.append("unknown")
        return base
    return ["unknown"]


async def rephrase_question(client: GroqClient, question: str, patient_name: str | None = None) -> str:
    if not client or not client.enabled or not question:
        return question
    name = patient_name or ""
    user_content = "\\n".join([
        f"Patient name: {name}",
        f"Question: {question}"
    ])
    messages = [
        {
            "role": "system",
            "content": "You are a hospital monitoring voice agent. Rephrase the question politely and naturally. Do not add new questions or advice. Keep it one sentence."
        },
        {
            "role": "user",
            "content": user_content
        }
    ]
    text = await client.chat(messages, temperature=0.2, max_tokens=64)
    cleaned = _first_sentence(text)
    return cleaned or question


async def llm_extract_answer(client: GroqClient, question: str, response_type: str, transcript: str, options: List[str] | None = None) -> str:
    if not client or not client.enabled or not transcript:
        return "unknown"
    allowed = _allowed_for_response_type(response_type, options)
    allowed_str = ", ".join(allowed)
    user_content = "\\n".join([
        "Question:",
        f"\"{question}\"",
        "",
        "Rules:",
        f"- Output only one word: {allowed_str}",
        "- No explanation",
        "",
        "Patient response:",
        f"\"{transcript}\""
    ])
    messages = [
        {
            "role": "system",
            "content": "Extract the patient's answer."
        },
        {
            "role": "user",
            "content": user_content
        }
    ]
    text = await client.chat(messages, temperature=0.0, max_tokens=8)
    answer = _clean_one_word(text)
    if answer not in allowed:
        return "unknown"
    return answer


async def llm_acknowledge(client: GroqClient, patient_name: str | None, summary: str) -> str:
    if not client or not client.enabled:
        return "Thank you for sharing that with me."
    name = patient_name or ""
    user_content = "\\n".join([
        f"Patient name: {name}",
        f"Answer summary: {summary}"
    ])
    messages = [
        {
            "role": "system",
            "content": "Acknowledge empathetically in one short sentence. Do not give advice. Do not ask questions."
        },
        {
            "role": "user",
            "content": user_content
        }
    ]
    text = await client.chat(messages, temperature=0.3, max_tokens=32)
    cleaned = _first_sentence(text)
    return cleaned or "Thank you for sharing that with me."
