"""
Tests for Phone Satellite Simulator (PHONE-SATELLITE-001), Deterministic Mock Orbit,
Raspberry Pi 3 Ground Station Enforced Telemetry Validation, and Tilt-Driven
Demonstration Collision Probability Model.
"""

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from main import app, _COLLISION_EVENTS
from phone_satellite import (
    PHONE_SATELLITE_IDENTITY,
    PHONE_MOCK_ORBIT_ELEMENTS,
    GROUND_STATION_ID,
    propagate_phone_orbit,
    evaluate_tilt_conjunction,
    phone_satellite_state,
)
from space_track import SpaceTrackClient

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_phone_state():
    phone_satellite_state.reset()
    yield
    phone_satellite_state.reset()


def _valid_rpi_packet(seq: int = 1, roll: float = 0.0, pitch: float = 0.0, yaw: float = 0.0):
    return {
        "device_id": "PHONE-SATELLITE-001",
        "satellite_name": "PHONE SATELLITE",
        "sequence": seq,
        "timestamp": "2026-11-17T12:00:00Z",
        "received_at": "2026-11-17T12:00:00.120Z",
        "orientation": {
            "roll_deg": roll,
            "pitch_deg": pitch,
            "yaw_deg": yaw,
        },
        "angular_velocity": {
            "x_dps": 0.1,
            "y_dps": -0.2,
            "z_dps": 0.05,
        },
        "source": "phone_sensor",
        "mode": "simulated",
        "ground_station_id": "KX-RPI3-GS-001",
    }


def test_phone_satellite_exists_separately_from_existing_catalog():
    resp = client.get("/api/phone-satellite")
    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == "PHONE-SATELLITE-001"
    assert data["name"] == "PHONE SATELLITE"
    assert data["object_type"] == "PHONE_SATELLITE"
    assert data["category"] == "Phone Satellite"
    assert data["source"] == "phone_sensor"
    assert data["mode"] == "simulated"
    assert data["ground_station_id"] == "KX-RPI3-GS-001"
    assert data["color"] == "#FF2EF5"

    # Separate from existing satellite catalog
    sats_resp = client.get("/api/satellites?limit=500")
    assert sats_resp.status_code == 200
    sat_ids = [str(s.get("NORAD_CAT_ID")) for s in sats_resp.json()["satellites"]]
    assert "PHONE-SATELLITE-001" not in sat_ids


def test_phone_satellite_deterministic_independent_orbit():
    ts = "2026-11-17T12:00:00Z"
    resp1 = client.get(f"/api/phone-satellite/orbit?timestamp={ts}")
    resp2 = client.get(f"/api/phone-satellite/orbit?timestamp={ts}")
    assert resp1.status_code == 200
    assert resp2.status_code == 200

    o1 = resp1.json()
    o2 = resp2.json()
    assert o1["orbit_type"] == "MOCK_LEO_PHONE_DEMO"
    assert o1["semi_major_axis_km"] == 7021.0
    assert o1["altitude_km"] == 650.0
    assert o1["inclination_deg"] == 72.0
    assert o1["eccentricity"] == 0.012
    assert o1["raan_deg"] == 145.0
    assert o1["argument_of_perigee_deg"] == 38.0
    assert o1["mean_anomaly_deg"] == 215.0
    assert o1["period_minutes"] == 97.4

    # Determinism: same input timestamp always produces exact same position
    assert o1["current_position"] == o2["current_position"]
    assert len(o1["ground_track_preview"]) > 10

    # Different timestamps produce distinct positions along orbit
    later_pos = propagate_phone_orbit(datetime(2026, 11, 17, 12, 10, 0, tzinfo=timezone.utc))
    assert later_pos["lat"] != o1["current_position"]["lat"]

    # Orbit differs from existing SpaceTrack presets (altitude 650 km & inclination 72 deg)
    mock_catalog = SpaceTrackClient().get_full_mock_data()
    assert all(s["OBJECT_NAME"] != "PHONE SATELLITE" for s in mock_catalog)


