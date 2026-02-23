from fastapi import APIRouter, Depends, HTTPException, Header, Query, Cookie, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
import secrets

from app.db.session import SessionLocal
from app.db.models import User, SessionToken, PasswordReset, AuditEvent
from app.auth.security import hash_password, verify_password, new_token, token_expiry

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str  # doctor, staff, nurse, admin
    department: str | None = None


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str  # doctor, staff, nurse, admin
    department: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    authorization: str = Header(default=""),
    auth_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db)
):
    token = ""
    if authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
    elif auth_token:
        token = auth_token.strip()

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    session = db.query(SessionToken).filter(SessionToken.token == token).first()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid token")
    if session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Token expired")
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="User inactive")
    return user


def require_role(roles: list):
    def _guard(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _guard


@router.post("/auth/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email")
    
    if not verify_password(payload.password, user.password_hash):
        db.add(AuditEvent(
            user_id=user.id,
            action="failed_login",
            meta={"user_name": user.name, "role": user.role, "email": user.email, "reason": "incorrect_password"}
        ))
        db.commit()
        raise HTTPException(status_code=401, detail="Incorrect password")
    if not user.active:
        raise HTTPException(status_code=403, detail="User inactive")

    token = new_token()
    session = SessionToken(
        user_id=user.id,
        token=token,
        expires_at=token_expiry()
    )
    db.add(session)
    db.commit()
    db.add(AuditEvent(
        user_id=user.id,
        action="user_login",
        meta={"user_name": user.name, "role": user.role, "email": user.email}
    ))
    db.commit()
    max_age = int((session.expires_at - datetime.now(timezone.utc)).total_seconds())
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=max_age if max_age > 0 else None
    )
    return {"token": token, "role": user.role, "name": user.name}


@router.post("/auth/logout")
def logout(
    response: Response,
    authorization: str = Header(default=""),
    auth_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db)
):
    token = ""
    if authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
    elif auth_token:
        token = auth_token.strip()

    if token:
        session = db.query(SessionToken).filter(SessionToken.token == token).first()
        if session:
            user = db.query(User).filter(User.id == session.user_id).first()
            if user:
                db.add(AuditEvent(
                    user_id=user.id,
                    action="user_logout",
                    meta={"user_name": user.name, "role": user.role, "email": user.email}
                ))
        db.query(SessionToken).filter(SessionToken.token == token).delete()
    response.delete_cookie("auth_token")
    db.commit()
    return {"ok": True}


@router.get("/auth/audit")
def list_auth_audit(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.action.in_(["user_login", "user_logout"]))
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "user_id": row.user_id,
            "action": row.action,
            "meta": row.meta,
            "created_at": row.created_at.isoformat() if row.created_at else None
        }
        for row in rows
    ]


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "role": user.role, "name": user.name}


@router.get("/auth/users/options")
def user_options(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin", "staff", "doctor", "nurse"]))
):
    rows = (
        db.query(User)
        .filter(User.active.is_(True), User.role.in_(["doctor", "nurse"]))
        .order_by(User.name.asc())
        .all()
    )
    doctors = []
    nurses = []
    for row in rows:
        item = {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "department": row.department,
            "role": row.role
        }
        if row.role == "doctor":
            doctors.append(item)
        elif row.role == "nurse":
            nurses.append(item)
    return {"doctors": doctors, "nurses": nurses}


