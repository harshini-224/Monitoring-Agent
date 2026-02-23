def predict_baseline(features: dict) -> float:
    score = 0.2
    score += min(0.6, features.get("chest_pain_score", 0) * 0.5)
    score += 0.2 if features.get("shortness_of_breath", 0) else 0
    score += 0.2 if features.get("red_flag", 0) else 0
    score -= 0.1 if features.get("med_adherence", 1.0) >= 0.8 else 0
    return max(0.0, min(1.0, score))
