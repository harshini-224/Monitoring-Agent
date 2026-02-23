INTENTS = {
    "INTENT_0_DAILY_CHECKIN": {
        "domain": "general",
        "clinical_meaning": "daily check-in start",
        "response_type": "none",
        "red_flag": False,
        "allowed_phrases": [
            "Hello, this is your daily health check-in after hospital discharge.",
            "Hi, I’m here to check on your health today.",
            "Good day, let's review how you are feeling today."
        ]
    },
    "INTENT_1_CHEST_PAIN": {
        "domain": "cardiac",
        "clinical_meaning": "myocardial ischemia",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you have any chest pain or pressure today?",
            "Did you feel heaviness or tightness in your chest?",
            "Any chest discomfort since yesterday?"
        ]
    },
    "INTENT_2_EXERTIONAL_CHEST_PAIN": {
        "domain": "cardiac",
        "clinical_meaning": "effort angina",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did chest pain come while walking or climbing stairs?",
            "Did it start when you were active?",
            "Did activity bring on chest discomfort?"
        ]
    },
    "INTENT_3_PAIN_RADIATION": {
        "domain": "cardiac",
        "clinical_meaning": "typical MI radiation",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did the pain spread to your arm, jaw, neck, or back?",
            "Did it move to your left arm or jaw?",
            "Did the discomfort radiate to other areas?"
        ]
    },
    "INTENT_4_WORSENING_DYSPNEA": {
        "domain": "cardiac",
        "clinical_meaning": "HF / ischemia / PE",
        "response_type": "trend",
        "red_flag": True,
        "allowed_phrases": [
            "Was your breathing worse today than yesterday?",
            "Did you feel more breathless today?"
        ]
    },
    "INTENT_5_ORTHOPNEA": {
        "domain": "cardiac",
        "clinical_meaning": "HF decompensation",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you feel breathless while lying flat?",
            "Was it harder to breathe when lying down?",
            "Did you need extra pillows to sleep comfortably?"
        ]
    },
    "INTENT_6_PND": {
        "domain": "cardiac",
        "clinical_meaning": "paroxysmal nocturnal dyspnea",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you wake up at night feeling short of breath?",
            "Did breathing trouble wake you from sleep?",
            "Did you feel breathless suddenly during the night?"
        ]
    },
    "INTENT_7_EDEMA": {
        "domain": "cardiac",
        "clinical_meaning": "fluid overload / HF",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did your feet or legs look more swollen?",
            "Any new swelling in your ankles or legs?",
            "Did you notice puffiness in your lower limbs?"
        ]
    },
    "INTENT_8_WEIGHT_GAIN": {
        "domain": "cardiac",
        "clinical_meaning": "rapid fluid retention",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did your weight increase suddenly?",
            "Did you gain weight quickly in the last day or two?",
            "Has your weight gone up noticeably since yesterday?"
        ]
    },
    "INTENT_9_URINE_OUTPUT": {
        "domain": "cardiac",
        "clinical_meaning": "low urine output",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you pass less urine than usual?",
            "Were you urinating less today?",
            "Was your urine output lower than normal?"
        ]
    },
    "INTENT_10_FUNCTIONAL_DECLINE": {
        "domain": "cardiac",
        "clinical_meaning": "reduced daily activity tolerance",
        "response_type": "trend",
        "red_flag": True,
        "allowed_phrases": [
            "Was it harder to walk or move around today?",
            "Did daily activities feel more difficult?",
            "Did you find routine tasks more tiring today?"
        ]
    },
    "INTENT_11_FATIGUE": {
        "domain": "cardiac",
        "clinical_meaning": "low cardiac output",
        "response_type": "yes_no",
        "red_flag": False,
        "allowed_phrases": [
            "Did you feel unusually tired today?",
            "Did simple tasks make you very tired?",
            "Were you more fatigued than usual?"
        ]
    },
    "INTENT_12_PALPITATIONS": {
        "domain": "cardiac",
        "clinical_meaning": "arrhythmia",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you feel fast or irregular heartbeats?",
            "Did your heart feel like it was racing or skipping?",
            "Any unusual heartbeat sensations today?"
        ]
    },
    "INTENT_13_DIZZINESS": {
        "domain": "cardiac",
        "clinical_meaning": "arrhythmia / hypotension",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you feel dizzy or light-headed?",
            "Did you feel like you might faint?",
            "Any sudden dizziness today?"
        ]
    },
    "INTENT_14_MED_ADHERENCE": {
        "domain": "medication",
        "clinical_meaning": "non-compliance risk",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you take all your prescribed medicines today?",
            "Did you miss any of your medicines today?",
            "Were all your medications taken as prescribed?"
        ]
    },
    "INTENT_15_MED_SIDE_EFFECTS": {
        "domain": "medication",
        "clinical_meaning": "drug intolerance / side effects",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did any medicine make you feel unwell?",
            "Did you feel dizzy or weak after taking medicines?",
            "Did you experience side effects from your medication today?"
        ]
    },
    "INTENT_16_BLEEDING": {
        "domain": "medication",
        "clinical_meaning": "anticoagulant / antiplatelet bleeding",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you notice any bleeding or unusual bruising?",
            "Any bleeding from gums, nose, urine, or stool?",
            "Have you seen new bruises or bleeding today?"
        ]
    },
    "INTENT_17_BREATHING_TREND": {
        "domain": "pulmonary",
        "clinical_meaning": "respiratory deterioration",
        "response_type": "trend",
        "red_flag": True,
        "allowed_phrases": [
            "Is your breathing better, the same, or worse today?",
            "Compared to yesterday, how is your breathing?",
            "Has your breathlessness changed since yesterday?"
        ]
    },
    "INTENT_18_RESCUE_INHALER": {
        "domain": "pulmonary",
        "clinical_meaning": "COPD/asthma exacerbation",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you use your rescue inhaler more today?",
            "Did you need your quick-relief inhaler more often?",
            "Were you using extra inhaler doses today?"
        ]
    },
    "INTENT_19_MED_ADHERENCE_INHALER": {
        "domain": "medication",
        "clinical_meaning": "inhaler adherence",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you use your regular inhaler today?",
            "Did you take your daily breathing medicine?",
            "Were your maintenance inhalers used today?"
        ]
    },
    "INTENT_20_COUGH": {
        "domain": "pulmonary",
        "clinical_meaning": "infection / exacerbation",
        "response_type": "yes_no",
        "red_flag": False,
        "allowed_phrases": [
            "Did your cough increase today?",
            "Was your cough worse than yesterday?",
            "Has your cough gotten stronger today?"
        ]
    },
    "INTENT_21_SPUTUM_CHANGE": {
        "domain": "pulmonary",
        "clinical_meaning": "infection marker",
        "response_type": "yes_no",
        "red_flag": False,
        "allowed_phrases": [
            "Did your phlegm change color or amount?",
            "Was there more mucus than usual?",
            "Has your sputum changed today?"
        ]
    },
    "INTENT_22_FEVER": {
        "domain": "pulmonary",
        "clinical_meaning": "infection",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you have fever or chills?",
            "Did you feel feverish today?",
            "Have you experienced elevated temperature today?"
        ]
    },
    "INTENT_23_OXYGEN_ADHERENCE": {
        "domain": "pulmonary",
        "clinical_meaning": "oxygen therapy compliance",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you use your oxygen as advised?",
            "Were you on oxygen as prescribed today?",
            "Did you follow the oxygen instructions today?"
        ]
    },
    "INTENT_24_EXERTIONAL_HYPOXIA": {
        "domain": "pulmonary",
        "clinical_meaning": "exertional desaturation",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did you feel breathless while walking even with oxygen?",
            "Was walking difficult despite oxygen?",
            "Did exertion make you short of breath?"
        ]
    },
    "INTENT_25_OVERALL_HEALTH": {
        "domain": "general",
        "clinical_meaning": "global deterioration",
        "response_type": "trend",
        "red_flag": True,
        "allowed_phrases": [
            "Overall, do you feel better, the same, or worse today?",
            "How does today compare to yesterday?",
            "Compared to yesterday, are you feeling better, same, or worse?"
        ]
    },
    "INTENT_26_MENTAL_STRESS": {
        "domain": "general",
        "clinical_meaning": "psychosocial risk",
        "response_type": "yes_no",
        "red_flag": False,
        "allowed_phrases": [
            "Did you feel anxious or low today?",
            "Did stress affect you today?",
            "Were you feeling mentally stressed today?"
        ]
    },
    "INTENT_27_SELFCARE_BARRIERS": {
        "domain": "general",
        "clinical_meaning": "self-care / adherence barriers",
        "response_type": "yes_no",
        "red_flag": True,
        "allowed_phrases": [
            "Did anything make it hard to care for yourself today?",
            "Did any problem stop you from taking medicines?",
            "Were you unable to do daily care or take medicines today?"
        ]
    },
    "INTENT_28_SOCIAL_SUPPORT": {
        "domain": "general",
        "clinical_meaning": "social support / safety",
        "response_type": "yes_no",
        "red_flag": False,
        "allowed_phrases": [
            "Is someone available to help you at home?",
            "Do you have support if you need help?",
            "Do you have someone to assist you if needed?"
        ]
    },
    "INTENT_29_SAFETY_CLOSE": {
        "domain": "general",
        "clinical_meaning": "emergency advice / call closure",
        "response_type": "none",
        "red_flag": False,
        "allowed_phrases": [
            "Thank you for your time. If symptoms suddenly worsen, please seek emergency care.",
            "We will check in with you again tomorrow. Call immediately if you have severe symptoms.",
            "Remember to contact medical help if you feel severe chest pain, breathing difficulty, or fainting."
        ]
    }
}
