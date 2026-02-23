"""
Add Test Admin User to CarePulse Database
Quick script to create a test admin user for login testing
"""

from app.db.session import SessionLocal
from app.db.models import User
from app.auth.security import hash_password

def add_test_admin():
    db = SessionLocal()
    
    try:
        # Check if admin already exists
        existing_admin = db.query(User).filter(User.email == "admin@carepulse.com").first()
        
        if existing_admin:
            print("[ALREADY EXISTS] Admin user already exists!")
            print(f"   Email: {existing_admin.email}")
            print(f"   Name: {existing_admin.name}")
            print(f"   Role: {existing_admin.role}")
            return
        
        # Create test admin user
        test_admin = User(
            name="Admin User",
            email="admin@carepulse.com",
            password_hash=hash_password("admin123"),
            role="admin",
            department="Administration",
            active=True
        )
        
        db.add(test_admin)
        db.commit()
        db.refresh(test_admin)
        
        print("[SUCCESS] Test admin user created successfully!")
        print("\n=== Login Credentials ===")
        print("   Email: admin@carepulse.com")
        print("   Password: admin123")
        print(f"\n=== Access URL ===")
        print("   http://localhost:8000/frontend/auth/login.html")
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error creating admin user: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    add_test_admin()
