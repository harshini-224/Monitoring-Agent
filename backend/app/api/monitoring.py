"""
Production Monitoring and Health Check Endpoints for CarePulse
Provides system health status, metrics, and observability
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict

from app.api.auth import require_role
from app.db.models import (
    User,
    Patient,
    CallLog,
    ReadmissionRisk,
    AuditEvent,
    NurseCallAssignment,
    MedicationReminder,
)
from app.db.session import SessionLocal

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# RESPONSE SCHEMAS
# ============================================================================

class HealthCheck(BaseModel):
    status: str  # healthy, degraded, unhealthy
    timestamp: str
    version: str
    checks: Dict[str, str]


class SystemMetrics(BaseModel):
    timestamp: str
    patient_counts: Dict[str, int]
    call_stats: Dict[str, int]
    risk_distribution: Dict[str, int]
    user_counts: Dict[str, int]
    performance: Dict[str, float]


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/health", response_model=HealthCheck)
def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for load balancers and monitoring systems.
    Checks database connectivity and critical system components.
    """
    checks = {}
    overall_status = "healthy"
    
    # Check database connection
    try:
        db.execute("SELECT 1")
        checks["database"] = "healthy"
    except Exception as e:
        checks["database"] = f"unhealthy: {str(e)}"
        overall_status = "unhealthy"
    
    # Check if we can query critical tables
    try:
        db.query(User).first()
        db.query(Patient).first()
        checks["tables"] = "healthy"
    except Exception as e:
        checks["tables"] = f"unhealthy: {str(e)}"
        overall_status = "unhealthy"
    
    # Check Twilio (optional - we don't want to fail health check if Twilio is down)
    try:
        # We'll skip actual Twilio check to avoid external dependency in health check
        # In production, you could add actual Twilio API ping here
        checks["twilio"] = "not_checked"
    except Exception as e:
        checks["twilio"] = f"degraded: {str(e)}"
        if overall_status == "healthy":
            overall_status = "degraded"
    
    return HealthCheck(
        status=overall_status,
        timestamp=datetime.now(timezone.utc).isoformat(),
        version="1.0.0",  # TODO: Read from config or env variable
        checks=checks
    )


@router.get("/metrics", response_model=SystemMetrics)
def get_system_metrics(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    """
    System metrics endpoint for admin dashboard.
    Provides comprehensive statistics about system usage and performance.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hour_ago = now - timedelta(hours=1)
    
    # Patient metrics
    total_patients = db.query(func.count(Patient.id)).scalar()
    active_patients = db.query(func.count(Patient.id)).filter(Patient.active == True).scalar()
    enrolled_today = db.query(func.count(Patient.id)).filter(
        Patient.created_at >= today_start
    ).scalar()
    
    # Call metrics
    total_calls_today = db.query(func.count(CallLog.id)).filter(
        CallLog.created_at >= today_start
    ).scalar()
    
    answered_calls_today = db.query(func.count(CallLog.id)).filter(
        CallLog.created_at >= today_start,
        CallLog.answered == True
    ).scalar()
    
    unanswered_calls_today = db.query(func.count(CallLog.id)).filter(
        CallLog.created_at >= today_start,
        CallLog.answered == False
    ).scalar()
    
    # Risk distribution
    high_risk = db.query(func.count(CallLog.id)).filter(
        CallLog.risk_level == "high",
        CallLog.created_at >= today_start
    ).scalar() or 0
    
    medium_risk = db.query(func.count(CallLog.id)).filter(
        CallLog.risk_level == "medium",
        CallLog.created_at >= today_start
    ).scalar() or 0
    
    low_risk = db.query(func.count(CallLog.id)).filter(
        CallLog.risk_level == "low",
        CallLog.created_at >= today_start
    ).scalar() or 0
    
    # User metrics
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.active == True).scalar()
    
    users_by_role = {
        "admin": db.query(func.count(User.id)).filter(User.role == "admin", User.active == True).scalar() or 0,
        "doctor": db.query(func.count(User.id)).filter(User.role == "doctor", User.active == True).scalar() or 0,
        "nurse": db.query(func.count(User.id)).filter(User.role == "nurse", User.active == True).scalar() or 0,
        "staff": db.query(func.count(User.id)).filter(User.role == "staff", User.active == True).scalar() or 0,
    }
    
    # Performance metrics (simplified - in production you'd use APM tools)
    # For now, we'll just count errors and recent activity
    errors_last_hour = db.query(func.count(AuditEvent.id)).filter(
        AuditEvent.created_at >= hour_ago,
        AuditEvent.action.like('%error%')
    ).scalar() or 0
    
    actions_last_hour = db.query(func.count(AuditEvent.id)).filter(
        AuditEvent.created_at >= hour_ago
    ).scalar() or 0
    
    # Calculate average response time (mock - in production use actual metrics)
    avg_response_time_ms = 150.0  # Placeholder
    error_rate = (errors_last_hour / max(actions_last_hour, 1)) * 100
    
    return SystemMetrics(
        timestamp=now.isoformat(),
        patient_counts={
            "total": total_patients or 0,
            "active": active_patients or 0,
            "enrolled_today": enrolled_today or 0,
        },
        call_stats={
            "total_today": total_calls_today or 0,
            "answered_today": answered_calls_today or 0,
            "unanswered_today": unanswered_calls_today or 0,
        },
        risk_distribution={
            "high": high_risk,
            "medium": medium_risk,
            "low": low_risk,
        },
        user_counts={
            "total": total_users or 0,
            "active": active_users or 0,
            **users_by_role
        },
        performance={
            "avg_response_time_ms": avg_response_time_ms,
            "error_rate_pct": round(error_rate, 2),
            "actions_last_hour": actions_last_hour or 0,
        }
    )


@router.get("/admin/system-status")
def admin_system_status(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    """
    Comprehensive system status for admin dashboard.
    Combines health check + metrics + additional admin information.
    """
    health = health_check(db)
    metrics = get_system_metrics(db, user)
    
    # Additional admin-specific info
    pending_assignments = db.query(func.count(NurseCallAssignment.id)).filter(
        NurseCallAssignment.status == "pending"
    ).scalar() or 0
    
    scheduled_medications_today = db.query(func.count(MedicationReminder.id)).filter(
        func.date(MedicationReminder.scheduled_for) == datetime.now(timezone.utc).date(),
        MedicationReminder.status.in_(["scheduled", "sms_sent"])
    ).scalar() or 0
    
    return {
        "health": health,
        "metrics": metrics,
        "admin_info": {
            "pending_nurse_assignments": pending_assignments,
            "scheduled_medications_today": scheduled_medications_today,
        }
    }