@router.post("/auth/users")
def create_user(
    payload: CreateUserRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    if payload.role not in ["doctor", "staff", "nurse", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User exists")
    new_user = User(
        name=payload.name.strip(),
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        active=True,
        department=payload.department
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    db.add(AuditEvent(
        user_id=user.id,
        action="user_created",
        meta={
            "user_name": new_user.name,
            "role": new_user.role,
            "email": new_user.email,
            "department": payload.department or ""
        }
    ))
    db.commit()
    return {"id": new_user.id, "email": new_user.email, "role": new_user.role}


@router.post("/auth/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    allowed = ["doctor", "staff", "nurse"]
    if payload.role not in allowed:
        raise HTTPException(status_code=400, detail="Invalid role")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name required")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User exists")

    new_user = User(
        name=payload.name.strip(),
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        active=False,
        department=payload.department
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "email": new_user.email, "role": new_user.role, "status": "pending"}


@router.post("/auth/forgot")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"ok": True}
    token = secrets.token_urlsafe(32)
    reset = PasswordReset(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        used=False
    )
    db.add(reset)
    db.commit()
    return {"ok": True, "reset_token": token}


@router.post("/auth/reset")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token required")
    reset = db.query(PasswordReset).filter(PasswordReset.token == token).first()
    if not reset or reset.used:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    if reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token expired")
    user = db.query(User).filter(User.id == reset.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload.password)
    reset.used = True
    db.commit()
    return {"ok": True}


@router.get("/auth/requests")
def list_access_requests(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    rows = (
        db.query(User)
        .filter(User.active.is_(False))
        .order_by(User.created_at.desc())
        .all()
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "role": row.role,
            "created_at": row.created_at.isoformat() if row.created_at else None
        }
        for row in rows
    ]


@router.post("/auth/requests/{user_id}/approve")
def approve_access_request(
    user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.active = True
    db.commit()
    db.add(AuditEvent(
        user_id=user.id,
        action="user_created",
        meta={
            "user_name": target.name,
            "role": target.role,
            "email": target.email,
            "department": ""
        }
    ))
    db.commit()
    return {"ok": True}


@router.post("/auth/requests/{user_id}/reject")
def reject_access_request(
    user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    db.add(AuditEvent(
        user_id=user.id,
        action="account_disabled",
        meta={
            "user_name": target.name,
            "role": target.role,
            "email": target.email
        }
    ))
    db.delete(target)
    db.commit()
    return {"ok": True}


@router.get("/admin/staff")
def list_staff(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    results = []
    for row in users:
        last_event = (
            db.query(AuditEvent)
            .filter(AuditEvent.user_id == row.id)
            .order_by(AuditEvent.created_at.desc())
            .first()
        )
        results.append({
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "role": row.role,
            "active": row.active,
            "department": row.department,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "last_active": last_event.created_at.isoformat() if last_event and last_event.created_at else None
        })
    return results


@router.get("/admin/events")
def list_admin_events(
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    allowed = [
        "user_login",
        "user_logout",
        "failed_login",
        "password_reset",
        "user_created",
        "role_changed",
        "account_disabled",
        "ivr_service_restart",
        "scheduler_delay",
        "api_failure",
        "twilio_webhook_error"
    ]
    rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.action.in_(allowed))
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    results = []
    for row in rows:
        actor = db.query(User).filter(User.id == row.user_id).first()
        meta = row.meta or {}
        if actor:
            meta = dict(meta)
            meta.setdefault("user_name", actor.name)
            meta.setdefault("role", actor.role)
        results.append({
            "id": row.id,
            "user_id": row.user_id,
            "action": row.action,
            "meta": meta,
            "created_at": row.created_at.isoformat() if row.created_at else None
        })
    return results


@router.get("/admin/security")
def security_metrics(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    now = datetime.now(timezone.utc)
    users = db.query(User).all()
    active_users = [u for u in users if u.active]
    active_count = len(active_users) or 1

    active_sessions = (
        db.query(SessionToken)
        .filter(SessionToken.expires_at > now)
        .all()
    )
    active_session_users = {s.user_id for s in active_sessions}
    mfa_coverage = round((len([u for u in active_users if u.id in active_session_users]) / active_count) * 100)

    ninety_days_ago = now - timedelta(days=90)
    rotated = len([u for u in active_users if u.created_at and u.created_at >= ninety_days_ago])
    password_rotation = round((rotated / active_count) * 100)

    policy_exceptions = len([u for u in users if not u.active])

    return {
        "mfa_coverage": mfa_coverage,
        "password_rotation": password_rotation,
        "policy_exceptions": policy_exceptions
    }


@router.delete("/auth/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["admin"]))
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Cleanup sessions
    db.query(SessionToken).filter(SessionToken.user_id == user_id).delete()

    db.add(AuditEvent(
        user_id=user.id,
        action="account_disabled",
        meta={
            "deleted_user_name": target.name,
            "deleted_user_email": target.email,
            "role": target.role
        }
    ))
    db.delete(target)
    db.commit()
    return {"ok": True}
