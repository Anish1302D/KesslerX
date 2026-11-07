"""
KesslerX Backend — Comprehensive API Tests
Tests all endpoints for 200 status, valid JSON, and correct response shapes.
"""
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# ============================================================
# Health
# ============================================================

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "nominal"
    assert data["service"] == "KesslerX Backend"


# ============================================================
# Satellites
# ============================================================

def test_get_satellites():
    response = client.get("/api/satellites?limit=2")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert "satellites" in data
    assert isinstance(data["satellites"], list)


# ============================================================
# Congestion
# ============================================================

def test_congestion():
    response = client.get("/api/congestion")
    assert response.status_code == 200
    data = response.json()
    assert "leo" in data
    assert "meo" in data
    assert "geo" in data
    assert "objects" in data["leo"]
    assert "density" in data["leo"]
    assert "risk" in data["leo"]
    assert isinstance(data["leo"]["objects"], (int, float))
    assert 0 <= data["leo"]["density"] <= 1.0


# ============================================================
# Collisions
# ============================================================

def test_collisions():
    response = client.get("/api/collisions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Check first event has required keys
    event = data[0]
    assert "id" in event
    assert "satellite" in event
    assert "collision_probability" in event
    assert "risk" in event


# ============================================================
# Debris
# ============================================================

def test_debris():
    response = client.get("/api/debris")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert "objects" in data
    assert isinstance(data["objects"], list)


# ============================================================
# Telemetry
# ============================================================

def test_telemetry():
    response = client.get("/api/telemetry")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ONLINE"
    assert "cpu" in data
    assert "memory" in data
    assert "network" in data
    assert "tracked_objects" in data
    assert "backend_latency_ms" in data
    assert isinstance(data["cpu"], (int, float))


# ============================================================
# Space Weather
# ============================================================

def test_space_weather():
    response = client.get("/api/space-weather")
    assert response.status_code == 200
    data = response.json()
    assert "solar_flux" in data
    assert "kp_index" in data
    assert "geomagnetic_storm" in data
    assert "radiation_level" in data
    assert isinstance(data["kp_index"], int)
    assert 0 <= data["kp_index"] <= 9
    assert data["geomagnetic_storm"] in ("NONE", "MINOR", "MODERATE", "SEVERE")
    assert data["radiation_level"] in ("LOW", "MODERATE", "HIGH")


# ============================================================
# Alerts
# ============================================================

def test_alerts():
    response = client.get("/api/alerts")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert "alerts" in data
    assert isinstance(data["alerts"], list)


def test_alerts_with_severity_filter():
    response = client.get("/api/alerts?severity=LOW")
    assert response.status_code == 200
    data = response.json()
    for alert in data["alerts"]:
        assert alert["severity"] == "LOW"


# ============================================================
# Alert Acknowledge
# ============================================================

def test_acknowledge_alert_not_found():
    response = client.post("/api/alerts/nonexistent/acknowledge")
    assert response.status_code == 404


# ============================================================
# Conjunction Presets
# ============================================================

def test_conjunction_presets():
    response = client.get("/api/conjunction/presets")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    preset = data[0]
    assert "id" in preset
    assert "object_a" in preset
    assert "object_b" in preset


# ============================================================
# AI Chat
# ============================================================

from unittest.mock import AsyncMock

def test_ai_chat(monkeypatch):
    mock_generate = AsyncMock(return_value="Collision risk detected")
    monkeypatch.setattr("main.ai_service.generate_response", mock_generate)
    
    response = client.post(
        "/api/ai/chat",
        json={"prompt": "Is there any collision risk?"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "response" in data


# ============================================================
# Ground Station
# ============================================================

def test_ground_station_status():
    response = client.get("/api/ground-station/status")
    assert response.status_code == 200
    data = response.json()
    assert "station_id" in data
    assert "connected" in data
    assert "packet_count" in data
    assert "battery_pct" in data
    assert "temperature_c" in data


def test_ground_station_history():
    response = client.get("/api/ground-station/history?count=5")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert "packets" in data
    assert isinstance(data["packets"], list)


def test_ground_station_latest():
    response = client.get("/api/ground-station/latest")
    assert response.status_code == 200
    data = response.json()
    # Should return either a packet or a status dict
    assert isinstance(data, dict)


def test_ground_station_telemetry_upload():
    payload = {
        "latitude": 19.076,
        "longitude": 72.877,
        "altitude": 14.0,
        "battery": 85.5,
        "temperature": 28.3,
        "signal": -60,
        "velocity": 0.1,
        "orientation": {"heading": 90.0, "pitch": 1.5, "roll": -0.5}
    }
    response = client.post("/api/ground-station/telemetry", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "received"
    assert "packet_id" in data


# ============================================================
# No 404s — verify critical routes exist
# ============================================================

def test_no_404_on_any_api():
    """Ensure none of the documented endpoints return 404."""
    endpoints = [
        "/api/health",
        "/api/satellites",
        "/api/congestion",
        "/api/collisions",
        "/api/debris",
        "/api/telemetry",
        "/api/space-weather",
        "/api/alerts",
        "/api/conjunction/presets",
        "/api/ground-station/status",
        "/api/ground-station/history",
        "/api/ground-station/latest",
    ]
    for endpoint in endpoints:
        response = client.get(endpoint)
        assert response.status_code != 404, f"{endpoint} returned 404!"
        assert response.status_code == 200, f"{endpoint} returned {response.status_code}"


# ============================================================
# Phase 4 & 7 Tests: Health, Negotiator, Dynamic TCA
# ============================================================

def test_health_granular_dependencies():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "nominal"
    assert "dependencies" in data
    assert "database" in data["dependencies"]
    assert "ai_engine" in data["dependencies"]
    assert "satellite_catalog" in data["dependencies"]
    assert "Decision support only — human approval required" in data["disclaimer"]


def test_negotiator_evaluate_endpoint():
    response = client.post(
        "/api/negotiator/evaluate",
        json={
            "event_id": "EVT-TEST-API",
            "name_a": "STARLINK-1001",
            "name_b": "DEBRIS-88172",
            "altitude_km": 550.0,
            "miss_distance_km": 0.22,
            "collision_probability": 0.08,
            "tle_age_hours": 12.0,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["event_id"] == "EVT-TEST-API"
    assert len(data["candidates"]) == 6
    assert "Decision support only — human approval required" in data["disclaimer"]
    recommended = [c for c in data["candidates"] if c["recommended"]]
    assert len(recommended) == 1


def test_collisions_dynamic_tca():
    response = client.get("/api/collisions")
    assert response.status_code == 200
    events = response.json()
    assert len(events) > 0
    first = events[0]
    assert "tca" in first
    assert first["source"] == "demo"
    assert first["mode"] == "fallback"
    assert len(first["warnings"]) > 0


def test_validation_error_structured_response():
    # Negative duration should fail validation with 422
    response = client.post(
        "/api/conjunction/analyze",
        json={
            "tle1_line1": "1 25544U 98067A   26079.52187500  .00016717  00000-0  10270-3 0  9005",
            "tle1_line2": "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537",
            "tle2_line1": "1 88172U          26079.52187500  .00000000  00000-0  00000-0 0  9999",
            "tle2_line2": "2 88172  51.6420 247.4600 0006700 130.5300 325.0200 15.72125000    01",
            "duration_hours": -5,  # Invalid
        },
    )
    assert response.status_code == 422
