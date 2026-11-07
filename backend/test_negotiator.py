import pytest
from negotiator_engine import evaluate_intent_negotiation, compute_deterministic_maneuver, DISCLAIMER_TEXT

def test_compute_deterministic_maneuver_positive():
    res = compute_deterministic_maneuver(
        altitude_km=500.0,
        current_miss_km=0.5,
        target_miss_km=50.0,
        mass_kg=500.0,
    )
    assert res["delta_v_m_s"] > 0
    assert res["fuel_cost_kg"] > 0
    assert res["burn_duration_seconds"] > 0
    assert res["orbital_period_seconds"] > 5000

def test_evaluate_intent_negotiation_generates_six_candidates():
    result = evaluate_intent_negotiation(
        event_id="EVT-TEST-001",
        obj_a_name="STARLINK-1001",
        obj_b_name="DEBRIS-88172",
        altitude_km=550.0,
        current_miss_km=0.15,
        collision_probability=0.08,
        tca_utc="2026-08-05T18:40:00Z",
    )

    assert result.event_id == "EVT-TEST-001"
    assert len(result.candidates) == 6
    assert result.disclaimer == DISCLAIMER_TEXT

    # Check candidate IDs
    candidate_types = [c.action_type for c in result.candidates]
    assert "MANEUVER_A" in candidate_types
    assert "MANEUVER_B" in candidate_types
    assert "SENSOR_TASKING" in candidate_types
    assert "HOLD_RESCREEN" in candidate_types
    assert "ESCALATE" in candidate_types
    assert "INSUFFICIENT_DATA" in candidate_types

    # Ensure exactly one candidate is recommended
    recommended = [c for c in result.candidates if c.recommended]
    assert len(recommended) == 1

    # Check every candidate carries mandatory safety disclaimer
    for cand in result.candidates:
        assert "Decision support only — human approval required" in cand.disclaimer
        assert 0.0 <= cand.composite_score <= 100.0
        assert 0.0 <= cand.risk_reduction_score <= 100.0

def test_stale_tle_recommends_insufficient_data():
    result = evaluate_intent_negotiation(
        event_id="EVT-STALE",
        obj_a_name="SAT-A",
        obj_b_name="SAT-B",
        altitude_km=400.0,
        current_miss_km=1.0,
        collision_probability=0.05,
        tca_utc="2026-08-05T18:40:00Z",
        tle_age_hours=96.0,  # 4 days old TLE
    )
    recommended = [c for c in result.candidates if c.recommended][0]
    assert recommended.action_type == "INSUFFICIENT_DATA"

