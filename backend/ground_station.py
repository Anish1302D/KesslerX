"""
KesslerX Ground Station Simulator
Simulates ESP32 telemetry data for the Ground Station dashboard.
Generates realistic sensor packets over WebSocket.
"""

import math
import random
import time
import logging
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, field
from typing import List

logger = logging.getLogger(__name__)


@dataclass
class TelemetryPacket:
    """A single ESP32 telemetry frame."""
    packet_id: int
    packet_type: str            # "heartbeat", "sensor", "alert"
    timestamp: str
    # GPS
    latitude: float
    longitude: float
    altitude_m: float
    # Sensors
    temperature_c: float
    battery_pct: float
    signal_dbm: int
    # Motion
    velocity_m_s: float
    heading_deg: float
    pitch_deg: float
    roll_deg: float
    # System
    uptime_seconds: int
    free_heap_bytes: int
    wifi_rssi: int


class GroundStationSimulator:
    """Simulates an ESP32 ground station sending telemetry packets."""

    def __init__(
        self,
        station_id: str = "KX-GS-01",
        base_lat: float = 19.0760,     # Mumbai, India
        base_lon: float = 72.8777,
        base_alt: float = 14.0,        # meters ASL
    ):
        self.station_id = station_id
        self.base_lat = base_lat
        self.base_lon = base_lon
        self.base_alt = base_alt

        self.packet_count = 0
        self.start_time = time.time()
        self.connected = True
        self.last_heartbeat = datetime.now(timezone.utc).isoformat()

        # Simulated state
        self._battery = 100.0
        self._temperature = 25.0 + random.uniform(-2, 2)
        self._signal_base = -55  # dBm, strong signal
        self._drift_angle = 0.0
        self._history: List[dict] = []
        self._max_history = 300   # 5 minutes at 1Hz

    def generate_packet(self) -> dict:
        """Generate a single telemetry packet with realistic sensor drift."""
        self.packet_count += 1
        now = datetime.now(timezone.utc)
        uptime = int(time.time() - self.start_time)

        # Simulate GPS drift (small wander around base position)
        self._drift_angle += random.uniform(-0.05, 0.05)
        drift_r = random.uniform(0, 0.0001)  # ~10m max drift
        lat = self.base_lat + drift_r * math.cos(self._drift_angle)
        lon = self.base_lon + drift_r * math.sin(self._drift_angle)
        alt = self.base_alt + random.uniform(-0.5, 0.5)

        # Temperature: slow sinusoidal drift + noise
        time_factor = time.time() / 600.0  # 10-minute cycle
        self._temperature = 25.0 + 5.0 * math.sin(time_factor) + random.uniform(-0.3, 0.3)

        # Battery: slow drain (0.01% per packet, roughly 2.7h to drain)
        self._battery = max(0, self._battery - random.uniform(0.005, 0.015))

        # Signal strength: fluctuate around base
        signal = self._signal_base + random.randint(-8, 8)

        # Motion (stationary station with vibrations)
        velocity = random.uniform(0, 0.3)   # near zero, wind vibration
        heading = random.uniform(0, 360)
        pitch = random.uniform(-2, 2)
        roll = random.uniform(-2, 2)

        # System metrics
        free_heap = random.randint(180000, 220000)
        wifi_rssi = signal

        # Determine packet type
        if self.packet_count % 30 == 0:
            ptype = "heartbeat"
        elif self._battery < 15 or self._temperature > 40:
            ptype = "alert"
        else:
            ptype = "sensor"

        packet = TelemetryPacket(
            packet_id=self.packet_count,
            packet_type=ptype,
            timestamp=now.isoformat(),
            latitude=round(lat, 6),
            longitude=round(lon, 6),
            altitude_m=round(alt, 1),
            temperature_c=round(self._temperature, 1),
            battery_pct=round(self._battery, 1),
            signal_dbm=signal,
            velocity_m_s=round(velocity, 2),
            heading_deg=round(heading, 1),
            pitch_deg=round(pitch, 1),
            roll_deg=round(roll, 1),
            uptime_seconds=uptime,
            free_heap_bytes=free_heap,
            wifi_rssi=wifi_rssi,
        )

        packet_dict = asdict(packet)
        packet_dict["station_id"] = self.station_id

        # Update heartbeat time
        if ptype == "heartbeat":
            self.last_heartbeat = now.isoformat()

        # Store in history
        self._history.append(packet_dict)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]

        return packet_dict

    def get_status(self) -> dict:
        """Get current ground station status summary."""
        return {
            "station_id": self.station_id,
            "connected": self.connected,
            "packet_count": self.packet_count,
            "last_heartbeat": self.last_heartbeat,
            "uptime_seconds": int(time.time() - self.start_time),
            "battery_pct": round(self._battery, 1),
            "temperature_c": round(self._temperature, 1),
            "latitude": round(self.base_lat, 6),
            "longitude": round(self.base_lon, 6),
            "altitude_m": round(self.base_alt, 1),
        }

    def get_history(self, count: int = 60) -> List[dict]:
        """Get the last N telemetry packets."""
        return self._history[-count:]

    def reset(self):
        """Reset the simulator."""
        self.packet_count = 0
        self.start_time = time.time()
        self._battery = 100.0
        self._history.clear()
