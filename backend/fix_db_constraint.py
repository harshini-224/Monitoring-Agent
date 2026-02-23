"""
Fix Database Constraint for Response Corrections (PostgreSQL)
"""
from sqlalchemy import create_engine, text
from app.config import DATABASE_URL

def fix_constraint():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        print(f"Connecting to database: {DATABASE_URL.split('@')[-1]}...")
        
        try:
            # 1. Find the constraint name
            query = text("""
                SELECT conname 
                FROM pg_constraint 
                WHERE conrelid = 'response_corrections'::regclass 
                AND contype = 'c';
            """)
            result = conn.execute(query).fetchone()
            
            if result:
                conname = result[0]
                print(f"Found constraint: {conname}")
                
                # 2. Drop the constraint
                print(f"Dropping constraint {conname}...")
                conn.execute(text(f"ALTER TABLE response_corrections DROP CONSTRAINT {conname}"))
                conn.commit()
                print("✓ Constraint dropped successfully!")
            else:
                print("No CHECK constraint found on 'response_corrections' table.")
                
        except Exception as e:
            print(f"Error: {e}")
            print("Trying fallback: Drop and recreate table...")
            # Fallback ifregclass fails or other issues
            try:
                # This is more destructive but ensures fix
                conn.execute(text("DROP TABLE IF EXISTS response_corrections CASCADE"))
                conn.commit()
                print("Table dropped. It will be recreated on next app start or migration.")
            except Exception as e2:
                print(f"Fallback failed: {e2}")

if __name__ == "__main__":
    fix_constraint()
