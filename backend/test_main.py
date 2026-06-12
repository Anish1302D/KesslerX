from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "nominal", "service": "KesslerX Backend"}

def test_get_satellites():
    response = client.get("/api/satellites?limit=2")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert "satellites" in data
    assert isinstance(data["satellites"], list)

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
    assert "collision" in data["response"].lower() or "risk" in data["response"].lower()

def test_ai_chat_weather(monkeypatch):
    mock_generate = AsyncMock(return_value="Solar flares detected")
    monkeypatch.setattr("main.ai_service.generate_response", mock_generate)
    
    response = client.post(
        "/api/ai/chat",
        json={"prompt": "What is the space weather like?"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert "solar" in data["response"].lower() or "weather" in data["response"].lower()

def test_ai_chat_fallback(monkeypatch):
    mock_generate = AsyncMock(return_value="Running in mock mode for fallback")
    monkeypatch.setattr("main.ai_service.generate_response", mock_generate)
    
    response = client.post(
        "/api/ai/chat",
        json={"prompt": "Tell me a joke."}
    )
    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert "mock mode" in data["response"].lower()
