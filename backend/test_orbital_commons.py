import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

os.environ["TESTING"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ai_service import MockAIService
from main import app
from orbital_commons_engine import (
    ENGINE_VERSION,
    POLICY_WEIGHTS,
    PolicyMode,
    ReviewStatus,
    build_default_demo_commons_request,
    evaluate_orbital_commons,
    orbital_commons_store,
)
from pydantic import ValidationError

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_store():
    orbital_commons_store.reset()
    yield
    orbital_commons_store.reset()


def _fresh_req(**overrides):
    base = build_default_demo_commons_request().model_dump(mode="json")
    base.update(overrides)
    return base


def test_valid_orbital_commons_request_structure():
    payload = _fresh_req(event_id="OC-TEST-001")
    res = client.post("/api/orbital-commons/evaluate", json=payload)
    assert res.status_code == 200
    body = res.json()

    assert body["event_id"] == "OC-TEST-001"
    assert body["status"] == "EVALUATED"
    assert body["disclaimer"] == "Decision support only — human approval required. Not a flight command system."
    assert len(body["candidates"]) == 7
    expected_actions = {
        "MANEUVER_PRIMARY",
        "MANEUVER_SECONDARY",
        "ADDITIONAL_TRACKING",
        "HOLD_AND_RESCREEN",
        "COORDINATED_SPLIT_MANEUVER",
        "ESCALATE_HUMAN_SAFETY_LEAD",
        "INSUFFICIENT_DATA",
    }
    assert {c["action_type"] for c in body["candidates"]} == expected_actions
    assert len(body["pareto_frontier"]) >= 1
    assert body["counterfactual"]["question"] == "What happens if no action is taken?"
    assert len(body["audit_hash_sha256"]) == 64
    assert body["review_state"]["command_executed"] is False
    assert body["explanation"]["disclaimer"].startswith("Decision support only")


def test_invalid_probability_rejected_with_422():
    payload = _fresh_req(event_id="OC-BAD-PC", collision_probability=1.45)
    res = client.post("/api/orbital-commons/evaluate", json=payload)
    assert res.status_code == 422


def test_invalid_or_passed_tca_returns_insufficient_data():
    invalid_tca = _fresh_req(event_id="OC-BAD-TCA", tca="not-a-timestamp")
    res1 = client.post("/api/orbital-commons/evaluate", json=invalid_tca)
    assert res1.status_code == 200
    assert res1.json()["status"] == "INSUFFICIENT_DATA"
    assert res1.json()["recommended_candidate_id"] == "OPT-7-INSUFFICIENT-DATA"

    past_tca = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat().replace("+00:00", "Z")
    passed_req = _fresh_req(event_id="OC-PAST-TCA", tca=past_tca, reference_time_utc=None)
    res2 = client.post("/api/orbital-commons/evaluate", json=passed_req)
    assert res2.status_code == 200
    assert res2.json()["status"] == "INSUFFICIENT_DATA"
    assert res2.json()["review_state"]["status"] == "INSUFFICIENT_DATA"


def test_stale_tle_and_missing_covariance_return_insufficient_data():
    stale = _fresh_req(event_id="OC-STALE-TLE", tle_age_hours=96.0)
    res_stale = client.post("/api/orbital-commons/evaluate", json=stale)
    assert res_stale.status_code == 200
    body_stale = res_stale.json()
    assert body_stale["status"] == "INSUFFICIENT_DATA"
    assert any("tle" in m.lower() or "ephemeris" in m.lower() for m in body_stale["missing_inputs"])

    no_cov = _fresh_req(event_id="OC-NO-COV")
    no_cov["impact_graph"]["uncertainty_summary"] = {
        "covariance_available": False,
        "source": "Missing CDM",
    }
    res_cov = client.post("/api/orbital-commons/evaluate", json=no_cov)
    assert res_cov.status_code == 200
    assert res_cov.json()["status"] == "INSUFFICIENT_DATA"


def test_non_maneuverable_debris_rejects_secondary_and_split():
    payload = _fresh_req(event_id="OC-DEBRIS-SEC", secondary_object="COSMOS-DEB-991")
    payload["operator_b"]["maneuverable"] = False
    payload["operator_b"]["available_delta_v_m_s"] = 0.0
    res = client.post("/api/orbital-commons/evaluate", json=payload)
    assert res.status_code == 200
    cands = {c["action_type"]: c for c in res.json()["candidates"]}
    assert cands["MANEUVER_SECONDARY"]["feasible"] is False
    assert any("non-maneuverable" in r.lower() for r in cands["MANEUVER_SECONDARY"]["rejected_reasons"])
    assert cands["COORDINATED_SPLIT_MANEUVER"]["feasible"] is False


def test_insufficient_delta_v_rejects_maneuver():
    payload = _fresh_req(event_id="OC-LOW-DV")
    payload["operator_a"]["available_delta_v_m_s"] = 0.1
    payload["operator_b"]["available_delta_v_m_s"] = 0.1
    res = client.post("/api/orbital-commons/evaluate", json=payload)
    assert res.status_code == 200
    cands = {c["action_type"]: c for c in res.json()["candidates"]}
    assert cands["MANEUVER_PRIMARY"]["feasible"] is False
    assert any("delta-v" in r.lower() or "budget" in r.lower() for r in cands["MANEUVER_PRIMARY"]["rejected_reasons"])
    assert cands["MANEUVER_SECONDARY"]["feasible"] is False
    assert cands["COORDINATED_SPLIT_MANEUVER"]["feasible"] is False


def test_blackout_window_conflict_rejects_option():
    ref = datetime(2026, 11, 17, 12, 0, 0, tzinfo=timezone.utc)
    tca = ref + timedelta(hours=14)
    # Burn lead time is 6h prior to TCA -> T-6h from TCA (ref + 8h)
    bo_start = (tca - timedelta(hours=7)).isoformat().replace("+00:00", "Z")
    bo_end = (tca - timedelta(hours=5)).isoformat().replace("+00:00", "Z")

    payload = _fresh_req(
        event_id="OC-BLACKOUT",
        tca=tca.isoformat().replace("+00:00", "Z"),
        reference_time_utc=ref.isoformat().replace("+00:00", "Z"),
    )
    payload["operator_b"]["blackout_windows"] = [f"{bo_start}/{bo_end}"]
    res = client.post("/api/orbital-commons/evaluate", json=payload)
    assert res.status_code == 200
    cands = {c["action_type"]: c for c in res.json()["candidates"]}
    assert cands["MANEUVER_SECONDARY"]["feasible"] is False
    assert any("blackout" in r.lower() for r in cands["MANEUVER_SECONDARY"]["rejected_reasons"])


def test_mission_availability_violation_rejects_option():
    payload = _fresh_req(event_id="OC-AVAIL-STRICT")
    payload["operator_b"]["minimum_service_availability_percent"] = 99.0
    res = client.post("/api/orbital-commons/evaluate", json=payload)
    assert res.status_code == 200
    cands = {c["action_type"]: c for c in res.json()["candidates"]}
    assert cands["MANEUVER_SECONDARY"]["feasible"] is False
    assert any("availability" in r.lower() for r in cands["MANEUVER_SECONDARY"]["rejected_reasons"])


def test_nearby_object_externality_penalty_applied():
    quiet = _fresh_req(event_id="OC-QUIET")
    quiet["impact_graph"]["nearby_objects"] = []

    crowded = _fresh_req(event_id="OC-CROWDED")
    # Default demo has COSMOS-DEB-4421 at 586 km which conflicts with +28 km shift of OPT-1
    res_quiet = client.post("/api/orbital-commons/evaluate", json=quiet).json()
    res_crowded = client.post("/api/orbital-commons/evaluate", json=crowded).json()

    c1_quiet = next(c for c in res_quiet["candidates"] if c["action_type"] == "MANEUVER_PRIMARY")
    c1_crowded = next(c for c in res_crowded["candidates"] if c["action_type"] == "MANEUVER_PRIMARY")
    assert c1_quiet["feasible"] is True
    assert c1_crowded["feasible"] is False
    assert res_crowded["counterfactual"]["nearby_at_risk_count"] >= 1


def test_fairness_penalizes_unequal_burden_and_repeat_maneuvers():
    payload = _fresh_req(event_id="OC-FAIRNESS")
    payload["impact_graph"]["nearby_objects"] = []  # keep all feasible for direct comparison
    res = client.post("/api/orbital-commons/evaluate", json=payload).json()
    cands = {c["action_type"]: c for c in res["candidates"]}
    # Operator A has prior_maneuver_count=2 and full unilateral burn, so OPT-1 fairness < OPT-5 split fairness
    assert cands["COORDINATED_SPLIT_MANEUVER"]["fairness_score"] > cands["MANEUVER_PRIMARY"]["fairness_score"]
    assert cands["COORDINATED_SPLIT_MANEUVER"]["cost_bearer"] == "Shared (Operator A & Operator B)"


def test_policy_selection_changes_ranking_and_recommendation():
    r_fair = client.post("/api/orbital-commons/evaluate", json=_fresh_req(event_id="OC-P-FAIR", policy="FAIR_BURDEN_SHARING")).json()
    r_fuel = client.post("/api/orbital-commons/evaluate", json=_fresh_req(event_id="OC-P-FUEL", policy="MINIMUM_FUEL")).json()
    r_cont = client.post(
        "/api/orbital-commons/evaluate",
        json=_fresh_req(event_id="OC-P-CONT", policy="MINIMUM_MISSION_INTERRUPTION"),
    ).json()

    assert r_fair["recommended_candidate_id"] == "OPT-5-COORDINATED-SPLIT"
    assert r_fuel["recommended_candidate_id"] == "OPT-2-MANEUVER-SECONDARY"
    assert r_cont["recommended_candidate_id"] == "OPT-3-ADDITIONAL-TRACKING"


def test_pareto_frontier_contains_non_dominated_feasible_only():
    res = client.post("/api/orbital-commons/evaluate", json=_fresh_req(event_id="OC-PARETO")).json()
    frontier = set(res["pareto_frontier"])
    cands = {c["id"]: c for c in res["candidates"]}
    assert len(frontier) >= 2
    for cid in frontier:
        assert cands[cid]["feasible"] is True
        assert cands[cid]["pareto_optimal"] is True

    dims = (
        "risk_reduction_score",
        "fuel_efficiency_score",
        "mission_continuity_score",
        "uncertainty_score",
        "externality_score",
        "fairness_score",
    )
    for cid in frontier:
        cand = cands[cid]
        for other in res["candidates"]:
            if not other["feasible"] or other["id"] == cid:
                continue
            dominated = all(other[d] >= cand[d] for d in dims) and any(other[d] > cand[d] for d in dims)
            assert dominated is False


def test_deterministic_evaluation_and_hash_behavior():
    req1 = build_default_demo_commons_request()
    req2 = build_default_demo_commons_request()
    res1 = evaluate_orbital_commons(req1)
    res2 = evaluate_orbital_commons(req2)

    assert res1.audit_hash_sha256 == res2.audit_hash_sha256
    assert [c.composite_score for c in res1.candidates] == [c.composite_score for c in res2.candidates]

    # Changing an input field changes the SHA-256 hash
    req_changed_input = req1.model_copy(update={"miss_distance_km": 0.45})
    assert evaluate_orbital_commons(req_changed_input).audit_hash_sha256 != res1.audit_hash_sha256

    # Changing policy/weights changes the SHA-256 hash
    req_changed_policy = req1.model_copy(update={"policy": PolicyMode.MINIMUM_FUEL})
    assert evaluate_orbital_commons(req_changed_policy).audit_hash_sha256 != res1.audit_hash_sha256

    # Changing engine version changes canonical hash directly
    import orbital_commons_engine as oce
    old_ver = oce.ENGINE_VERSION
    try:
        oce.ENGINE_VERSION = "orbital-commons-9.9.9"
        res_ver = evaluate_orbital_commons(req1)
        assert res_ver.audit_hash_sha256 != res1.audit_hash_sha256
    finally:
        oce.ENGINE_VERSION = old_ver


def test_private_constraints_masked_in_cross_operator_view():
    res = client.get("/api/orbital-commons/events/OC-DEMO-001").json()
    for summary in res["operator_constraint_summaries"]:
        assert summary["privacy_protected"] is True
        assert summary["authorized_private_details"] is None

    # Authorized viewer sees only their own private details, never the peer's
    res_op_a = client.get("/api/orbital-commons/events/OC-DEMO-001?viewer_operator_id=op_imaging_alpha").json()
    summaries = {s["operator_label"]: s for s in res_op_a["operator_constraint_summaries"]}
    assert summaries["Operator A"]["authorized_private_details"] is not None
    assert summaries["Operator B"]["authorized_private_details"] is None


def test_two_person_approval_workflow_and_rejection():
    # Step 1: Anish submits first review
    r1 = client.post(
        "/api/orbital-commons/events/OC-DEMO-001/approve",
        headers={"x-user-id": "anish"},
        json={"candidate_id": "OPT-5-COORDINATED-SPLIT", "notes": "Verified split margin", "safety_acknowledged": True},
    )
    assert r1.status_code == 200
    assert r1.json()["review_state"]["status"] == ReviewStatus.FIRST_REVIEW_COMPLETE.value
    assert r1.json()["review_state"]["command_executed"] is False

    # Step 2: Same reviewer (Anish) cannot perform second review (Two-Person Rule)
    r_same = client.post(
        "/api/orbital-commons/events/OC-DEMO-001/approve",
        headers={"x-user-id": "anish"},
        json={"candidate_id": "OPT-5-COORDINATED-SPLIT", "notes": "Attempting self-second review", "safety_acknowledged": True},
    )
    assert r_same.status_code == 403
    assert "two-person rule" in r_same.json()["message"].lower()

    # Step 3: Distinct reviewer (Sarah) completes second review — still no command executed
    r2 = client.post(
        "/api/orbital-commons/events/OC-DEMO-001/approve",
        headers={"x-user-id": "sarah"},
        json={"candidate_id": "OPT-5-COORDINATED-SPLIT", "notes": "Concur with split burn", "safety_acknowledged": True},
    )
    assert r2.status_code == 200
    state2 = r2.json()["review_state"]
    assert state2["status"] == ReviewStatus.SECOND_REVIEW_COMPLETE.value
    assert state2["first_reviewer"]["reviewer_id"] == "anish"
    assert state2["second_reviewer"]["reviewer_id"] == "sarah"
    assert state2["command_executed"] is False

    # Clarification + rejection on fresh evaluated event
    client.post("/api/orbital-commons/evaluate", json=_fresh_req(event_id="OC-REJECT-TEST"))
    r_clar = client.post(
        "/api/orbital-commons/events/OC-REJECT-TEST/reject",
        headers={"x-user-id": "chen"},
        json={"reason": "Request updated radar range residuals", "action": "clarification"},
    )
    assert r_clar.status_code == 200
    assert len(r_clar.json()["review_state"]["clarifications"]) == 1

    r_rej = client.post(
        "/api/orbital-commons/events/OC-REJECT-TEST/reject",
        headers={"x-user-id": "chen"},
        json={"reason": "Stand down pending fresh ephemeris pass", "action": "reject"},
    )
    assert r_rej.status_code == 200
    assert r_rej.json()["review_state"]["status"] == ReviewStatus.REJECTED.value
    assert r_rej.json()["review_state"]["rejected_by"] == "chen"
    assert r_rej.json()["review_state"]["command_executed"] is False


def test_llm_explanation_schema_validation_and_fallback():
    service = MockAIService()
    res = evaluate_orbital_commons(build_default_demo_commons_request())

    # Invalid/malformed LLM JSON triggers Pydantic ValidationError
    with pytest.raises(ValidationError):
        service.validate_commons_explanation_payload({"summary": "too short", "extra_hack": "drop"})

    # Explanation generator guarantees valid structured schema & disclaimer even when LLM disabled
    explanation = pytest.run if hasattr(pytest, "run") else None
    import asyncio
    out = asyncio.run(service.explain_orbital_commons(res))
    assert "Decision support only" in out["disclaimer"]
    assert isinstance(out["trade_offs"], list) and len(out["trade_offs"]) >= 1
    assert isinstance(out["evidence_references"], list)
    assert out["provenance"] in ("deterministic-fallback", "gemini-explanation-only")


def test_policies_and_evidence_endpoints():
    pol = client.get("/api/orbital-commons/policies")
    assert pol.status_code == 200
    assert len(pol.json()["policies"]) == 5
    assert pol.json()["engine_version"] == ENGINE_VERSION

    ev = client.get("/api/orbital-commons/events/OC-DEMO-001/evidence")
    assert ev.status_code == 200
    ev_body = ev.json()
    assert ev_body["event_id"] == "OC-DEMO-001"
    assert ev_body["audit_hash_sha256"] == ev_body["evidence_packet"]["audit_hash_sha256"]
