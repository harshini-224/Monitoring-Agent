import pandas as pd
from app.risk.feature_builder import build_features


def build_dataset(db_rows):
    records = []
    for row in db_rows:
        features = build_features(row["responses"])
        features["label"] = row["readmitted"]
        records.append(features)
    return pd.DataFrame(records)


def _aggregate_structured(responses: list[dict]) -> dict:
    """
    Convert stored structured responses into feature-compatible payload.
    """
    payload = {}
    for r in responses:
        intent_id = r.get("intent_id")
        structured = r.get("structured_data") or {}
        if not intent_id:
            continue
        payload[intent_id] = structured

        if intent_id in ["INTENT_1_CHEST_PAIN", "INTENT_2_EXERTIONAL_CHEST_PAIN", "INTENT_3_PAIN_RADIATION"]:
            payload.setdefault("chest_pain", {})["severity"] = 1.0 if structured.get("present") else 0.0
        if intent_id in ["INTENT_4_WORSENING_DYSPNEA", "INTENT_17_BREATHING_TREND"]:
            payload.setdefault("sob", {})["present"] = structured.get("present") is True or structured.get("trend") == "worse"
        if intent_id in ["INTENT_14_MED_ADHERENCE", "INTENT_19_MED_ADHERENCE_INHALER"]:
            payload.setdefault("med_adherence", {})["score"] = 1.0 if structured.get("present") else 0.3
        if r.get("red_flag"):
            payload.setdefault("red_flag", {})["present"] = True

    return payload


def build_dataset_from_calls(call_rows: list[dict]):
    """
    call_rows = [{responses: [AgentResponse...], label: 0/1}, ...]
    """
    records = []
    for row in call_rows:
        payload = _aggregate_structured(row["responses"])
        features = build_features(payload)
        features["label"] = row["label"]
        records.append(features)
    return pd.DataFrame(records)
