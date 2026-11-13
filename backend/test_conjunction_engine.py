"""
KesslerX Orbital Mechanics, Conjunction Engine, Space-Track & Ground Station CI Tests.
Validates TLE verification, Foster 2D collision probability, SGP4 conjunction propagation,
Space-Track object categorization, and Ground Station telemetry simulation.
"""

from conjunction_engine import (
    validate_tle,
    compute_collision_probability,
    classify_risk,
    get_recommended_action,
    analyze_conjunction,
    CONJUNCTION_PRESETS,
)
from space_track import SpaceTrackClient
from ground_station import GroundStationSimulator


# ============================================================
# TLE Validation Tests
# ============================================================

def test_validate_tle_valid_lines():
    preset = CONJUNCTION_PRESETS[0]
    ok, msg = validate_tle(preset["object_a"]["tle_line1"], preset["object_a"]["tle_line2"])
    assert ok is True
    assert msg == "OK"


def test_validate_tle_rejects_invalid_inputs():
    ok_empty, _ = validate_tle("", "")
    assert ok_empty is False

    ok_prefix1, _ = validate_tle("X" + "0" * 68, "2" + "0" * 68)
    assert ok_prefix1 is False

    ok_prefix2, _ = validate_tle("1" + "0" * 68, "X" + "0" * 68)
    assert ok_prefix2 is False

    ok_short, _ = validate_tle("1 25544U", "2 25544")
    assert ok_short is False


def test_all_conjunction_presets_have_valid_tles():
    assert len(CONJUNCTION_PRESETS) >= 3
    for preset in CONJUNCTION_PRESETS:
        ok_a, msg_a = validate_tle(preset["object_a"]["tle_line1"], preset["object_a"]["tle_line2"])
        ok_b, msg_b = validate_tle(preset["object_b"]["tle_line1"], preset["object_b"]["tle_line2"])
        assert ok_a is True, f"Preset {preset['id']} Object A invalid: {msg_a}"
        assert ok_b is True, f"Preset {preset['id']} Object B invalid: {msg_b}"


# ============================================================
# Collision Probability & Risk Classification Tests
# ============================================================

def test_collision_probability_monotonicity_and_bounds():
    p_zero = compute_collision_probability(0.0, 10.0)
    p_close = compute_collision_probability(0.1, 10.0)
    p_medium = compute_collision_probability(1.0, 10.0)
    p_far = compute_collision_probability(50.0, 10.0)

    assert 0.0 <= p_zero <= 1.0
    assert p_zero > p_close > p_medium > p_far >= 0.0


def test_classify_risk_thresholds():
    assert classify_risk(0.05) == "CRITICAL"
    assert classify_risk(0.005) == "HIGH"
    assert classify_risk(0.0005) == "MEDIUM"
    assert classify_risk(0.00001) == "LOW"
    assert classify_risk(0.0) == "SAFE"


def test_recommended_action_messages():
    for level in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "SAFE"):
        action = get_recommended_action(level, 0.45)
        assert isinstance(action, str)
        assert "0.45 km" in action


# ============================================================
# SGP4 Conjunction Analysis Tests
# ============================================================

def test_analyze_conjunction_sgp4_propagation():
    preset = CONJUNCTION_PRESETS[0]
    report = analyze_conjunction(
        tle1_line1=preset["object_a"]["tle_line1"],
        tle1_line2=preset["object_a"]["tle_line2"],
        tle2_line1=preset["object_b"]["tle_line1"],
        tle2_line2=preset["object_b"]["tle_line2"],
        name_a=preset["object_a"]["name"],
        name_b=preset["object_b"]["name"],
        duration_hours=2,
        step_seconds=60,
    )
    assert "error" not in report
    assert report["object_a_name"] == "ISS (ZARYA)"
    assert report["object_b_name"] == "STARLINK-1007"
    assert report["min_distance_km"] >= 0.0
    assert 0.0 <= report["collision_probability"] <= 1.0
    assert report["risk_level"] in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "SAFE")
    assert len(report["trajectory_a"]) > 0
    assert len(report["trajectory_b"]) > 0
    assert len(report["separation_timeline"]) > 0
    assert len(report["events"]) == 1


def test_analyze_conjunction_handles_invalid_tle():
    report = analyze_conjunction(
        tle1_line1="INVALID",
        tle1_line2="INVALID",
        tle2_line1=CONJUNCTION_PRESETS[0]["object_b"]["tle_line1"],
        tle2_line2=CONJUNCTION_PRESETS[0]["object_b"]["tle_line2"],
    )
    assert "error" in report


# ============================================================
# Space-Track Category & Quota Tests
# ============================================================

def test_space_track_assign_category():
    st = SpaceTrackClient()
    assert st.assign_category({"OBJECT_NAME": "ISS (ZARYA)", "OBJECT_TYPE": "PAYLOAD"}) == "ISS"
    assert st.assign_category({"OBJECT_NAME": "STARLINK-3021", "OBJECT_TYPE": "PAYLOAD"}) == "Communication"
    assert st.assign_category({"OBJECT_NAME": "NOAA 19", "OBJECT_TYPE": "PAYLOAD"}) == "Weather"
    assert st.assign_category({"OBJECT_NAME": "COSMOS 2551", "OBJECT_TYPE": "PAYLOAD"}) == "Military"
    assert st.assign_category({"OBJECT_NAME": "NAVSTAR 77", "OBJECT_TYPE": "PAYLOAD"}) == "GPS"
    assert st.assign_category({"OBJECT_NAME": "HUBBLE", "OBJECT_TYPE": "PAYLOAD"}) == "Scientific"
    assert st.assign_category({"OBJECT_NAME": "FENGYUN 1C DEB", "OBJECT_TYPE": "DEBRIS"}) == "Debris"


# ============================================================
# Ground Station Simulator Tests
# ============================================================

def test_ground_station_packet_generation_and_status():
    sim = GroundStationSimulator(station_id="KX-TEST-GS")
    pkt = sim.generate_packet()

    assert pkt["station_id"] == "KX-TEST-GS"
    assert pkt["packet_id"] == 1
    assert pkt["packet_type"] in ("sensor", "heartbeat", "alert")
    assert 0.0 <= pkt["battery_pct"] <= 100.0

    status = sim.get_status()
    assert status["station_id"] == "KX-TEST-GS"
    assert status["connected"] is True
    assert status["packet_count"] == 1

    history = sim.get_history(count=5)
    assert len(history) == 1