def test_existing_satellites_debris_and_collisions_unchanged():
    # Existing collisions endpoint remains intact & unpolluted
    col_resp = client.get("/api/collisions")
    assert col_resp.status_code == 200
    collisions = col_resp.json()
    assert len(collisions) == len(_COLLISION_EVENTS)
    assert all(c["id"] != "PHONE-DEMO-CONJUNCTION-001" for c in collisions)
    assert collisions[0]["source"] == "demo"
    assert collisions[0]["mode"] == "fallback"

    # Existing debris fixture count & records remain intact
    deb_resp = client.get("/api/debris")
    assert deb_resp.status_code == 200
    deb_data = deb_resp.json()
    assert deb_data["count"] > 0
    assert all(d["name"] != "PHONE SATELLITE" for d in deb_data["objects"])


def test_valid_phone_telemetry_accepted_and_reflected_in_latest():
    payload = _valid_rpi_packet(seq=7, roll=12.5, pitch=-4.0, yaw=180.0)
    post_resp = client.post("/api/ground-station/telemetry", json=payload)
    assert post_resp.status_code == 200
    post_data = post_resp.json()
    assert post_data["status"] == "received"
    assert post_data["device_id"] == "PHONE-SATELLITE-001"
    assert post_data["ground_station_id"] == "KX-RPI3-GS-001"

    latest_resp = client.get("/api/ground-station/latest")
    assert latest_resp.status_code == 200
    latest = latest_resp.json()
    assert latest["device_id"] == "PHONE-SATELLITE-001"
    assert latest["ground_station_id"] == "KX-RPI3-GS-001"
    assert latest["orientation"]["roll_deg"] == 12.5
    assert latest["phone_telemetry"]["sequence"] == 7

    phone_resp = client.get("/api/phone-satellite")
    assert phone_resp.status_code == 200
    phone_data = phone_resp.json()
    assert phone_data["telemetry"]["link_status"] == "LIVE_RPI3_GATEWAY"
    assert phone_data["telemetry"]["orientation"]["roll_deg"] == 12.5
    assert phone_data["conjunction"]["roll_deg"] == 12.5


@pytest.mark.parametrize(
    "bad_payload,desc",
    [
        # Direct attempt bypassing Raspberry Pi ground station (e.g. laptop or missing GS)
        ({**_valid_rpi_packet(), "ground_station_id": None}, "missing ground station id"),
        ({**_valid_rpi_packet(), "ground_station_id": "LAPTOP-DIRECT"}, "laptop pretending to be GS"),
        ({**_valid_rpi_packet(), "ground_station_id": "KX-GS-01"}, "wrong ground station id"),
        ({**_valid_rpi_packet(), "device_id": "LAPTOP-SIM"}, "wrong device_id"),
        ({**_valid_rpi_packet(), "source": "laptop_browser"}, "wrong source"),
        ({**_valid_rpi_packet(), "mode": "live"}, "wrong mode"),
        ({**_valid_rpi_packet(), "sequence": 0}, "non-positive sequence"),
        ({**_valid_rpi_packet(), "timestamp": "not-a-timestamp"}, "invalid timestamp"),
        ({**_valid_rpi_packet(), "orientation": {"roll_deg": 250.0, "pitch_deg": 0.0, "yaw_deg": 0.0}}, "out-of-range roll"),
        ({**_valid_rpi_packet(), "orientation": {"roll_deg": 0.0, "pitch_deg": -200.0, "yaw_deg": 0.0}}, "out-of-range pitch"),
        ({**_valid_rpi_packet(), "orientation": {"roll_deg": 0.0, "pitch_deg": 0.0}}, "missing yaw_deg"),
        ({**_valid_rpi_packet(), "angular_velocity": {"x_dps": 5000.0, "y_dps": 0.0, "z_dps": 0.0}}, "out-of-range gyro"),
    ],
)
def test_invalid_or_bypass_phone_telemetry_is_rejected(bad_payload, desc):
    resp = client.post("/api/ground-station/telemetry", json=bad_payload)
    assert resp.status_code == 422, f"Expected 422 rejection for {desc}, got {resp.status_code}"


