from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from app.telephony.call_handlers import voice_handler
from app.telephony.med_handlers import med_ivr, med_ivr_handle
from app.telephony.sms_handlers import sms_reply
from app.telephony.media_ws import media_socket
from app.api.dashboard import router as dashboard_router
from app.api.auth import router as auth_router
from app.api.care import router as care_router
from app.api.nurse import router as nurse_router
from app.api.doctor import router as doctor_router
from app.api.monitoring import router as monitoring_router
from app.db.init_db import init_db
from app.telephony.scheduler_async import scheduler_loop
import asyncio

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"Validation error: {exc.errors()} for request {request.url}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"

@app.middleware("http")
async def log_requests(request: Request, call_next):
    body = await request.body()
    print(f"DEBUG: Request {request.method} {request.url}")
    print(f"DEBUG: Headers: {request.headers}")
    print(f"DEBUG: Body: {body.decode('utf-8', errors='ignore')}")
    response = await call_next(request)
    print(f"DEBUG: Response status: {response.status_code}")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://troy-semipractical-kathey.ngrok-free.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/telephony/voice", include_in_schema=False)
@app.post("/telephony/voice")
async def voice(request: Request):
    return await voice_handler(request)


@app.get("/telephony/med-ivr", include_in_schema=False)
@app.post("/telephony/med-ivr")
async def med_voice(request: Request):
    return await med_ivr(request)


@app.get("/telephony/med-ivr/handle", include_in_schema=False)
@app.post("/telephony/med-ivr/handle")
async def med_voice_handle(request: Request):
    return await med_ivr_handle(request)


@app.get("/telephony/sms-reply", include_in_schema=False)
@app.post("/telephony/sms-reply")
async def sms_reply_handler(request: Request):
    return await sms_reply(request)


from app.telephony.status_handlers import med_call_status

@app.post("/telephony/status/medication")
async def med_status_endpoint(request: Request, background_tasks: BackgroundTasks):
    return await med_call_status(request, background_tasks)


app.include_router(dashboard_router)
app.include_router(auth_router)
app.include_router(care_router)
app.include_router(nurse_router)
app.include_router(doctor_router)
app.include_router(monitoring_router)



@app.get("/", include_in_schema=False)
def frontend_root():
    return RedirectResponse(url="/frontend/login.html")


if FRONTEND_DIR.exists():
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


@app.websocket("/telephony/media")
async def media(ws: WebSocket):
    await media_socket(ws)


@app.on_event("startup")
def on_startup():
    import sys
    print("DEBUG: sys.path =", sys.path)
    init_db()
    asyncio.get_event_loop().create_task(scheduler_loop())
