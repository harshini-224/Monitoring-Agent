import os
import pandas as pd
from app.config import RISK_MODEL_PATH
from app.risk.model_baseline import predict_baseline


def load_model():
    if os.path.exists(RISK_MODEL_PATH):
        try:
            import joblib
            return joblib.load(RISK_MODEL_PATH)
        except Exception:
            print("Risk model load failed. Falling back to baseline.")
            return None
    print("Risk model file not found. Falling back to baseline.")
    return None


def predict_risk(model, features: dict) -> float:
    if model is None:
        return float(predict_baseline(features))
    X = pd.DataFrame([features])
    risk = model.predict_proba(X)[0][1]
    return float(risk)
