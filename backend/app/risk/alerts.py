ALERT_THRESHOLD = 0.65


def should_alert(risk: float) -> bool:
    return risk >= ALERT_THRESHOLD
