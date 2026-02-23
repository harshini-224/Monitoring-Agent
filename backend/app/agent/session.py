from dataclasses import dataclass, field
from typing import List, Dict, Any
from app.agent.protocols import get_protocol_intents, normalize_protocol
from app.agent.intents import INTENTS


@dataclass
class AgentSession:
    protocol: str
    index: int = 0
    questions: List[Dict[str, Any]] = field(default_factory=list)
    responses: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def __post_init__(self):
        if not self.questions:
            self.protocol = normalize_protocol(self.protocol)
            intent_ids = get_protocol_intents(self.protocol)
            self.questions = []
            for intent_id in intent_ids:
                meta = INTENTS.get(intent_id, {})
                phrases = meta.get("allowed_phrases", [])
                prompt = phrases[0] if phrases else intent_id
                self.questions.append({
                    "intent_id": intent_id,
                    "question": prompt,
                    "response_type": meta.get("response_type", "yes_no"),
                    "red_flag": meta.get("red_flag", False),
                    "domain": meta.get("domain", "")
                })

    def current(self):
        if self.index < len(self.questions):
            return self.questions[self.index]
        return None

    def advance(self):
        self.index += 1
        return self.current()

    def record_response(self, transcript: str, parsed: Dict[str, Any] | None):
        q = self.current()
        if not q:
            return None
        structured = parsed or {}
        red_flag = False
        if q.get("red_flag"):
            intent_id = q.get("intent_id")
            answer = structured.get("answer")
            present = structured.get("present")
            trend = structured.get("trend")
            # Medication adherence is a red flag when the answer is "no".
            if intent_id in ["INTENT_14_MED_ADHERENCE", "INTENT_19_MED_ADHERENCE_INHALER"]:
                if answer == "no" or present is False:
                    red_flag = True
            else:
                if present is True:
                    red_flag = True
                if trend == "worse":
                    red_flag = True
                if answer == "severe":
                    red_flag = True
        self.responses[q["intent_id"]] = {
            "raw": transcript,
            "structured": structured,
            "red_flag": red_flag,
            "response_type": q.get("response_type", "yes_no"),
            "domain": q.get("domain", "")
        }
        return q

    def to_feature_payload(self) -> dict:
        payload = {}
        for intent_id, item in self.responses.items():
            structured = item.get("structured", {})
            payload[intent_id] = structured
            if intent_id in ["INTENT_1_CHEST_PAIN", "INTENT_2_EXERTIONAL_CHEST_PAIN", "INTENT_3_PAIN_RADIATION"]:
                payload.setdefault("chest_pain", {})["severity"] = 1.0 if structured.get("present") else 0.0
            if intent_id in ["INTENT_4_WORSENING_DYSPNEA", "INTENT_17_BREATHING_TREND"]:
                payload.setdefault("sob", {})["present"] = structured.get("present") is True or structured.get("trend") == "worse"
            if intent_id in ["INTENT_14_MED_ADHERENCE", "INTENT_19_MED_ADHERENCE_INHALER"]:
                payload.setdefault("med_adherence", {})["score"] = 1.0 if structured.get("present") else 0.3
            if item.get("red_flag"):
                payload.setdefault("red_flag", {})["present"] = True
        return payload
