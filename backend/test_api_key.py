"""
KesslerX AI Service & Decision-Support Safety Tests.
Verifies fallback responses and deterministic maneuver planning in CI without external API dependency.
"""

import asyncio
import ai_service
from ai_service import MockAIService


def test_ai_service_fallback_responses(monkeypatch):
    monkeypatch.setattr(ai_service, "api_key", None)
    service = MockAIService()

    greeting = asyncio.run(service.generate_response("Hello! This is a test."))
    assert isinstance(greeting, str)
    assert len(greeting) > 0

    collision_reply = asyncio.run(service.generate_response("What is the current collision risk?"))
    assert "conjunction" in collision_reply.lower() or "collision" in collision_reply.lower()

    debris_reply = asyncio.run(service.generate_response("Report on Kessler debris status"))
    assert "debris" in debris_reply.lower() or "kessler" in debris_reply.lower()


def test_ai_service_rule_based_maneuver_plan(monkeypatch):
    monkeypatch.setattr(ai_service, "api_key", None)
    service = MockAIService()

    conjunction_data = {
        "object_a_name": "STARLINK-3021",
        "object_b_name": "DEBRIS-88172",
        "min_distance_km": 0.18,
        "relative_velocity_km_s": 11.4,
        "risk_level": "HIGH",
        "tca": "2026-11-15T12:00:00Z",
        "object_a_state": {"altitude_km": 542.0},
    }
    plan = asyncio.run(service.generate_maneuver_plan(conjunction_data))

    assert plan["risk"] == "HIGH"
    assert plan["burn_direction"] in ("RETROGRADE", "PROGRADE", "RADIAL", "NORMAL")
    assert plan["delta_v_m_s"] > 0
    assert plan["fuel_cost_kg"] > 0
    assert plan["expected_miss_distance_km"] > conjunction_data["min_distance_km"]
    assert "Decision support only — human approval required" in plan["disclaimer"]
    assert "Decision support only — human approval required" in plan["explanation"]


if __name__ == "__main__":
    service = MockAIService()
    print(asyncio.run(service.generate_response("Hello! This is a test.")))
