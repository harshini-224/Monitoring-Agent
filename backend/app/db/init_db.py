from app.db.base import Base
from app.db.models import (
    Patient,
    CallLog,
    ReadmissionRisk,
    PatientCall,
    AgentResponse,
    User,
    SessionToken,
    Call,
)
from app.db.session import engine


def init_db():
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")


if __name__ == "__main__":
    init_db()
