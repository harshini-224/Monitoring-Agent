"""
Purge All System Data
Deletes all patients, calls, risks, and users except for the primary admin.
"""

from app.db.session import SessionLocal
from app.db.models import (
    User, Patient, PatientCall, AgentResponse, CallLog, 
    ReadmissionRisk, Call, SessionToken, CareAssignment, 
    Intervention, AuditEvent, MedicationReminder, MedicationEvent, 
    PasswordReset, PendingRegistration, NurseCallAssignment, 
    ResponseCorrection, AlertAction, Notification
)

def purge_system_data():
    db = SessionLocal()
    print("Starting system data purge...")
    
    try:
        # 1. Delete all transactional/patient data
        print("Cleaning up patient and call data...")
        db.query(MedicationEvent).delete()
        db.query(MedicationReminder).delete()
        db.query(ResponseCorrection).delete()
        db.query(NurseCallAssignment).delete()
        db.query(AlertAction).delete()
        db.query(Notification).delete()
        db.query(Intervention).delete()
        db.query(CareAssignment).delete()
        db.query(ReadmissionRisk).delete()
        db.query(AgentResponse).delete()
        db.query(CallLog).delete()
        db.query(PatientCall).delete()
        db.query(Call).delete()
        db.query(Patient).delete()
        
        # 2. Clean up users
        print("Cleaning up user accounts (preserving admin)...")
        # Find admin to preserve
        admin = db.query(User).filter(User.email == "admin@carepulse.com").first()
        
        if not admin:
            print("WARNING: admin@carepulse.com not found. Ensuring at least one admin exists later.")
        
        # Delete pending registrations
        db.query(PendingRegistration).delete()
        
        # Delete password resets
        db.query(PasswordReset).delete()
        
        # Delete session tokens for all but admin (or just delete all, admin can login again)
        db.query(SessionToken).delete()
        
        # Delete audit events
        db.query(AuditEvent).delete()
        
        # Delete all users EXCEPT the primary admin
        db.query(User).filter(User.email != "admin@carepulse.com").delete()
        
        db.commit()
        print("SUCCESS: System data purged successfully.")
        
        if admin:
            print(f"Remaining active user: {admin.email} ({admin.role})")
        else:
            print("NOTE: No users remain in the system. Please run add_test_admin.py to create an account.")

    except Exception as e:
        db.rollback()
        print(f"ERROR: Failed to purge data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    purge_system_data()