def test_tilt_collision_probability_progression_determinism_and_cap():
    # 1. Level phone orientation -> low demonstration risk (0.5% - 1.5%, SAFE)
    level_pkt = _valid_rpi_packet(seq=1, roll=0.5, pitch=-0.5, yaw=0.0)
    client.post("/api/ground-station/telemetry", json=level_pkt)
    c_level = client.get("/api/phone-satellite/conjunction").json()
    assert c_level["id"] == "PHONE-DEMO-CONJUNCTION-001"
    assert c_level["satellite"] == "PHONE SATELLITE"
    assert c_level["object"] == "PHONE-DEMO-DEBRIS-001"
    assert c_level["source"] == "simulation"
    assert c_level["mode"] == "simulated"
    assert c_level["model_label"] == "DEMO SIMULATION"
    assert c_level["miss_distance_km"] == 0.85
    assert c_level["tca_hours"] == 6.0
    assert c_level["confidence"] == 100
    assert c_level["risk_level"] in ("SAFE", "LOW")
    assert 0.0 <= c_level["collision_probability"] <= 0.015

    # 2. Moderate tilt -> probability increases to MEDIUM / HIGH
    mod_pkt = _valid_rpi_packet(seq=2, roll=22.0, pitch=10.0, yaw=15.0)
    client.post("/api/ground-station/telemetry", json=mod_pkt)
    c_mod = client.get("/api/phone-satellite/conjunction").json()
    assert c_mod["collision_probability"] > c_level["collision_probability"]
    assert c_mod["risk_level"] in ("MEDIUM", "HIGH")

    # 3. Strong tilt -> CRITICAL risk, never exceeding 0.60
    strong_pkt = _valid_rpi_packet(seq=3, roll=65.0, pitch=40.0, yaw=15.0)
    client.post("/api/ground-station/telemetry", json=strong_pkt)
    c_strong = client.get("/api/phone-satellite/conjunction").json()
    assert c_strong["collision_probability"] > c_mod["collision_probability"]
    assert c_strong["risk_level"] == "CRITICAL"
    assert 0.35 <= c_strong["collision_probability"] <= 0.60

    # Extreme clamped angles must still stay <= 0.60
    c_extreme = evaluate_tilt_conjunction(180.0, 180.0, 90.0)
    assert c_extreme["collision_probability"] <= 0.60
    assert c_extreme["collision_probability"] == 0.60

    # 4. Returning to level lowers risk back down
    return_pkt = _valid_rpi_packet(seq=4, roll=0.0, pitch=0.0, yaw=15.0)
    client.post("/api/ground-station/telemetry", json=return_pkt)
    c_return = client.get("/api/phone-satellite/conjunction").json()
    assert c_return["collision_probability"] < c_strong["collision_probability"]
    assert c_return["collision_probability"] == 0.005
    assert c_return["risk_level"] == "SAFE"

    # 5. Pure determinism: identical roll/pitch always yield identical outputs
    d1 = evaluate_tilt_conjunction(18.5, -11.2, 42.0, "2026-11-17T12:00:00Z")
    d2 = evaluate_tilt_conjunction(18.5, -11.2, 42.0, "2026-11-17T12:00:00Z")
    assert d1 == d2
    assert GROUND_STATION_ID == "KX-RPI3-GS-001"
    assert PHONE_SATELLITE_IDENTITY["color"] == "#FF2EF5"
    assert PHONE_MOCK_ORBIT_ELEMENTS["orbit_type"] == "MOCK_LEO_PHONE_DEMO"
