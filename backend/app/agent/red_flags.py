def detect(structured_data: dict) -> bool:
    cardiac_red_flags = [
        "INTENT_1_CHEST_PAIN",
        "INTENT_4_WORSENING_DYSPNEA",
        "INTENT_12_PALPITATIONS",
        "INTENT_13_DIZZINESS",
        "INTENT_16_BLEEDING"
    ]

    pulmonary_red_flags = [
        "INTENT_17_BREATHING_TREND",
        "INTENT_21_SPUTUM_CHANGE",
        "INTENT_22_FEVER",
        "INTENT_24_EXERTIONAL_HYPOXIA"
    ]

    general_red_flags = [
        "INTENT_25_OVERALL_HEALTH"
    ]

    for intent in cardiac_red_flags:
        response = structured_data.get(intent, {})
        if response.get("present", False) or response.get("trend", "") == "worse":
            return True

    for intent in pulmonary_red_flags:
        response = structured_data.get(intent, {})
        if response.get("present", False) or response.get("trend", "") == "worse":
            return True

    for intent in general_red_flags:
        response = structured_data.get(intent, {})
        if response.get("trend", "") == "worse":
            return True

    if structured_data.get("pain_score", 0) >= 8:
        return True
    if structured_data.get("medication_adherence") is False:
        return True
    if structured_data.get("red_flag_symptoms", False):
        return True

    return False
