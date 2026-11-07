"""
KesslerX Ground Station Device Ingestion Contract & Telemetry Manager.
Enforces authenticated hardware device registration, sequence verification,
replay protection, and persistent telemetry ingestion.
Prevents simulation from running in production mode.
"""

import time
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from config import config
from storage import storage

logger = logging.getLogger(__name__)


class DeviceTelemetryPacket(BaseModel):
    station_id: str = Field(..., min_length=2, max_length=64)
    device_token: str = Field(..., min_length=8)
    sequence_number: int = Field(..., ge=0)
    timestamp: str
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    altitude_m: float = Field(..., ge=-500.0, le=50000.0)
    temperature_c: float = Field(..., ge=-50.0, le=100.0)
    battery_pct: float = Field(..., ge=0.0, le=100.0)
    signal_dbm: float = Field(..., ge=-140.0, le=20.0)
    velocity_m_s: float = Field(..., ge=0.0, le=1000.0)
    heading_deg: float = Field(default=0.0, ge=0.0, le=360.0)
    pitch_deg: float = Field(default=0.0, ge=-90.0, le=90.0)
    roll_deg: float = Field(default=0.0, ge=-180.0, le=180.0)


class GroundStationManager:
    def __init__(self, station_id: str = "GS-PRIMARY-01"):
        self.station_id = station_id
        self.registered_tokens = {
            "GS-PRIMARY-01": "kesslerx_device_key_primary_secure",
            "GS-TEST-02": "kesslerx_device_key_test_secure"
        }
        self.last_sequence_numbers: Dict[str, int] = {}
        self.last_packet_time: Optional[float] = None
        self.last_valid_packet: Optional[Dict[str, Any]] = None
        self._history: List[Dict[str, Any]] = []

    def ingest_packet(self, packet: DeviceTelemetryPacket) -> Dict[str, Any]:
        """Ingests an authenticated hardware telemetry packet with sequence replay protection."""
        # 1. Device Token Authentication
        expected_token = self.registered_tokens.get(packet.station_id)
        if not expected_token or packet.device_token != expected_token:
            raise PermissionError(f"Unauthorized device token for station {packet.station_id}")

        # 2. Sequence Replay Protection
        last_seq = self.last_sequence_numbers.get(packet.station_id, -1)
        if packet.sequence_number <= last_seq:
            raise ValueError(f"Sequence replay rejected: received {packet.sequence_number}, last was {last_seq}")

        self.last_sequence_numbers[packet.station_id] = packet.sequence_number
        self.last_packet_time = time.time()

        now = datetime.now(timezone.utc).isoformat()
        clean_packet = {
            "station_id": packet.station_id,
            "sequence_number": packet.sequence_number,
            "timestamp": packet.timestamp or now,
            "latitude": round(packet.latitude, 6),
            "longitude": round(packet.longitude, 6),
            "altitude_m": round(packet.altitude_m, 2),
            "temperature_c": round(packet.temperature_c, 2),
            "battery_pct": round(packet.battery_pct, 1),
            "signal_dbm": round(packet.signal_dbm, 1),
            "velocity_m_s": round(packet.velocity_m_s, 2),
            "heading_deg": round(packet.heading_deg, 2),
            "pitch_deg": round(packet.pitch_deg, 2),
            "roll_deg": round(packet.roll_deg, 2),
            "source": "hardware_device",
            "mode": "observed",
            "ingested_at": now
        }

        self.last_valid_packet = clean_packet
        # Store in durable SQLite
        try:
            with storage._get_sqlite_conn() as conn:
                conn.cursor().execute("""
                    INSERT INTO ground_station_telemetry (
                        packet_id, station_id, timestamp, latitude, longitude, altitude_m,
                        temperature_c, battery_pct, signal_dbm, velocity_m_s, heading_deg,
                        pitch_deg, roll_deg, uptime_seconds, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    packet.sequence_number,
                    packet.station_id,
                    clean_packet["timestamp"],
                    clean_packet["latitude"],
                    clean_packet["longitude"],
                    clean_packet["altitude_m"],
                    clean_packet["temperature_c"],
                    clean_packet["battery_pct"],
                    clean_packet["signal_dbm"],
                    clean_packet["velocity_m_s"],
                    clean_packet["heading_deg"],
                    clean_packet["pitch_deg"],
                    clean_packet["roll_deg"],
                    int(time.time()),
                    now
                ))
                conn.commit()
        except Exception as e:
            logger.error(f"Error persisting telemetry packet: {e}")

        self._history.append(clean_packet)
        if len(self._history) > 200:
            self._history.pop(0)

        config.update_provider_status("ground_station", configured=True, status="online", success=True)
        return clean_packet

    def get_history(self, count: int = 60) -> List[Dict[str, Any]]:
        """Returns the last count telemetry packets."""
        return self._history[-count:]

    def get_status(self) -> Dict[str, Any]:
        """Returns station connectivity status."""
        now = time.time()
        is_online = (self.last_packet_time is not None) and (now - self.last_packet_time < 30.0)
        telemetry = self.last_valid_packet or {}

        if is_online and self.last_valid_packet:
            return {
                "station_id": self.station_id,
                "connected": True,
                "status": "ONLINE",
                "packet_count": len(self._history),
                "battery_pct": telemetry.get("battery_pct", 100.0),
                "temperature_c": telemetry.get("temperature_c", 25.0),
                "mode": "observed",
                "source": "hardware_device",
                "last_seen": datetime.fromtimestamp(self.last_packet_time, tz=timezone.utc).isoformat(),
                "telemetry": self.last_valid_packet,
                "warnings": []
            }
        
        # If in Demo or Test environment, can provide isolated demo packet
        if config.is_demo or config.is_test:
            return {
                "station_id": self.station_id,
                "connected": True,
                "status": "DEMO_SIMULATION",
                "packet_count": len(self._history),
                "battery_pct": telemetry.get("battery_pct", 98.2),
                "temperature_c": telemetry.get("temperature_c", 24.5),
                "mode": "simulated",
                "source": "demo",
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "telemetry": {
                    "latitude": 34.0522,
                    "longitude": -118.2437,
                    "altitude_m": 120.0,
                    "temperature_c": 24.5,
                    "battery_pct": 98.2,
                    "signal_dbm": -68.0,
                    "velocity_m_s": 0.0,
                    "heading_deg": 182.0,
                    "pitch_deg": 0.2,
                    "roll_deg": -0.1
                },
                "warnings": ["Demo simulation only — no physical ground station attached."]
            }

        # Production state when no hardware is attached
        return {
            "station_id": self.station_id,
            "connected": False,
            "status": "NO_HARDWARE_CONNECTED",
            "packet_count": 0,
            "battery_pct": 0.0,
            "temperature_c": 0.0,
            "mode": "fallback",
            "source": "none",
            "last_seen": None,
            "telemetry": None,
            "warnings": ["No authenticated ground-station telemetry available. Connect authenticated device to /api/ground-station/telemetry."]
        }

    def generate_demo_packet(self) -> Dict[str, Any]:
        """Strictly for demo environment when APP_ENV=demo."""
        now = datetime.now(timezone.utc).isoformat()
        return {
            "station_id": self.station_id,
            "packet_id": int(time.time()),
            "timestamp": now,
            "latitude": 34.0522,
            "longitude": -118.2437,
            "altitude_m": 120.0,
            "temperature_c": 25.0,
            "battery_pct": 95.0,
            "signal_dbm": -72.0,
            "velocity_m_s": 0.0,
            "source": "demo",
            "mode": "simulated"
        }


# Global ground station manager
gs_manager = GroundStationManager()
# Alias for backwards compatibility
gs_simulator = gs_manager
