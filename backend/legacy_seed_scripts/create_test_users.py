"""
Create initial test users for CarePulse system
Run this script to add test admin and doctor accounts
"""

import sys
sys.path.insert(0, 'backend')

from app.db.session import SessionLocal
from app.db.models import User
from app.auth.security import hash_password

def create_test_users():
    db = SessionLocal()
    
    try:
        # Check if admin already exists
        existing_admin = db.query(User).filter(User.email == "admin@carepulse.com").first()
        if existing_admin:
            print("[OK] Admin user already exists (admin@carepulse.com)")
        else:
            # Create admin user
            admin = User(
                name="Admin User",
                email="admin@carepulse.com",
                password_hash=hash_password("admin123"),
                role="admin",
                active=True,
                department="Administration"
            )
            db.add(admin)
            db.commit()
            print("[OK] Created admin user:")
            print("  Email: admin@carepulse.com")
            print("  Password: admin123")
        
        # Check if doctor already exists
        existing_doctor = db.query(User).filter(User.email == "doctor@carepulse.com").first()
        if existing_doctor:
            print("[OK] Doctor user already exists (doctor@carepulse.com)")
        else:
            # Create doctor user
            doctor = User(
                name="Dr. Smith",
                email="doctor@carepulse.com",
                password_hash=hash_password("doctor123"),
                role="doctor",
                active=True,
                department="Cardiology"
            )
            db.add(doctor)
            db.commit()
            print("[OK] Created doctor user:")
            print("  Email: doctor@carepulse.com")
            print("  Password: doctor123")
        
        # Check if nurse already exists
        existing_nurse = db.query(User).filter(User.email == "nurse@carepulse.com").first()
        if existing_nurse:
            print("[OK] Nurse user already exists (nurse@carepulse.com)")
        else:
            # Create nurse user
            nurse = User(
                name="Nurse Johnson",
                email="nurse@carepulse.com",
                password_hash=hash_password("nurse123"),
                role="nurse",
                active=True,
                department="Post-Discharge Care"
            )
            db.add(nurse)
            db.commit()
            print("[OK] Created nurse user:")
            print("  Email: nurse@carepulse.com")
            print("  Password: nurse123")
        
        # Check if staff already exists
        existing_staff = db.query(User).filter(User.email == "staff@carepulse.com").first()
        if existing_staff:
            print("[OK] Staff user already exists (staff@carepulse.com)")
        else:
            # Create staff user
            staff = User(
                name="Staff Member",
                email="staff@carepulse.com",
                password_hash=hash_password("staff123"),
                role="staff",
                active=True,
                department="Patient Services"
            )
            db.add(staff)
            db.commit()
            print("[OK] Created staff user:")
            print("  Email: staff@carepulse.com")
            print("  Password: staff123")
        
        print("\n[SUCCESS] Test users are ready!")
        print("\nYou can now login at: http://localhost:8000/frontend/login.html")
        
    except Exception as e:
        print(f"[ERROR] Error creating users: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_test_users()
