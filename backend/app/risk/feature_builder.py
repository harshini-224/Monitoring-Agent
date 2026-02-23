def build_features(responses: dict) -> dict:
    return {
        "chest_pain_score": responses.get("chest_pain", {}).get("severity", 0),
        "shortness_of_breath": int(responses.get("sob", {}).get("present", False)),
        "med_adherence": responses.get("med_adherence", {}).get("score", 1.0),
        "red_flag": int(any(r.get("red_flag") for r in responses.values()))
    }
