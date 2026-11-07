"""Validation, Rate Limiting, and Safety Rule Tests for KesslerX Backend."""

import pytest
from starlette.testclient import TestClient
from main import app, check_rate_limit, DISCLAIMER_TEXT

client = TestClient(app)

def test_safety_disclaimer_constant():
    """Verify mandatory non-negotiable safety disclaimer text."""
    assert "Decision support only" in DISCLAIMER_TEXT
    assert "human approval required" in DISCLAIMER_TEXT
    assert "Not a flight command system" in DISCLAIMER_TEXT

def test_rate_limit_enforcement():
    """Verify rate limit throws HTTP 429 when threshold exceeded."""
    key = "test_rate_limiter_user"
    # Execute up to limit
    for _ in range(5):
        check_rate_limit(key, limit=5, window_s=60)
    
    # Exceed limit
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        check_rate_limit(key, limit=5, window_s=60)
    assert exc_info.value.status_code == 429
    assert "Rate limit exceeded" in str(exc_info.value.detail)

def test_conjunction_analyze_invalid_tle():
    """Verify Pydantic validation rejects malformed TLE length with 422."""
    headers = {"Authorization": "Bearer dev_token_analyst"}
    payload = {
        "tle1_line1": "TOO_SHORT",
        "tle1_line2": "TOO_SHORT",
        "tle2_line1": "1 25544U 98067A   24142.50000000  .00016717  00000-0  10270-3 0  9025",
        "tle2_line2": "2 25544  51.6416 250.2341 0004561  89.1234 271.0123 15.49812345421051",
    }
    response = client.post("/api/conjunction/analyze", json=payload, headers=headers)
    assert response.status_code == 422

def test_space_weather_drag_multiplier():
    """Verify /api/space-weather returns calculated atmospheric density multiplier."""
    response = client.get("/api/space-weather")
    assert response.status_code == 200
    data = response.json()
    assert "atmospheric_density_multiplier" in data
    assert isinstance(data["atmospheric_density_multiplier"], float)
    assert data["atmospheric_density_multiplier"] >= 1.0
    assert "satellite_drag_impact" in data

def test_ai_chat_prompt_validation():
    """Verify empty or excessively long chat prompts are rejected."""
    headers = {"Authorization": "Bearer dev_token_analyst"}
    # Empty prompt
    resp_empty = client.post("/api/ai/chat", json={"prompt": ""}, headers=headers)
    assert resp_empty.status_code == 422

    # Huge prompt exceeding 4000 characters
    huge_prompt = "A" * 4005
    resp_huge = client.post("/api/ai/chat", json={"prompt": huge_prompt}, headers=headers)
    assert resp_huge.status_code == 422
