from typing import List


def _parse_yes_no(text: str) -> str:
    t = (text or "").lower()
    if any(w in t for w in ["yes", "yeah", "yup", "yep", "true", "sure", "of course", "affirmative"]):
        return "yes"
    if any(w in t for w in ["no", "nope", "nah", "not", "negative", "never"]):
        return "no"
    return "unknown"


def _parse_trend(text: str) -> str:
    t = (text or "").lower()
    if any(w in t for w in ["yes", "yeah", "yup", "yep", "true", "sure", "affirmative"]):
        return "worse"
    if any(w in t for w in ["no", "nope", "nah", "not", "negative"]):
        return "same"
    if any(w in t for w in ["better", "improved", "good", "great", "much better"]):
        return "better"
    if any(w in t for w in ["worse", "worsening", "bad", "terrible", "much worse"]):
        return "worse"
    if any(w in t for w in ["same", "no change", "unchanged", "okay", "fine", "about the same"]):
        return "same"
    return "unknown"


def _parse_choice(text: str, options: List[str]) -> str:
    t = (text or "").lower()
    for opt in options or []:
        o = (opt or "").strip().lower()
        if not o:
            continue
        if o in t:
            return o
    return "unknown"


def _extract_keywords(text: str) -> list[str]:
    t = (text or "").lower()
    tokens = []
    word = ""
    for ch in t:
        if ch.isalnum() or ch in ["+", "-"]:
            word += ch
        else:
            if word:
                tokens.append(word)
                word = ""
    if word:
        tokens.append(word)

    stop = {
        "the","a","an","and","or","but","if","then","so","to","of","for","with","on","in","at","by","from",
        "is","are","was","were","be","been","being","am","i","you","he","she","we","they","it","me","my",
        "your","yours","his","her","hers","our","ours","their","theirs","this","that","these","those",
        "do","did","does","done","not","no","yes","yeah","yup","nope","nah","ok","okay","please","thanks"
    }
    keywords = []
    seen = set()
    for tok in tokens:
        if tok in stop:
            continue
        if len(tok) < 3:
            continue
        if tok not in seen:
            keywords.append(tok)
            seen.add(tok)
    return keywords[:12]


def extract(intent_id: str, response_type: str, transcript: str, question: str = "", clinical_meaning: str = "", options: List[str] | None = None) -> dict:
    options = options or []
    if response_type == "none":
        return {"present": False, "confidence": 0, "keywords": _extract_keywords(transcript)}
    if response_type == "yes_no":
        answer = _parse_yes_no(transcript)
        return {"answer": answer, "present": answer == "yes", "confidence": 90, "keywords": _extract_keywords(transcript)}
    if response_type == "trend":
        trend = _parse_trend(transcript)
        return {"trend": trend, "confidence": 90, "keywords": _extract_keywords(transcript)}
    if response_type in ["choice", "options", "scale"]:
        answer = _parse_choice(transcript, options)
        return {"answer": answer, "confidence": 90, "keywords": _extract_keywords(transcript)}
    return {"raw": transcript, "confidence": 50, "keywords": _extract_keywords(transcript)}
