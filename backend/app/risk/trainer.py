import os
import joblib
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import CallLog, AgentResponse, AuditEvent
from app.risk.dataset import build_dataset_from_calls
from app.risk.model import train_model
from app.config import RISK_MODEL_PATH, SAMPLE_DATASET_PATH


MIN_TRAIN_SAMPLES = 10


def _label_from_responses(responses: list[AgentResponse]) -> int:
    # Proxy label until true readmission labels are available.
    # If any red_flag present, label as 1.
    return 1 if any(r.red_flag for r in responses) else 0


def train_from_db(db: Session) -> bool:
    overrides = {}
    response_overrides = {}
    audit_rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.action.in_(["model_feedback", "risk_override", "response_review"]))
        .order_by(AuditEvent.created_at.desc())
        .all()
    )
    for row in audit_rows:
        meta = row.meta or {}
        call_log_id = meta.get("call_log_id")
        label = meta.get("label")
        if row.action == "response_review":
            intent_id = meta.get("intent_id")
            if call_log_id is None or intent_id is None or label is None:
                continue
            response_overrides.setdefault(call_log_id, {})[intent_id] = int(label)
            continue
        if call_log_id is None or label is None:
            continue
        if call_log_id not in overrides:
            overrides[call_log_id] = int(label)

    call_logs = db.query(CallLog).filter(CallLog.patient_call_id != None).all()
    call_rows = []
    for log in call_logs:
        responses = (
            db.query(AgentResponse)
            .filter(AgentResponse.call_id == log.patient_call_id)
            .all()
        )
        if not responses:
            continue
        adjusted = []
        intent_map = response_overrides.get(log.id, {})
        for r in responses:
            if r.intent_id in intent_map:
                r.red_flag = True if intent_map[r.intent_id] == 1 else False
            adjusted.append(r)
        label = overrides.get(log.id, _label_from_responses(adjusted))
        call_rows.append({
            "responses": [
                {
                    "intent_id": r.intent_id,
                    "structured_data": r.structured_data,
                    "red_flag": r.red_flag
                }
                for r in adjusted
            ],
            "label": label
        })

    if len(call_rows) < MIN_TRAIN_SAMPLES:
        return False

    df = build_dataset_from_calls(call_rows)
    if df.empty:
        return False

    X = df.drop(columns=["label"])
    y = df["label"]
    model = train_model(X, y)

    os.makedirs(os.path.dirname(RISK_MODEL_PATH), exist_ok=True)
    joblib.dump(model, RISK_MODEL_PATH)
    return True


def train_from_csv(path: str | None = None) -> bool:
    path = path or SAMPLE_DATASET_PATH
    if not os.path.exists(path):
        return False

    df = pd.read_csv(path)
    if "readmitted_30d" not in df.columns:
        return False

    y = df["readmitted_30d"]
    X = df.drop(columns=["readmitted_30d"])
    # Keep only numeric columns for the model
    X = X.select_dtypes(include=["number"])

    model = train_model(X, y)
    os.makedirs(os.path.dirname(RISK_MODEL_PATH), exist_ok=True)
    joblib.dump(model, RISK_MODEL_PATH)
    return True
