"""
Database migration script to add new CarePulse production models
Run this to create the new tables and indexes
"""

from sqlalchemy import create_engine, text
from app.db.models import Base
from app.db.session import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migration():
    """Create all new tables and indexes"""
    logger.info("Starting database migration...")
    
    try:
        # Create all tables (will skip existing ones)
        Base.metadata.create_all(bind=engine)
        logger.info("✓ All tables created/verified")
        
        # Verify new tables exist
        with engine.connect() as conn:
            # Check for new tables
            new_tables = [
                'pending_registrations',
                'nurse_call_assignments',
                'response_corrections',
                'alert_actions',
                'notifications'
            ]
            
            for table_name in new_tables:
                result = conn.execute(text(
                    f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
                ))
                if result.fetchone():
                    logger.info(f"✓ Table '{table_name}' exists")
                else:
                    logger.warning(f"✗ Table '{table_name}' not found")
        
        logger.info("Migration completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = run_migration()
    if success:
        print("\n✅ Database migration completed!")
    else:
        print("\n❌ Database migration failed!")
