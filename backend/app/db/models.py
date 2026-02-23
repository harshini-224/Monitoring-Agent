from sqlalchemy import Column, Integer, Float, String, Boolean, JSON, DateTime, ForeignKey, Index, CheckConstraint
from sqlalchemy import Text
from sqlalchemy.sql import func
from app.db.base import Base


class PatientCall(Base):
    __tablename__ = "patient_calls"
    id = Column(Integer, primary_key=True)
    patient_id = Column(String, nullable=False)
    diagnosis = Column(String)
    language = Column(String, default="en")
    consent_given = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    age = Column(Integer)
    gender = Column(String)
    phone_number = Column(String, nullable=False)
    disease_track = Column(String, nullable=False)
    protocol = Column(String, nullable=False, default="POST_MI")
    timezone = Column(String, default="UTC")
    call_time = Column(String, default="10:00")
    start_date = Column(DateTime(timezone=True), server_default=func.now())
    days_to_monitor = Column(Integer, default=30)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_patient_active', 'active', 'created_at'),
        Index('idx_patient_phone', 'phone_number'),
    )


class AgentResponse(Base):
    __tablename__ = "agent_responses"
    id = Column(Integer, primary_key=True)
    call_id = Column(Integer, ForeignKey("patient_calls.id"))
    intent_id = Column(String, nullable=False)
    raw_text = Column(String)
    structured_data = Column(JSON)
    red_flag = Column(Boolean, default=False)
    confidence = Column(Float, default=50)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CallLog(Base):
    __tablename__ = "call_logs"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    patient_call_id = Column(Integer, ForeignKey("patient_calls.id"), nullable=True)
    call_sid = Column(String)
    scheduled_for = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    ended_at = Column(DateTime(timezone=True))
    status = Column(String, default="scheduled")
    answered = Column(Boolean, default=False)
    risk_score = Column(Float)
    risk_level = Column(String)
    doctor_note = Column(String)
    flow_log = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_call_log_patient_date', 'patient_id', 'created_at'),
        Index('idx_call_log_risk_level', 'risk_level', 'created_at'),
        Index('idx_call_log_status', 'status'),
    )


class ReadmissionRisk(Base):
    __tablename__ = "readmission_risks"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    call_log_id = Column(Integer, ForeignKey("call_logs.id"), nullable=True)
    score = Column(Float)
    level = Column(String)
    model_version = Column(String, default="baseline")
    explanation = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_readmission_patient', 'patient_id', 'created_at'),
        Index('idx_readmission_level', 'level', 'created_at'),
    )


class Call(Base):
    __tablename__ = "calls"
    call_id = Column(String, primary_key=True)
    phone_number = Column(String)
    started_at = Column(DateTime)
    ended_at = Column(DateTime)
    consent_given = Column(Boolean)
    status = Column(String)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, default="")
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    active = Column(Boolean, default=True)
    department = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SessionToken(Base):
    __tablename__ = "session_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    token = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CareAssignment(Base):
    __tablename__ = "care_assignments"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_name = Column(String)
    nurse_name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Intervention(Base):
    __tablename__ = "interventions"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    type = Column(String, nullable=False)
    status = Column(String, default="planned")
    note = Column(String)
    risk_before = Column(Float)
    risk_after = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)
    meta = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MedicationReminder(Base):
    __tablename__ = "medication_reminders"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    medication_name = Column(String, nullable=False)
    dose = Column(String, nullable=True)
    scheduled_for = Column(DateTime(timezone=True), nullable=False)
    sms_sent_at = Column(DateTime(timezone=True), nullable=True)
    call_placed_at = Column(DateTime(timezone=True), nullable=True)
    call_sid = Column(String, nullable=True)
    status = Column(String, default="scheduled")  # scheduled, sms_sent, call_placed, taken, missed, no_response
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_medication_patient_date', 'patient_id', 'scheduled_for'),
        Index('idx_medication_status', 'status', 'scheduled_for'),
    )


