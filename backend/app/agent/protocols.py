PROTOCOLS = {
    "POST_MI": [
        "INTENT_1_CHEST_PAIN",
        "INTENT_2_EXERTIONAL_CHEST_PAIN",
        "INTENT_3_PAIN_RADIATION",
        "INTENT_4_WORSENING_DYSPNEA",
        "INTENT_14_MED_ADHERENCE",
        "INTENT_16_BLEEDING"
    ],
    "HEART_FAILURE": [
        "INTENT_4_WORSENING_DYSPNEA",
        "INTENT_5_ORTHOPNEA",
        "INTENT_6_PND",
        "INTENT_7_EDEMA",
        "INTENT_8_WEIGHT_GAIN",
        "INTENT_9_URINE_OUTPUT",
        "INTENT_10_FUNCTIONAL_DECLINE",
        "INTENT_11_FATIGUE",
        "INTENT_14_MED_ADHERENCE"
    ],
    "HYPERTENSION": [
        "INTENT_4_WORSENING_DYSPNEA",
        "INTENT_12_PALPITATIONS",
        "INTENT_14_MED_ADHERENCE",
        "INTENT_15_MED_SIDE_EFFECTS"
    ],
    "ARRHYTHMIA": [
        "INTENT_12_PALPITATIONS",
        "INTENT_13_DIZZINESS",
        "INTENT_14_MED_ADHERENCE",
        "INTENT_16_BLEEDING"
    ],
    "COPD": [
        "INTENT_17_BREATHING_TREND",
        "INTENT_18_RESCUE_INHALER",
        "INTENT_19_MED_ADHERENCE_INHALER",
        "INTENT_20_COUGH",
        "INTENT_22_FEVER"
    ],
    "ASTHMA": [
        "INTENT_17_BREATHING_TREND",
        "INTENT_18_RESCUE_INHALER",
        "INTENT_19_MED_ADHERENCE_INHALER",
        "INTENT_20_COUGH",
        "INTENT_22_FEVER"
    ],
    "PNEUMONIA": [
        "INTENT_17_BREATHING_TREND",
        "INTENT_20_COUGH",
        "INTENT_21_SPUTUM_CHANGE",
        "INTENT_22_FEVER",
        "INTENT_19_MED_ADHERENCE_INHALER"
    ],
    "PE": [
        "INTENT_4_WORSENING_DYSPNEA",
        "INTENT_17_BREATHING_TREND",
        "INTENT_16_BLEEDING",
        "INTENT_23_OXYGEN_ADHERENCE",
        "INTENT_24_EXERTIONAL_HYPOXIA"
    ],
    "ILD_POST_COVID": [
        "INTENT_17_BREATHING_TREND",
        "INTENT_20_COUGH",
        "INTENT_22_FEVER",
        "INTENT_23_OXYGEN_ADHERENCE",
        "INTENT_24_EXERTIONAL_HYPOXIA",
        "INTENT_11_FATIGUE"
    ],
    "GENERAL_MONITORING": [
        "INTENT_25_OVERALL_HEALTH",
        "INTENT_26_MENTAL_STRESS",
        "INTENT_27_SELFCARE_BARRIERS",
        "INTENT_28_SOCIAL_SUPPORT",
        "INTENT_29_SAFETY_CLOSE"
    ]
}

PROTOCOL_ALIASES = {
    "POSTMI": "POST_MI",
    "POST-MI": "POST_MI",
    "POST MI": "POST_MI",
    "MI": "POST_MI",
    "HEARTFAILURE": "HEART_FAILURE",
    "HEART-FAILURE": "HEART_FAILURE",
    "HEART FAILURE": "HEART_FAILURE",
    "HF": "HEART_FAILURE",
    "CHF": "HEART_FAILURE",
    "GENERAL": "GENERAL_MONITORING",
    "GENERAL-MONITORING": "GENERAL_MONITORING",
    "GENERAL MONITORING": "GENERAL_MONITORING",
    "COPD": "COPD",
    "ASTHMA": "ASTHMA",
    "PNEUMONIA": "PNEUMONIA",
    "PE": "PE",
    "ILD": "ILD_POST_COVID",
    "ILD-POST-COVID": "ILD_POST_COVID",
    "ILD POST COVID": "ILD_POST_COVID",
    "ARRHYTHMIA": "ARRHYTHMIA",
    "HYPERTENSION": "HYPERTENSION"
}


def normalize_protocol(protocol: str | None) -> str:
    if not protocol:
        return "GENERAL_MONITORING"
    key = protocol.strip().upper()
    key = key.replace("__", "_")
    key = key.replace("-", "_")
    key = key.replace(" ", "_")
    if key in PROTOCOLS:
        return key
    alt = key.replace("_", " ")
    if alt in PROTOCOL_ALIASES:
        return PROTOCOL_ALIASES[alt]
    if key in PROTOCOL_ALIASES:
        return PROTOCOL_ALIASES[key]
    return "GENERAL_MONITORING"


def get_protocol_intents(protocol: str | None):
    normalized = normalize_protocol(protocol)
    return PROTOCOLS.get(normalized, PROTOCOLS["GENERAL_MONITORING"])
