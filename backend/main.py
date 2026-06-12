from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import os
from dotenv import load_dotenv
from pydantic import BaseModel
from space_track import SpaceTrackClient
from ai_service import MockAIService

load_dotenv()

space_track_client = SpaceTrackClient()
ai_service = MockAIService()

app = FastAPI(title="KesslerX API", version="1.0.0")

class ChatRequest(BaseModel):
    prompt: str
    context: dict = None

# Setup CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.get("/api/health")
async def health_check():
    return {"status": "nominal", "service": "KesslerX Backend"}

@app.get("/api/satellites")
async def get_satellites(limit: int = 100):
    data = await space_track_client.get_active_satellites(limit=limit)
    return {"count": len(data), "satellites": data}

@app.post("/api/ai/chat")
async def chat_with_ai(request: ChatRequest):
    response = await ai_service.generate_response(request.prompt, request.context)
    return {"response": response}

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, wait for incoming messages (if any)
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

import random

# Background task to simulate real-time updates for now
async def simulate_realtime_updates():
    alerts = [
        {"type": "alert", "data": "New debris object cataloged: DEBRIS-99123 in LEO."},
        {"type": "alert", "data": "Maneuver detected: Iridium-154 avoidance burn."},
        {"type": "alert", "data": "WARNING: High probability conjunction detected. Starlink-4422 & Debris-881."},
        {"type": "alert", "data": "Space Weather: Kp index predicted to reach 6 in 3 hours."},
        {"type": "alert", "data": "Orbital decay: Object #25544 (ISS) altitude nominal."},
    ]
    while True:
        await asyncio.sleep(10)
        # Randomly broadcast an alert
        alert = random.choice(alerts)
        update = json.dumps(alert)
        await manager.broadcast(update)

@app.on_event("startup")
async def startup_event():
    # Attempt initial login to Space-Track on startup
    await space_track_client.login()
    asyncio.create_task(simulate_realtime_updates())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
