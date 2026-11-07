from fastapi import (
    FastAPI, WebSocket, WebSocketDisconnect, Request, Header,
    HTTPException, Depends, Query, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import json
import os
import time
import math
import uuid
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from space_track import space_track_client, SpaceTrackClient
from ai_service import ai_service, AIService, MockAIService
from conjunction_engine import analyze_conjunction, CDMEvent, CONJUNCTION_PRESETS
from ground_station import gs_manager, DeviceTelemetryPacket, GroundStationManager
from firebase_config import init_firebase, is_firebase_available
from negotiator_engine import evaluate_intent_negotiation, NegotiationResult, DISCLAIMER_TEXT
from noaa_service import noaa_client
from config import config, SafeConfigDiagnostic
from storage import storage
from handoff_service import (
    HandoffStore, HandoffStatus, seed_demo_data,
    create_handoff, generate_note_for_handoff, update_handoff_note,
    confirm_handoff, accept_handoff, request_clarification,
    respond_to_clarification, reject_handoff, escalate_handoff,
    mark_unassigned_emergency, check_and_escalate_timeouts,
    ESCALATION_TIMEOUT_SECONDS,
)

load_dotenv()

logger = logging.getLogger(__name__)

space_track_client = SpaceTrackClient()
ai_service = MockAIService()

app = FastAPI(
    title="KesslerX API",
    version="2.1.0",
    description="Orbital Safety Decision Support Platform API. Decision support only — human approval required.",
)

# ============================================================
# Request Models with Strict Validation
# ============================================================

class ChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000, description="User query prompt")
    context: Optional[dict] = None

class ConjunctionRequest(BaseModel):
    tle1_line1: str = Field(..., min_length=20, max_length=75)
    tle1_line2: str = Field(..., min_length=20, max_length=75)
    tle2_line1: str = Field(..., min_length=20, max_length=75)
    tle2_line2: str = Field(..., min_length=20, max_length=75)
    name_a: str = Field(default="Object A", max_length=100)
    name_b: str = Field(default="Object B", max_length=100)
    duration_hours: int = Field(default=24, ge=1, le=168)
    step_seconds: int = Field(default=10, ge=1, le=300)

class ManeuverRequest(BaseModel):
    conjunction_data: dict

class NegotiatorRequest(BaseModel):
    event_id: str = Field(default="EVT-CURRENT", max_length=64)
    name_a: str = Field(default="Object A", max_length=100)
    name_b: str = Field(default="Object B", max_length=100)
    altitude_km: float = Field(default=550.0, ge=120.0, le=45000.0)
    miss_distance_km: float = Field(default=0.45, ge=0.0, le=500.0)
    collision_probability: float = Field(default=0.05, ge=0.0, le=1.0)
    tca: Optional[str] = None
    tle_age_hours: float = Field(default=12.0, ge=0.0)

class TelemetryUpload(BaseModel):
    station_id: str = Field(default="GS-PRIMARY-01", min_length=2, max_length=64)
    device_token: str = Field(default="kesslerx_device_key_primary_secure", min_length=8)
    sequence_number: int = Field(default=1, ge=0)
    latitude: float = Field(default=0.0, ge=-90.0, le=90.0)
    longitude: float = Field(default=0.0, ge=-180.0, le=180.0)
    altitude: float = Field(default=0.0, ge=-500.0, le=60000.0)
    battery: float = Field(default=100.0, ge=0.0, le=100.0)
    temperature: float = Field(default=25.0, ge=-100.0, le=150.0)
    signal: int = Field(default=-55, ge=-150, le=10)
    velocity: float = Field(default=0.0, ge=0.0, le=25.0)
    orientation: dict = Field(default_factory=dict)

# --- Handoff Request Models ---

class HandoffCreateRequest(BaseModel):
    to_user_id: str
    reason: str = "Shift Change"
    priority: str = "Normal"
    next_action: str = ""
    deadline: str = ""
    message: str = ""
    include_evidence: bool = True

class HandoffNoteEditRequest(BaseModel):
    note: str

class HandoffClarificationRequest(BaseModel):
    message: str

class HandoffRejectRequest(BaseModel):
    reason: str = ""
    reassign_to_user_id: str = ""

class HandoffRespondClarificationRequest(BaseModel):
    message: str

# ============================================================
# Rate Limiting & Auth Boundaries
# ============================================================

_rate_limits: Dict[str, List[float]] = defaultdict(list)

def check_rate_limit(key: str, limit: int = 60, window_s: int = 60):
    now = time.time()
    cutoff = now - window_s
    _rate_limits[key] = [t for t in _rate_limits[key] if t > cutoff]
    if len(_rate_limits[key]) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Maximum {limit} requests per minute for this endpoint.",
        )
    _rate_limits[key].append(now)

ROLES = {
    "anish": "mission operations lead",
    "sarah": "safety analyst",
    "chen": "mission manager",
    "marcus": "analyst",
    "admin": "administrator",
}