class MedicationEvent(Base):
    __tablename__ = "medication_events"
    id = Column(Integer, primary_key=True)
    reminder_id = Column(Integer, ForeignKey("medication_reminders.id"), nullable=False)
    event_type = Column(String, nullable=False)
    meta = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(Text, nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================================
# NEW PRODUCTION MODELS FOR CAREPULSE DASHBOARD SYSTEM
# ============================================================================

class PendingRegistration(Base):
    """Track user registration requests pending admin approval"""
    __tablename__ = "pending_registrations"
    
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    department = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    
    __table_args__ = (
        CheckConstraint("role IN ('staff', 'nurse', 'doctor')", name='check_pending_role'),
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name='check_pending_status'),
        Index('idx_pending_registration_email', 'email'),
        Index('idx_pending_registration_status', 'status'),
    )


class NurseCallAssignment(Base):
    """Track nurse call assignments from doctors with priority and notifications"""
    __tablename__ = "nurse_call_assignments"
    
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    call_log_id = Column(Integer, ForeignKey("call_logs.id"), nullable=True)
    assigned_by_doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_nurse_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = any nurse
    status = Column(String, nullable=False, default="pending")
    priority = Column(String, nullable=False, default="medium")
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completion_note = Column(Text, nullable=True)
    
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'in_progress', 'completed', 'cancelled')", name='check_assignment_status'),
        CheckConstraint("priority IN ('low', 'medium', 'high', 'urgent')", name='check_assignment_priority'),
        Index('idx_nurse_assignment_nurse', 'assigned_to_nurse_id', 'status'),
        Index('idx_nurse_assignment_patient', 'patient_id'),
        Index('idx_nurse_assignment_status', 'status', 'created_at'),
    )


class ResponseCorrection(Base):
    """Track nurse corrections to unclear IVR responses"""
    __tablename__ = "response_corrections"
    
    id = Column(Integer, primary_key=True)
    agent_response_id = Column(Integer, ForeignKey("agent_responses.id"), nullable=False, unique=True)
    call_log_id = Column(Integer, ForeignKey("call_logs.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    original_text = Column(Text, nullable=False)
    corrected_text = Column(Text, nullable=False)
    corrected_by_nurse_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    correction_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        Index('idx_response_correction_call', 'call_log_id'),
        Index('idx_response_correction_nurse', 'corrected_by_nurse_id', 'created_at'),
    )


class AlertAction(Base):
    """Track doctor actions on risk alerts (confirm/clear/override)"""
    __tablename__ = "alert_actions"
    
    id = Column(Integer, primary_key=True)
    call_log_id = Column(Integer, ForeignKey("call_logs.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    risk_score = Column(Float, nullable=False)
    action = Column(String, nullable=False)
    override_score = Column(Float, nullable=True)
    doctor_note = Column(Text, nullable=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    intervention_required = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        CheckConstraint("risk_score >= 0 AND risk_score <= 100", name='check_risk_score_range'),
        CheckConstraint("override_score IS NULL OR (override_score >= 0 AND override_score <= 100)", name='check_override_score_range'),
        CheckConstraint("action IN ('confirmed', 'cleared', 'overridden')", name='check_alert_action'),
        Index('idx_alert_action_patient', 'patient_id', 'created_at'),
        Index('idx_alert_action_doctor', 'doctor_id', 'created_at'),
        Index('idx_alert_action_call', 'call_log_id'),
    )


class Notification(Base):
    """Real-time notification system for nurse assignments and alerts"""
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    related_patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    related_assignment_id = Column(Integer, ForeignKey("nurse_call_assignments.id"), nullable=True)
    read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        CheckConstraint("type IN ('nurse_call_assignment', 'high_alert', 'system_notification')", name='check_notification_type'),
        Index('idx_notification_user_read', 'user_id', 'read', 'created_at'),
    )
