import os
from pathlib import Path

# Load .env file from the backend directory
# __file__ = backend/app/config.py → parent = backend/app → parent = backend
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=_env_path, override=True)
    except ImportError:
        # Manually parse .env if python-dotenv is not installed
        with open(_env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip())

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
BASE_URL = os.getenv("BASE_URL", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
RISK_MODEL_PATH = os.getenv("RISK_MODEL_PATH", "C:/Users/Harshini/Projects/ivr_project/backend/app/risk/baseline_model.pkl")
SAMPLE_DATASET_PATH = os.getenv("SAMPLE_DATASET_PATH", "C:/Users/Harshini/Projects/ivr_project/backend/app/risk/sample_readmission.csv")
DEFAULT_COUNTRY_CODE = os.getenv("DEFAULT_COUNTRY_CODE", "+91")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")


