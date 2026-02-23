from dataclasses import dataclass


@dataclass
class CallContext:
    call_id: str
    protocol: str
    patient_id: int | None = None
    patient_name: str | None = None
    call_log_id: int | None = None
    patient_call_id: int | None = None
    answered: bool = False