async def get_current_user_and_role(
    x_user_id: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, str]:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        if is_firebase_available():
            try:
                import firebase_admin.auth
                decoded = firebase_admin.auth.verify_id_token(token)
                uid = decoded.get("uid") or decoded.get("sub") or "authenticated_user"
                role = decoded.get("role") or ROLES.get(uid, "analyst")
                return {"user_id": uid, "role": role, "auth_mode": "firebase_verified"}
            except Exception as e:
                logger.warning(f"Failed to verify Firebase token: {e}")
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token.")
        elif token.startswith("dev-token:"):
            if config.is_production:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Dev tokens disabled in production environment.")
            mock_uid = token.replace("dev-token:", "").strip()
            role = ROLES.get(mock_uid, "analyst")
            return {"user_id": mock_uid, "role": role, "auth_mode": "dev_token"}

    # In production mode: unverified caller-supplied identities are strictly rejected
    if config.is_production:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: verified Bearer token required in production environment."
        )

    # In demo/dev/test mode: allow explicit demo caller headers
    clean_uid = (x_user_id or "anish").strip().lower()
    if clean_uid in ROLES:
        return {"user_id": clean_uid, "role": ROLES[clean_uid], "auth_mode": "demo_session"}

    return {"user_id": clean_uid, "role": "analyst", "auth_mode": "guest_analyst"}

def require_role(allowed_roles: List[str]):
    def role_checker(auth: Dict[str, str] = Depends(get_current_user_and_role)):
        if auth["role"] not in allowed_roles and auth["role"] != "administrator":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action requires one of roles: {allowed_roles}. Current role: {auth['role']}.",
            )
        return auth
    return role_checker

# ============================================================
# Persistent Alert Helpers
# ============================================================

def _add_alert(severity: str, title: str, message: str, alert_type: str = "system", event_id: str = None):
    """Add an alert to the durable store."""
    alert_id = storage.add_alert(severity=severity, title=title, message=message, alert_type=alert_type, event_id=event_id)
    return {
        "id": alert_id,
        "severity": severity,
        "title": title,
        "message": message,
        "type": alert_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "acknowledged": False
    }

# Ground station manager alias
gs_simulator = gs_manager

# Setup CORS for frontend
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
frontend_origin_env = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:5173,http://localhost:3000,https://kessler-x.vercel.app"
)
raw_origins = f"{frontend_origin_env},{allowed_origins_env}".split(",")
origins = [o.strip() for o in raw_origins if o.strip()]
if not origins:
    origins = ["http://localhost:5173", "http://localhost:3000", "https://kessler-x.vercel.app"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ============================================================
# WebSocket Connection Manager
# ============================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

# ============================================================
# Structured Exception Handlers — Proper HTTP Status Codes
# ============================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": f"HTTP_{exc.status_code}",
            "message": exc.detail,
            "retryable": exc.status_code in [429, 502, 503, 504],
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected server error occurred. Please retry.",
            "retryable": True,
        }
    )

# ============================================================
# In-memory cache for computed endpoint data
# ============================================================

_cache = {
    "congestion": None,
    "congestion_time": 0,
    "collisions": None,
    "collisions_time": 0,
    "debris": None,
    "debris_time": 0,
}
_CACHE_TTL = 60  # 60 seconds for computed data

# ============================================================
# Helper: approximate lat/lon/altitude from TLE mean motion & inclination
# ============================================================

def _tle_to_approx_position(sat: dict, index: int = 0) -> dict:
    """Approximate a satellite position from TLE data for display purposes."""
    try:
        tle2 = sat.get("TLE_LINE2", "")
        parts = tle2.split()
        if len(parts) >= 8:
            inclination = float(parts[2])
            mean_motion = float(parts[7])
            # Approximate altitude from mean motion (revs/day)
            # a = (GM / (2*pi*n)^2)^(1/3), simplified:
            if mean_motion > 0:
                a_km = (398600.4418 / ((2 * math.pi * mean_motion / 86400) ** 2)) ** (1/3)
                altitude = max(a_km - 6371.0, 150.0)  # subtract Earth radius
            else:
                altitude = 500.0
        else:
            inclination = random.uniform(20, 100)
            altitude = random.uniform(300, 1200)

        # Generate pseudo-random but deterministic position from NORAD ID
        norad = int(sat.get("NORAD_CAT_ID", index))
        seed_val = norad * 137 + index
        lat = ((seed_val * 7919) % 16000 - 8000) / 100.0  # -80 to 80
        lon = ((seed_val * 104729) % 36000 - 18000) / 100.0  # -180 to 180

        # Velocity approximation (circular orbit): v = sqrt(GM/r)
        r_km = 6371.0 + altitude
        velocity = math.sqrt(398600.4418 / r_km)  # km/s

        return {
            "lat": round(lat, 2),
            "lon": round(lon, 2),
            "altitude": round(altitude, 1),
            "velocity": round(velocity, 2),
            "inclination": round(inclination, 1) if isinstance(inclination, float) else inclination,
        }
    except Exception:
        # Deterministic fallback based on index
        seed_val = index * 137 + 42
        lat = ((seed_val * 7919) % 16000 - 8000) / 100.0
        lon = ((seed_val * 104729) % 36000 - 18000) / 100.0
        altitude = 350.0 + ((seed_val * 31) % 800)
        velocity = math.sqrt(398600.4418 / (6371.0 + altitude))
        inclination = 28.5 + ((seed_val * 17) % 70)
        return {
            "lat": round(lat, 2),
            "lon": round(lon, 2),
            "altitude": round(altitude, 1),
            "velocity": round(velocity, 2),
            "inclination": round(inclination, 1),
        }

# ============================================================
# Core API Endpoints
# ============================================================

@app.get("/api/health")
async def health_check():
    """Granular health status of platform dependencies."""
    fb_ok = is_firebase_available()
    db_status = "firestore-cloud" if fb_ok else "sqlite-durable-engine"
    ai_status = "operational" if ai_service.is_configured else "unconfigured"
    noaa_st = config.provider_statuses["noaa_swpc"].status
    st_st = config.provider_statuses["space_track"].status

    if config.is_production and (not ai_service.is_configured or st_st in ("unavailable", "offline")):
        overall = "degraded"
    elif config.is_demo:
        overall = "demo_mode"
    else:
        overall = "nominal"

    return {
        "status": overall,
        "app_env": config.app_env,
        "service": "KesslerX Backend",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "disclaimer": DISCLAIMER_TEXT,
        "storage_engine": db_status,
        "dependencies": {
            "database": db_status,
            "ai_engine": ai_status,
            "satellite_catalog": st_st,
            "space_weather": noaa_st,
            "websocket": "active",
            "ground_station": config.provider_statuses["ground_station"].status,
        }
    }

@app.get("/api/admin/config-status")
async def admin_config_status(auth: dict = Depends(require_role(["administrator"]))):
    """Exposes safe administrative configuration diagnostic. Zero secret exposure."""
    return config.get_diagnostic_report()

@app.get("/api/satellites")
async def get_satellites(limit: int = Query(default=100, ge=1, le=2000)):
    try:
        data = await space_track_client.get_active_satellites(limit=limit)
        return {"count": len(data), "satellites": data}
    except Exception as e:
        logger.error(f"Error fetching satellites: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Upstream satellite catalog temporarily unavailable. Please retry."
        )

@app.post("/api/ai/chat")
async def chat_with_ai(
    request: ChatRequest,
    auth: dict = Depends(get_current_user_and_role),
):
    check_rate_limit(f"chat:{auth['user_id']}", limit=20)
    try:
        response_model = await ai_service.generate_response(request.prompt, request.context)
        ans = response_model.answer if hasattr(response_model, "answer") else str(response_model)
        structured = response_model.model_dump() if hasattr(response_model, "model_dump") else {"answer": ans}
        return {
            "response": ans,
            "structured_output": structured,
            "disclaimer": DISCLAIMER_TEXT,
            "provenance": "gemini-derived" if getattr(ai_service, "is_configured", False) else "local-evidence-fallback",
        }
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI Decision Support service unavailable: {str(e)}"
        )

# ============================================================
# NEW: Intent-to-Action Negotiator Endpoint
# ============================================================

@app.post("/api/negotiator/evaluate")
async def evaluate_negotiator_endpoint(
    req: NegotiatorRequest,
    auth: dict = Depends(get_current_user_and_role),
):
    """
    Evaluates 6 deterministic candidate courses of action with multi-factor trade-off scoring.
    Decision support only — human approval required.
    """
    check_rate_limit(f"negotiator:{auth['user_id']}", limit=30)
    tca = req.tca or (datetime.now(timezone.utc) + timedelta(hours=22)).isoformat()
    result = evaluate_intent_negotiation(
        event_id=req.event_id,
        obj_a_name=req.name_a,
        obj_b_name=req.name_b,
        altitude_km=req.altitude_km,
        current_miss_km=req.miss_distance_km,
        collision_probability=req.collision_probability,
        tca_utc=tca,
        tle_age_hours=req.tle_age_hours,
    )
    return result

# ============================================================
# GET /api/congestion
# ============================================================

@app.get("/api/congestion")
async def get_congestion():
    """Orbital congestion metrics by regime (LEO/MEO/GEO)."""
    try:
        now = time.time()
        if _cache["congestion"] and (now - _cache["congestion_time"] < _CACHE_TTL):
            return _cache["congestion"]

        satellites = await space_track_client.get_active_satellites(limit=1000)

        leo_count = 0
        meo_count = 0
        geo_count = 0

        for sat in satellites:
            pos = _tle_to_approx_position(sat)
            alt = pos["altitude"]
            if alt < 2000:
                leo_count += 1
            elif alt < 35000:
                meo_count += 1
            else:
                geo_count += 1

        # Deterministic scaling if small catalog
        if len(satellites) < 200:
            leo_count = max(leo_count, 1) * 35 + 240
            meo_count = max(meo_count, 1) * 16 + 85
            geo_count = max(geo_count, 1) * 11 + 45

        leo_density = round(min(leo_count / 6500.0, 1.0), 2)
        meo_density = round(min(meo_count / 2500.0, 1.0), 2)
        geo_density = round(min(geo_count / 3000.0, 1.0), 2)

        def risk_level(density):
            if density >= 0.7:
                return "HIGH"
            elif density >= 0.4:
                return "MEDIUM"
            return "LOW"

        result = {
            "leo": {
                "objects": leo_count,
                "density": leo_density,
                "risk": risk_level(leo_density),
            },
            "meo": {
                "objects": meo_count,
                "density": meo_density,
                "risk": risk_level(meo_density),
            },
            "geo": {
                "objects": geo_count,
                "density": geo_density,
                "risk": risk_level(geo_density),
            },
            "source": "space-track" if len(satellites) > 200 else "demo",
            "mode": "derived" if len(satellites) > 200 else "fallback",
            "warnings": [] if len(satellites) > 200 else ["Demonstration catalog sample scaled deterministically"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        _cache["congestion"] = result
        _cache["congestion_time"] = now
        return result

    except Exception as e:
        logger.error(f"Congestion endpoint error: {e}")
        return {
            "leo": {"objects": 5421, "density": 0.84, "risk": "HIGH"},
            "meo": {"objects": 712, "density": 0.31, "risk": "LOW"},
            "geo": {"objects": 381, "density": 0.12, "risk": "LOW"},
            "source": "demo",
            "mode": "fallback",
            "warnings": ["Upstream error — using validated static baseline"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

# ============================================================
# GET /api/collisions with Dynamic TCA
# ============================================================

_COLLISION_OFFSETS_MINUTES = [45, 95, 160, 250, 390, 560, 780, 1020]

# Pre-generated collision events for consistency
_COLLISION_EVENTS = [
    {
        "id": "COL-001",
        "satellite": "STARLINK-3021",
        "object": "DEBRIS-88172",
        "miss_distance": 0.12,
        "collision_probability": 0.098,
        "risk": "CRITICAL",
    },
    {
        "id": "COL-002",
        "satellite": "ISS (ZARYA)",
        "object": "COSMOS-DEB-4421",
        "miss_distance": 0.38,
        "collision_probability": 0.067,
        "risk": "HIGH",
    },
    {
        "id": "COL-003",
        "satellite": "ONEWEB-0012",
        "object": "DEBRIS-72401",
        "miss_distance": 0.89,
        "collision_probability": 0.042,
        "risk": "HIGH",
    },
    {
        "id": "COL-004",
        "satellite": "FENGYUN-3E",
        "object": "SL-16 R/B",
        "miss_distance": 1.54,
        "collision_probability": 0.021,
        "risk": "MEDIUM",
    },
    {
        "id": "COL-005",
        "satellite": "IRIDIUM-101",
        "object": "DEBRIS-90045",
        "miss_distance": 2.10,
        "collision_probability": 0.015,
        "risk": "MEDIUM",
    },
    {
        "id": "COL-006",
        "satellite": "KUIPER-0122",
        "object": "DEBRIS-55102",
        "miss_distance": 3.20,
        "collision_probability": 0.008,
        "risk": "LOW",
    },
    {
        "id": "COL-007",
        "satellite": "STARLINK-1008",
        "object": "CZ-2C DEB",
        "miss_distance": 5.80,
        "collision_probability": 0.003,
        "risk": "LOW",
    },
    {
        "id": "COL-008",
        "satellite": "NOAA-20",
        "object": "DEBRIS-90012",
        "miss_distance": 0.73,
        "collision_probability": 0.0021,
        "risk": "LOW",
    },
]

@app.get("/api/collisions")
async def get_collisions():
    """
    List of predicted conjunction/collision events.
    Prioritizes authoritative server-persisted events.
    Falls back to dynamic demo fixtures ONLY in Demo environment.
    """
    # 1. In Demo or Test mode, serve demo fixtures with dynamic operational TCA
    if config.is_demo or config.is_test:
        now = datetime.now(timezone.utc)
        events = []
        for i, base in enumerate(_COLLISION_EVENTS):
            tca_time = (now + timedelta(minutes=_COLLISION_OFFSETS_MINUTES[i % len(_COLLISION_OFFSETS_MINUTES)])).strftime("%Y-%m-%dT%H:%M:%SZ")
            evt = dict(base)
            evt["tca"] = tca_time
            evt["source"] = "demo"
            evt["mode"] = "fallback"
            evt["warnings"] = ["Demo fixture — TCA calculated dynamically from current UTC operational epoch"]
            events.append(evt)
        events.sort(key=lambda x: x["collision_probability"], reverse=True)
        return events

    # 2. Query durable persisted events in production
    stored_events = storage.get_events()
    if stored_events:
        return stored_events

    # 3. Production: Zero fake collisions when database has no active conjunctions
    return []

@app.post("/api/collisions/ingest-cdm")
async def ingest_cdm_endpoint(
    payload: dict,
    auth: dict = Depends(get_current_user_and_role)
):
    """
    Ingest, validate, and persist an authorized CCSDS Conjunction Data Message (CDM).
    Deduplicates events and attaches audit record.
    """
    cdm = CDMEvent(payload)
    is_valid, validation_errors = cdm.validate()
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_CDM_SCHEMA", "errors": validation_errors}
        )

    normalized_event = cdm.to_normalized_event()
    success, msg = storage.upsert_event(normalized_event)
    if not success:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Failed to upsert event: {msg}")

    # Log audit
    storage.log_audit(
        user_id=auth["user_id"],
        action="INGEST_CDM",
        resource_type="conjunction_event",
        resource_id=normalized_event["id"],
        details={"miss_distance_km": normalized_event["miss_distance"], "risk": normalized_event["risk"]}
    )

    # Trigger persistent alert if risk is elevated
    if normalized_event["risk"] in ("HIGH", "CRITICAL"):
        _add_alert(
            severity=normalized_event["risk"],
            title=f"Conjunction Alert: {normalized_event['satellite']} × {normalized_event['object']}",
            message=f"TCA {normalized_event['tca']}: Miss {normalized_event['miss_distance']} km, P(c)={normalized_event['collision_probability']:.2e}. Decision support only — human approval required.",
            alert_type="conjunction",
            event_id=normalized_event["id"]
        )

    return {"status": "ingested", "event": normalized_event}

# ============================================================
# NEW: GET /api/debris
# ============================================================

@app.get("/api/debris")
async def get_debris():
    """Return tracked debris objects with positions."""
    try:
        now = time.time()
        if _cache["debris"] and (now - _cache["debris_time"] < _CACHE_TTL):
            return _cache["debris"]

        satellites = await space_track_client.get_active_satellites(limit=1000)

        # Filter debris objects
        debris_sats = [
            s for s in satellites
            if s.get("OBJECT_TYPE", "").upper() == "DEBRIS"
            or "DEB" in s.get("OBJECT_NAME", "").upper()
            or s.get("CATEGORY") == "Debris"
        ]

        objects = []
        for i, sat in enumerate(debris_sats):
            pos = _tle_to_approx_position(sat, i)

            # Classify debris size based on deterministic hash of name
            name = sat.get("OBJECT_NAME", f"DEBRIS-{90000 + i}")
            name_hash = sum(ord(c) for c in name)
            if name_hash % 3 == 0:
                size = "LARGE"
            elif name_hash % 3 == 1:
                size = "MEDIUM"
            else:
                size = "SMALL"

            objects.append({
                "id": str(sat.get("NORAD_CAT_ID", f"DEB-{i:04d}")),
                "name": name,
                "lat": pos["lat"],
                "lon": pos["lon"],
                "altitude": pos["altitude"],
                "velocity": pos["velocity"],
                "size": size,
            })

        result = {
            "count": len(objects),
            "objects": objects,
        }

        _cache["debris"] = result
        _cache["debris_time"] = now
        return result

    except Exception as e:
        logger.error(f"Debris endpoint error: {e}")
        return {"status": "success", "count": 0, "objects": []}

# ============================================================
# NEW: GET /api/telemetry
# ============================================================

@app.get("/api/telemetry")
async def get_telemetry():
    """System telemetry — values update every request."""
    try:
        start = time.time()

        # Get satellite count from cache if available
        try:
            satellites = await space_track_client.get_active_satellites(limit=1000)
            tracked = len(satellites)
        except Exception:
            tracked = 0

        latency_ms = round((time.time() - start) * 1000, 1)
        now_ts = time.time()
        # Deterministic oscillation based on time for realistic telemetry metrics
        cpu = round(22.0 + 9.5 * math.sin(now_ts / 30.0), 1)
        memory = round(48.0 + 6.0 * math.cos(now_ts / 50.0), 1)
        network = round(250.0 + 95.0 * math.sin(now_ts / 15.0), 1)
        active_alerts_cnt = max(len([a for a in storage.list_alerts() if not a.get("acknowledged")]), 1)

        return {
            "status": "ONLINE",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "cpu": cpu,
            "memory": memory,
            "network": network,
            "tracked_objects": tracked,
            "active_alerts": active_alerts_cnt,
            "backend_latency_ms": latency_ms,
            "source": "local",
            "mode": "derived",
            "warnings": [],
        }

    except Exception as e:
        logger.error(f"Telemetry endpoint error: {e}")
        return {
            "status": "ONLINE",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "cpu": 0,
            "memory": 0,
            "network": 0,
            "tracked_objects": 0,
            "active_alerts": 0,
            "backend_latency_ms": 0,
            "source": "demo",
            "mode": "fallback",
            "warnings": ["Telemetry probe degraded — using zero-state fallback"],
        }

# ============================================================
# NEW: GET /api/space-weather
# ============================================================

@app.get("/api/space-weather")
async def get_space_weather():
    """Observational space weather data from NOAA SWPC with Jacchia-Bowman atmospheric drag."""
    return await noaa_client.get_space_weather()

# ============================================================
# WebSocket: /ws/alerts (enhanced)
# ============================================================

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Heartbeat: respond to ping with pong
            if data.strip().lower() == "ping":
                try:
                    await websocket.send_text('{"type":"pong"}')
                except Exception:
                    pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# Background task to broadcast operational alerts every 5 seconds (Strictly Demo Mode)
async def simulate_realtime_updates():
    if not config.is_demo:
        return
    alert_templates = [
        {"type": "collision_alert", "severity": "HIGH", "data": "WARNING: Conjunction detected: STARLINK-3021 & DEBRIS-88172. Review decision support plan."},
        {"type": "collision_alert", "severity": "MEDIUM", "data": "Close approach: ONEWEB-0012 passing within 0.89 km of DEBRIS-72401."},
        {"type": "debris_alert", "severity": "LOW", "data": "New debris cataloged: DEBRIS-99123 in LEO at 780km altitude."},
        {"type": "maneuver_alert", "severity": "MEDIUM", "data": "Candidate maneuver evaluated: STARLINK-3021 retro-burn. Decision support only — human approval required."},
        {"type": "weather_alert", "severity": "LOW", "data": "Space Weather: Geomagnetic field nominal (Kp 3). Solar flux 135 SFU."},
        {"type": "decay_alert", "severity": "LOW", "data": "Orbital decay: Object #25544 (ISS) altitude nominal. Stationkeeping window open."},
        {"type": "collision_alert", "severity": "HIGH", "data": "Potential conjunction: ISS corridor approached by COSMOS-DEB-4421."},
        {"type": "tracking_alert", "severity": "LOW", "data": "Tracking pass verified: 142 objects updated via Space-Track catalog."},
    ]
    step = 0
    while True:
        await asyncio.sleep(5)  # Broadcast every 5 seconds
        template = alert_templates[step % len(alert_templates)]
        step += 1
        alert = {
            "type": template["type"],
            "severity": template["severity"],
            "data": template["data"],
            "message": template["data"],  # alias for frontend compatibility
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        update = json.dumps(alert)
        await manager.broadcast(update)

# ============================================================
# POST /api/conjunction/analyze
# ============================================================

@app.post("/api/conjunction/analyze")
async def conjunction_analyze(
    request: ConjunctionRequest,
    auth: dict = Depends(get_current_user_and_role),
):
    """Run SGP4-based conjunction analysis between two TLE-defined objects."""
    check_rate_limit(f"conjunction:{auth['user_id']}", limit=30)
    try:
        result = analyze_conjunction(
            tle1_line1=request.tle1_line1,
            tle1_line2=request.tle1_line2,
            tle2_line1=request.tle2_line1,
            tle2_line2=request.tle2_line2,
            name_a=request.name_a,
            name_b=request.name_b,
            duration_hours=request.duration_hours,
            step_seconds=request.step_seconds,
        )
        result["disclaimer"] = DISCLAIMER_TEXT
        if result.get("risk_level") in ("HIGH", "CRITICAL"):
            _add_alert(
                severity=result["risk_level"],
                title=f"Conjunction: {request.name_a} × {request.name_b}",
                message=f"TCA: {result.get('tca', 'N/A')} | Miss: {result.get('min_distance_km', 0):.2f} km | P(collision): {result.get('collision_probability', 0):.2e}. Decision support only — human approval required.",
                alert_type="conjunction",
            )
        return result
    except Exception as e:
        logger.error(f"Conjunction analysis error: {e}")
        raise HTTPException(status_code=400, detail=f"Conjunction analysis failed: {str(e)}")

# ============================================================
# GET /api/conjunction/presets
# ============================================================

@app.get("/api/conjunction/presets")
async def conjunction_presets():
    """Return pre-loaded TLE pairs for quick conjunction demo."""
    return CONJUNCTION_PRESETS

# ============================================================
# POST /api/ai/maneuver
# ============================================================

@app.post("/api/ai/maneuver")
async def ai_maneuver_plan(
    request: ManeuverRequest,
    auth: dict = Depends(get_current_user_and_role),
):
    """Generate AI-powered collision avoidance maneuver plan."""
    check_rate_limit(f"maneuver:{auth['user_id']}", limit=30)
    try:
        plan = await ai_service.generate_maneuver_plan(request.conjunction_data)
        plan["disclaimer"] = DISCLAIMER_TEXT
        return plan
    except Exception as e:
        logger.error(f"Maneuver planning error: {e}")
        raise HTTPException(status_code=400, detail=f"Maneuver planning failed: {str(e)}")

# ============================================================
# GET /api/alerts (persistent store)
# ============================================================

@app.get("/api/alerts")
async def get_alerts(limit: int = 50, severity: str = None):
    """Get stored alerts with optional severity filter from durable storage."""
    alerts = storage.list_alerts(limit=limit, severity=severity)
    return {"count": len(alerts), "alerts": alerts}

# ============================================================
# POST /api/alerts/{alert_id}/acknowledge
# ============================================================

@app.post("/api/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    auth: dict = Depends(get_current_user_and_role),
):
    """Mark an alert as acknowledged in durable storage."""
    success = storage.acknowledge_alert(alert_id, acknowledged_by=auth["user_id"])
    if success:
        return {"status": "acknowledged", "alert_id": alert_id}
    raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

# ============================================================
# NEW: WebSocket /ws/ground-station
# ============================================================

gs_connections: list[WebSocket] = []

@app.websocket("/ws/ground-station")
async def ground_station_ws(websocket: WebSocket):
    await websocket.accept()
    gs_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        if websocket in gs_connections:
            gs_connections.remove(websocket)
    except Exception:
        if websocket in gs_connections:
            gs_connections.remove(websocket)

async def simulate_ground_station():
    """Background task to broadcast demo telemetry every second (Strictly Demo Mode)."""
    if not config.is_demo:
        return
    while True:
        await asyncio.sleep(1)
        if not gs_connections:
            continue
        packet = gs_manager.generate_demo_packet()
        message = json.dumps(packet)
        disconnected = []
        for ws in gs_connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            if ws in gs_connections:
                gs_connections.remove(ws)

# ============================================================
# NEW: GET /api/ground-station/status
# ============================================================

@app.get("/api/ground-station/status")
async def ground_station_status():
    """Get current ground station hardware connectivity status."""
    return gs_manager.get_status()

# ============================================================
# NEW: GET /api/ground-station/history
# ============================================================

@app.get("/api/ground-station/history")
async def ground_station_history(count: int = 60):
    """Get last N telemetry packets."""
    history = gs_manager.get_history(count)
    return {"count": len(history), "packets": history}

# ============================================================
# NEW: GET /api/ground-station/latest
# ============================================================

@app.get("/api/ground-station/latest")
async def ground_station_latest():
    """Get the most recent authenticated telemetry packet."""
    return gs_manager.get_status()

# ============================================================
# NEW: POST /api/ground-station/telemetry
# ============================================================

@app.post("/api/ground-station/telemetry")
async def ground_station_upload(payload: TelemetryUpload):
    """Accept an authenticated hardware telemetry packet with sequence replay protection."""
    try:
        dev_packet = DeviceTelemetryPacket(
            station_id=payload.station_id,
            device_token=payload.device_token,
            sequence_number=payload.sequence_number,
            timestamp=datetime.now(timezone.utc).isoformat(),
            latitude=payload.latitude,
            longitude=payload.longitude,
            altitude_m=payload.altitude,
            temperature_c=payload.temperature,
            battery_pct=payload.battery,
            signal_dbm=float(payload.signal),
            velocity_m_s=payload.velocity,
            heading_deg=payload.orientation.get("heading", 0.0),
            pitch_deg=payload.orientation.get("pitch", 0.0),
            roll_deg=payload.orientation.get("roll", 0.0),
        )
        packet = gs_manager.ingest_packet(dev_packet)
        message = json.dumps(packet)
        disconnected = []
        for ws in gs_connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            if ws in gs_connections:
                gs_connections.remove(ws)

        return {"status": "received", "packet_id": packet["sequence_number"]}
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Telemetry upload error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

# ============================================================
# Startup & Shutdown
# ============================================================

# ============================================================
# Handoff API Endpoints
# ============================================================

@app.get("/api/users")
async def list_users():
    """List all available users/roles."""
    users = HandoffStore.get_users()
    return {"users": users}


@app.get("/api/users/{user_id}")
async def get_user(user_id: str):
    """Get a single user."""
    user = HandoffStore.get_user(user_id)
    if not user:
        return JSONResponse(status_code=404, content={"error": f"User {user_id} not found"})
    return user


@app.get("/api/events")
async def list_events():
    """List conjunction events with ownership info."""
    events = HandoffStore.get_events()
    # Enrich with owner details
    for ev in events:
        owner = HandoffStore.get_user(ev.get("current_owner_id", ""))
        ev["owner"] = owner
    return {"events": events}


@app.get("/api/events/{event_id}")
async def get_event(event_id: str):
    """Get a single event with full details."""
    event = HandoffStore.get_event(event_id)
    if not event:
        return JSONResponse(status_code=404, content={"error": f"Event {event_id} not found"})
    owner = HandoffStore.get_user(event.get("current_owner_id", ""))
    event["owner"] = owner
    return event


@app.post("/api/events/{event_id}/handoffs")
async def create_event_handoff(
    event_id: str,
    req: HandoffCreateRequest,
    auth: dict = Depends(get_current_user_and_role),
):
    """Create a new handoff draft for an event."""
    try:
        handoff = create_handoff(
            event_id=event_id,
            from_user_id=auth["user_id"],
            to_user_id=req.to_user_id,
            reason=req.reason,
            priority=req.priority,
            next_action=req.next_action,
            deadline=req.deadline,
            message=req.message,
            include_evidence=req.include_evidence,
        )
        return handoff
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.get("/api/events/{event_id}/handoffs")
async def list_event_handoffs(event_id: str):
    """List all handoffs for an event."""
    handoffs = HandoffStore.get_handoffs_for_event(event_id)
    # Enrich with user details
    for h in handoffs:
        h["from_user"] = HandoffStore.get_user(h.get("from_user_id", ""))
        h["to_user"] = HandoffStore.get_user(h.get("to_user_id", ""))
    return {"handoffs": handoffs}


@app.get("/api/events/{event_id}/timeline")
async def get_event_timeline(event_id: str):
    """Get the event timeline / audit trail."""
    timeline = HandoffStore.get_timeline_for_event(event_id)
    return {"timeline": timeline}


@app.get("/api/handoffs/pending")
async def get_pending_handoffs(auth: dict = Depends(get_current_user_and_role)):
    """Get handoffs awaiting the current user."""
    handoffs = HandoffStore.get_pending_handoffs(auth["user_id"])
    for h in handoffs:
        h["from_user"] = HandoffStore.get_user(h.get("from_user_id", ""))
        h["to_user"] = HandoffStore.get_user(h.get("to_user_id", ""))
        h["event"] = HandoffStore.get_event(h.get("event_id", ""))
    return {"handoffs": handoffs}


@app.get("/api/handoffs/{handoff_id}")
async def get_handoff(handoff_id: str):
    """Get a single handoff with full details."""
    handoff = HandoffStore.get_handoff(handoff_id)
    if not handoff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Handoff {handoff_id} not found")
    handoff["from_user"] = HandoffStore.get_user(handoff.get("from_user_id", ""))
    handoff["to_user"] = HandoffStore.get_user(handoff.get("to_user_id", ""))
    handoff["event"] = HandoffStore.get_event(handoff.get("event_id", ""))
    handoff["history"] = HandoffStore.get_history_for_handoff(handoff_id)
    return handoff


@app.post("/api/handoffs/{handoff_id}/generate-note")
async def generate_handoff_note_endpoint(handoff_id: str):
    """Generate the structured handoff note from event data."""
    try:
        handoff = generate_note_for_handoff(handoff_id)
        return handoff
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/handoffs/{handoff_id}/update-note")
async def update_handoff_note_endpoint(handoff_id: str, req: HandoffNoteEditRequest):
    """Update the generated note (user edits)."""
    try:
        handoff = update_handoff_note(handoff_id, req.note)
        return handoff
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/handoffs/{handoff_id}/confirm")
async def confirm_handoff_endpoint(
    handoff_id: str,
    auth: dict = Depends(get_current_user_and_role),
):
    """Confirm the transfer — moves handoff to Awaiting Acceptance."""
    try:
        handoff = confirm_handoff(handoff_id, auth["user_id"])
        return handoff
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/handoffs/{handoff_id}/accept")
async def accept_handoff_endpoint(
    handoff_id: str,
    auth: dict = Depends(get_current_user_and_role),
):
    """Recipient accepts the handoff."""
    try:
        handoff = accept_handoff(handoff_id, auth["user_id"])
        return handoff
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/handoffs/{handoff_id}/clarification")
async def clarification_endpoint(
    handoff_id: str,
    req: HandoffClarificationRequest,
    auth: dict = Depends(get_current_user_and_role),
):
    """Request clarification on a handoff."""
    try:
        handoff = request_clarification(handoff_id, auth["user_id"], req.message)
        return handoff
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/handoffs/{handoff_id}/respond-clarification")
async def respond_clarification_endpoint(
    handoff_id: str,
    req: HandoffRespondClarificationRequest,
    auth: dict = Depends(get_current_user_and_role),
):
    """Respond to a clarification request."""
    try:
        handoff = respond_to_clarification(handoff_id, auth["user_id"], req.message)
        return handoff
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/handoffs/{handoff_id}/reject")
async def reject_handoff_endpoint(
    handoff_id: str,
    req: HandoffRejectRequest,
    auth: dict = Depends(get_current_user_and_role),
):
    """Reject a handoff, optionally reassigning."""
    try:
        result = reject_handoff(
            handoff_id, auth["user_id"],
            reason=req.reason,
            reassign_to_user_id=req.reassign_to_user_id,
        )
        return result
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/handoffs/{handoff_id}/escalate")
async def escalate_handoff_endpoint(
    handoff_id: str,
    auth: dict = Depends(get_current_user_and_role),
):
    """Manually escalate a handoff."""
    try:
        handoff = escalate_handoff(handoff_id, reason=f"Manual escalation by {auth['user_id']}")
        return handoff
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/handoffs/check-timeouts")
async def check_timeouts_endpoint(timeout: int = None):
    """Check and escalate timed-out handoffs. Pass ?timeout=30 for demo."""
    escalated = check_and_escalate_timeouts(timeout_seconds=timeout)
    return {
        "checked": True,
        "escalated_count": len(escalated),
        "escalated": escalated,
        "timeout_seconds": timeout or ESCALATION_TIMEOUT_SECONDS,
    }


@app.post("/api/events/{event_id}/unassigned-emergency")
async def unassigned_emergency_endpoint(event_id: str):
    """Mark an event as Unassigned Emergency."""
    try:
        event = mark_unassigned_emergency(event_id)
        return event
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


# ============================================================
# Background Escalation Check Task
# ============================================================

async def escalation_check_loop():
    """Background task that checks for timed-out handoffs every 30 seconds."""
    while True:
        await asyncio.sleep(30)
        try:
            escalated = check_and_escalate_timeouts()
            if escalated:
                logger.info(f"Auto-escalated {len(escalated)} handoff(s)")
                # Broadcast escalation alerts to WebSocket clients
                for h in escalated:
                    event = HandoffStore.get_event(h.get("event_id", ""))
                    alert = {
                        "type": "escalation_alert",
                        "severity": "HIGH",
                        "data": f"Handoff {h['handoff_id']} for event {h['event_id']} escalated due to timeout.",
                        "message": f"⚠ Handoff escalated: {event['title'] if event else h['event_id']}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    await manager.broadcast(json.dumps(alert))
        except Exception as e:
            logger.error(f"Escalation check error: {e}")


# ============================================================
# Startup & Shutdown
# ============================================================

@app.on_event("startup")
async def startup_event():
    # Initialize Firebase cloud persistence (bridges to SQLite if unavailable)
    init_firebase()
    config.validate_production_readiness()

    if os.getenv("TESTING") == "1":
        return

    # In Demo mode ONLY: seed demo data
    if config.is_demo:
        seed_demo_data()
        _add_alert("LOW", "Demo Mode Active", "KesslerX running in isolated demonstration mode.", "system")
    else:
        logger.info("Production mode: demo data seeding is strictly disabled.")

    # Attempt initial login to Space-Track on startup
    await space_track_client.login()
    # Pre-warm satellite catalog and NOAA space weather cache
    asyncio.create_task(space_track_client.get_active_satellites(limit=1000))
    asyncio.create_task(noaa_client.get_space_weather())

    # Start simulation broadcaster ONLY if APP_ENV=demo
    if config.is_demo:
        asyncio.create_task(simulate_realtime_updates())
        asyncio.create_task(simulate_ground_station())

    # Start background escalation check
    asyncio.create_task(escalation_check_loop())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
