"""
KesslerX Phone Satellite Simulator & Tilt-Driven Demonstration Conjunction Module
==================================================================================

Additive module providing:
- Separate simulated mock satellite identity: PHONE-SATELLITE-001 ("PHONE SATELLITE")
- Independent deterministic Keplerian mock demonstration orbit (MOCK_LEO_PHONE_DEMO)
- Strict telemetry validation requiring Raspberry Pi 3 ground station gateway (KX-RPI3-GS-001)
- Deterministic demonstration collision probability model driven by phone tilt

NON-NEGOTIABLE TRUTH & SAFETY RULES:
- Orbit is a controlled demonstration orbit, NOT a real spacecraft ephemeris.
- Collision probability is a DEMO SIMULATION derived from phone tilt for demonstration only.
- Decision support only — human approval required. Not a flight command system.
"""

from __future__ import annotations

import math
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


DISCLAIMER_TEXT = "Decision support only — human approval required. Not a flight command system."
GROUND_STATION_ID = "KX-RPI3-GS-001"
EARTH_RADIUS_KM = 6371.0
GM_EARTH_KM3_S2 = 398600.4418

PHONE_SATELLITE_IDENTITY: Dict[str, Any] = {
    "id": "PHONE-SATELLITE-001",
    "name": "PHONE SATELLITE",
    "object_type": "PHONE_SATELLITE",
    "category": "Phone Satellite",
    "source": "phone_sensor",
    "mode": "simulated",
    "ground_station_id": GROUND_STATION_ID,
    "color": "#FF2EF5",
    "description": (
        "Physical smartphone used as a satellite attitude simulator. "
        "Orbit is a controlled demonstration orbit, not a real spacecraft orbit."
    ),
}

PHONE_MOCK_ORBIT_ELEMENTS: Dict[str, Any] = {
    "semi_major_axis_km": 7021.0,
    "altitude_km": 650.0,
    "inclination_deg": 72.0,
    "eccentricity": 0.012,
    "raan_deg": 145.0,
    "argument_of_perigee_deg": 38.0,
    "mean_anomaly_deg": 215.0,
    "orbit_type": "MOCK_LEO_PHONE_DEMO",
    "period_minutes": 97.4,
    "reference_epoch": "2026-11-17T00:00:00Z",
}

FIXED_MOCK_CONJUNCTION_METADATA: Dict[str, Any] = {
    "id": "PHONE-DEMO-CONJUNCTION-001",
    "satellite": "PHONE SATELLITE",
    "object": "PHONE-DEMO-DEBRIS-001",
    "source": "simulation",
    "mode": "simulated",
    "miss_distance_km": 0.85,
    "tca_hours": 6.0,
    "debris_name": "PHONE-DEMO-DEBRIS-001",
    "confidence": 100,
    "confidence_note": "Deterministic demonstration mapping; not a real orbital confidence estimate.",
}

SAFETY_LABELS: List[str] = [
    "PHONE SATELLITE — SIMULATED",
    "MOCK ORBIT — NOT A REAL SPACECRAFT EPHEMERIS",
    "DEMO COLLISION PROBABILITY — DERIVED FROM PHONE TILT",
    DISCLAIMER_TEXT,
]

_REF_EPOCH_DT = datetime(2026, 11, 17, 0, 0, 0, tzinfo=timezone.utc)


def _parse_utc_timestamp(ts_str: Optional[str]) -> datetime:
    """Parse an ISO-8601 UTC timestamp string into an aware UTC datetime."""
    if not ts_str:
        return datetime.now(timezone.utc)
    normalized = ts_str.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _datetime_to_julian_date(dt: datetime) -> float:
    """Convert UTC datetime to Julian Date using the standard Fliegel-Van Flandern algorithm."""
    utc_dt = dt.astimezone(timezone.utc)
    year = utc_dt.year
    month = utc_dt.month
    day = utc_dt.day + (
        utc_dt.hour
        + utc_dt.minute / 60.0
        + (utc_dt.second + utc_dt.microsecond / 1_000_000.0) / 3600.0
    ) / 24.0

    if month <= 2:
        year -= 1
        month += 12

    a = year // 100
    b = 2 - a + (a // 4)
    return int(365.25 * (year + 4716)) + int(30.6001 * (month + 1)) + day + b - 1524.5


def _gmst_radians(dt: datetime) -> float:
    """Compute Greenwich Mean Sidereal Time in radians (IAU-1982)."""
    jd = _datetime_to_julian_date(dt)
    d = jd - 2451545.0
    t = d / 36525.0
    gmst_deg = (
        280.46061837
        + 360.98564736629 * d
        + 0.000387933 * (t ** 2)
        - (t ** 3) / 38710000.0
    ) % 360.0
    return math.radians(gmst_deg)


def _solve_kepler(mean_anomaly_rad: float, eccentricity: float) -> float:
    """Solve Kepler's equation E - e*sin(E) = M deterministically via Newton-Raphson."""
    m = mean_anomaly_rad % (2.0 * math.pi)
    ecc_anom = m + eccentricity * math.sin(m)
    for _ in range(10):
        f_val = ecc_anom - eccentricity * math.sin(ecc_anom) - m
        f_prime = 1.0 - eccentricity * math.cos(ecc_anom)
        delta = f_val / f_prime
        ecc_anom -= delta
        if abs(delta) < 1e-12:
            break
    return ecc_anom


def propagate_phone_orbit(dt: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Deterministically propagate PHONE-SATELLITE-001 along its independent mock orbit.
    Identical UTC inputs always produce identical position and velocity vectors.
    """
    target_dt = (dt or datetime.now(timezone.utc)).astimezone(timezone.utc)
    delta_s = (target_dt - _REF_EPOCH_DT).total_seconds()

    a_km = float(PHONE_MOCK_ORBIT_ELEMENTS["semi_major_axis_km"])
    ecc = float(PHONE_MOCK_ORBIT_ELEMENTS["eccentricity"])
    inc_rad = math.radians(float(PHONE_MOCK_ORBIT_ELEMENTS["inclination_deg"]))
    raan_rad = math.radians(float(PHONE_MOCK_ORBIT_ELEMENTS["raan_deg"]))
    argp_rad = math.radians(float(PHONE_MOCK_ORBIT_ELEMENTS["argument_of_perigee_deg"]))
    m0_rad = math.radians(float(PHONE_MOCK_ORBIT_ELEMENTS["mean_anomaly_deg"]))

    # Two-body mean motion from semi-major axis
    mean_motion_rad_s = math.sqrt(GM_EARTH_KM3_S2 / (a_km ** 3))
    mean_anom = (m0_rad + mean_motion_rad_s * delta_s) % (2.0 * math.pi)

    ecc_anom = _solve_kepler(mean_anom, ecc)
    true_anom = 2.0 * math.atan2(
        math.sqrt(1.0 + ecc) * math.sin(ecc_anom / 2.0),
        math.sqrt(1.0 - ecc) * math.cos(ecc_anom / 2.0),
    )

    radius_km = a_km * (1.0 - ecc * math.cos(ecc_anom))

    # Perifocal position & velocity
    x_p = radius_km * math.cos(true_anom)
    y_p = radius_km * math.sin(true_anom)

    mu_a_sqrt = math.sqrt(GM_EARTH_KM3_S2 * a_km)
    vx_p = -(mu_a_sqrt / radius_km) * math.sin(ecc_anom)
    vy_p = (mu_a_sqrt / radius_km) * math.sqrt(1.0 - ecc ** 2) * math.cos(ecc_anom)

    # Rotate perifocal -> ECI
    cos_o = math.cos(raan_rad)
    sin_o = math.sin(raan_rad)
    cos_w = math.cos(argp_rad)
    sin_w = math.sin(argp_rad)
    cos_i = math.cos(inc_rad)
    sin_i = math.sin(inc_rad)

    px = cos_o * cos_w - sin_o * sin_w * cos_i
    py = sin_o * cos_w + cos_o * sin_w * cos_i
    pz = sin_w * sin_i

    qx = -cos_o * sin_w - sin_o * cos_w * cos_i
    qy = -sin_o * sin_w + cos_o * cos_w * cos_i
    qz = cos_w * sin_i

    x_eci = x_p * px + y_p * qx
    y_eci = x_p * py + y_p * qy
    z_eci = x_p * pz + y_p * qz

    vx_eci = vx_p * px + vy_p * qx
    vy_eci = vx_p * py + vy_p * qy
    vz_eci = vx_p * pz + vy_p * qz

    speed_km_s = math.sqrt(vx_eci ** 2 + vy_eci ** 2 + vz_eci ** 2)

    # Rotate ECI -> ECEF via GMST
    gmst = _gmst_radians(target_dt)
    cos_g = math.cos(gmst)
    sin_g = math.sin(gmst)
    x_ecef = x_eci * cos_g + y_eci * sin_g
    y_ecef = -x_eci * sin_g + y_eci * cos_g
    z_ecef = z_eci

    horiz = math.sqrt(x_ecef ** 2 + y_ecef ** 2)
    lat_deg = math.degrees(math.atan2(z_ecef, horiz))
    lon_deg = math.degrees(math.atan2(y_ecef, x_ecef))
    altitude_km = radius_km - EARTH_RADIUS_KM

    return {
        "timestamp": target_dt.isoformat().replace("+00:00", "Z"),
        "lat": round(lat_deg, 4),
        "lon": round(lon_deg, 4),
        "altitude_km": round(altitude_km, 2),
        "velocity_km_s": round(speed_km_s, 4),
        "velocity_km_h": round(speed_km_s * 3600.0, 1),
        "radius_km": round(radius_km, 2),
        "true_anomaly_deg": round(math.degrees(true_anom) % 360.0, 2),
        "eci_km": {
            "x": round(x_eci, 3),
            "y": round(y_eci, 3),
            "z": round(z_eci, 3),
        },
        "ecef_km": {
            "x": round(x_ecef, 3),
            "y": round(y_ecef, 3),
            "z": round(z_ecef, 3),
        },
    }


def get_phone_orbit_response(timestamp: Optional[str] = None) -> Dict[str, Any]:
    """Return full mock orbit parameters, instantaneous position, and one-orbit ground track."""
    target_dt = _parse_utc_timestamp(timestamp)
    current_pos = propagate_phone_orbit(target_dt)

    # Generate 1 full 97.4 min demonstration orbit sampled every 2 minutes
    track: List[Dict[str, Any]] = []
    from datetime import timedelta

    total_seconds = int(round(PHONE_MOCK_ORBIT_ELEMENTS["period_minutes"] * 60))
    for offset_s in range(0, total_seconds + 1, 120):
        sample_dt = target_dt + timedelta(seconds=offset_s)
        sample_pos = propagate_phone_orbit(sample_dt)
        track.append({
            "timestamp": sample_pos["timestamp"],
            "lat": sample_pos["lat"],
            "lon": sample_pos["lon"],
            "altitude_km": sample_pos["altitude_km"],
        })

    return {
        "id": PHONE_SATELLITE_IDENTITY["id"],
        "name": PHONE_SATELLITE_IDENTITY["name"],
        **PHONE_MOCK_ORBIT_ELEMENTS,
        "color": PHONE_SATELLITE_IDENTITY["color"],
        "current_position": current_pos,
        "ground_track_preview": track,
        "source": "simulation",
        "mode": "simulated",
        "label": "MOCK ORBIT — NOT A REAL SPACECRAFT EPHEMERIS",
        "disclaimer": DISCLAIMER_TEXT,
        "warnings": [
            "Mock demonstration orbit",
            "MOCK ORBIT — NOT A REAL SPACECRAFT EPHEMERIS",
        ],
    }


def evaluate_tilt_conjunction(
    roll_deg: float,
    pitch_deg: float,
    yaw_deg: float = 0.0,
    last_updated: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Deterministic controlled collision-probability demonstration model based on phone tilt.

    Mapping (smooth piecewise-linear on clamped tilt magnitude in degrees):
      0°  to 5°  tilt:  0.5% to 1.5%  (0.005 to 0.015)  — SAFE
      5°  to 15° tilt:  1.5% to 5.0%  (0.015 to 0.050)  — LOW
      15° to 30° tilt:  5.0% to 15.0% (0.050 to 0.150)  — MEDIUM
      30° to 45° tilt: 15.0% to 35.0% (0.150 to 0.350)  — HIGH
      above 45°  tilt: 35.0% to 60.0% (0.350 to 0.600)  — CRITICAL
    """
    clamped_roll = max(-90.0, min(90.0, float(roll_deg)))
    clamped_pitch = max(-90.0, min(90.0, float(pitch_deg)))
    clean_yaw = float(yaw_deg)

    tilt_magnitude = math.sqrt((clamped_roll ** 2) + (clamped_pitch ** 2))

    if tilt_magnitude <= 5.0:
        prob = 0.005 + (tilt_magnitude / 5.0) * (0.015 - 0.005)
        risk_level = "SAFE"
    elif tilt_magnitude <= 15.0:
        prob = 0.015 + ((tilt_magnitude - 5.0) / 10.0) * (0.050 - 0.015)
        risk_level = "LOW"
    elif tilt_magnitude <= 30.0:
        prob = 0.050 + ((tilt_magnitude - 15.0) / 15.0) * (0.150 - 0.050)
        risk_level = "MEDIUM"
    elif tilt_magnitude <= 45.0:
        prob = 0.150 + ((tilt_magnitude - 30.0) / 15.0) * (0.350 - 0.150)
        risk_level = "HIGH"
    else:
        prob = min(0.60, 0.350 + ((tilt_magnitude - 45.0) / 45.0) * (0.600 - 0.350))
        risk_level = "CRITICAL"

    prob = round(min(0.60, max(0.0, prob)), 4)
    updated_iso = last_updated or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "id": FIXED_MOCK_CONJUNCTION_METADATA["id"],
        "satellite": FIXED_MOCK_CONJUNCTION_METADATA["satellite"],
        "object": FIXED_MOCK_CONJUNCTION_METADATA["object"],
        "debris_name": FIXED_MOCK_CONJUNCTION_METADATA["debris_name"],
        "source": FIXED_MOCK_CONJUNCTION_METADATA["source"],
        "mode": FIXED_MOCK_CONJUNCTION_METADATA["mode"],
        "model_label": "DEMO SIMULATION",
        "term": "Demonstration collision probability",
        "collision_probability": prob,
        "collision_probability_pct": round(prob * 100.0, 2),
        "risk_level": risk_level,
        "tilt_magnitude_deg": round(tilt_magnitude, 2),
        "roll_deg": round(clamped_roll, 2),
        "pitch_deg": round(clamped_pitch, 2),
        "yaw_deg": round(clean_yaw, 2),
        "miss_distance_km": FIXED_MOCK_CONJUNCTION_METADATA["miss_distance_km"],
        "tca_hours": FIXED_MOCK_CONJUNCTION_METADATA["tca_hours"],
        "confidence": FIXED_MOCK_CONJUNCTION_METADATA["confidence"],
        "confidence_note": FIXED_MOCK_CONJUNCTION_METADATA["confidence_note"],
        "ground_station_id": GROUND_STATION_ID,
        "provenance": f"DEMO SIMULATION derived deterministically from {GROUND_STATION_ID} phone tilt telemetry",
        "last_updated": updated_iso,
        "disclaimer": DISCLAIMER_TEXT,
        "warnings": [
            "DEMO SIMULATION",
            "DEMO COLLISION PROBABILITY — DERIVED FROM PHONE TILT",
            "Deterministic demonstration mapping; not a real orbital collision probability.",
        ],
    }


def _check_finite_number(value: Any, field_name: str, min_val: float, max_val: float) -> float:
    """Validate that a field is a finite numeric value within [min_val, max_val]."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a numeric value.")
    num = float(value)
    if not math.isfinite(num):
        raise ValueError(f"{field_name} must be finite (not NaN/Inf).")
    if num < min_val or num > max_val:
        raise ValueError(f"{field_name} ({num}) out of valid range [{min_val}, {max_val}].")
    return num


def validate_phone_telemetry(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Strictly validate incoming phone telemetry forwarded by Raspberry Pi 3 ground station.
    Rejects direct laptop/bypass attempts, malformed fields, and out-of-range values.
    """
    if not isinstance(payload, dict):
        raise ValueError("Telemetry payload must be a JSON object.")

    device_id = payload.get("device_id")
    if device_id != PHONE_SATELLITE_IDENTITY["id"]:
        raise ValueError(f"Invalid device_id '{device_id}'; expected '{PHONE_SATELLITE_IDENTITY['id']}'.")

    ground_station_id = payload.get("ground_station_id")
    if ground_station_id != GROUND_STATION_ID:
        raise ValueError(
            f"Unauthorized or missing ground_station_id '{ground_station_id}'. "
            f"Raspberry Pi 3 ground station '{GROUND_STATION_ID}' is the only accepted telemetry gateway."
        )

    source = payload.get("source")
    if source != "phone_sensor":
        raise ValueError(f"Invalid telemetry source '{source}'; expected 'phone_sensor'.")

    mode = payload.get("mode")
    if mode != "simulated":
        raise ValueError(f"Invalid telemetry mode '{mode}'; expected 'simulated'.")

    sequence = payload.get("sequence")
    if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
        raise ValueError("sequence must be an integer >= 1.")

    timestamp = payload.get("timestamp")
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise ValueError("timestamp must be a valid non-empty ISO-8601 string.")
    try:
        parsed_ts = _parse_utc_timestamp(timestamp)
    except Exception as exc:
        raise ValueError(f"Invalid ISO-8601 timestamp '{timestamp}': {exc}") from exc

    received_at_raw = payload.get("received_at")
    if received_at_raw is not None:
        if not isinstance(received_at_raw, str) or not received_at_raw.strip():
            raise ValueError("received_at must be a non-empty ISO-8601 string when provided.")
        try:
            parsed_received = _parse_utc_timestamp(received_at_raw).isoformat().replace("+00:00", "Z")
        except Exception as exc:
            raise ValueError(f"Invalid ISO-8601 received_at '{received_at_raw}': {exc}") from exc
    else:
        parsed_received = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    orientation = payload.get("orientation")
    if not isinstance(orientation, dict):
        raise ValueError("orientation must be a JSON object containing roll_deg, pitch_deg, and yaw_deg.")

    missing_ori = [k for k in ("roll_deg", "pitch_deg", "yaw_deg") if k not in orientation]
    if missing_ori:
        raise ValueError(f"Missing required orientation fields: {missing_ori}.")

    roll_deg = _check_finite_number(orientation["roll_deg"], "orientation.roll_deg", -180.0, 180.0)
    pitch_deg = _check_finite_number(orientation["pitch_deg"], "orientation.pitch_deg", -180.0, 180.0)
    yaw_deg = _check_finite_number(orientation["yaw_deg"], "orientation.yaw_deg", -360.0, 360.0)

    ang_vel = payload.get("angular_velocity")
    if ang_vel is None:
        ang_vel_clean = {"x_dps": 0.0, "y_dps": 0.0, "z_dps": 0.0}
    else:
        if not isinstance(ang_vel, dict):
            raise ValueError("angular_velocity must be a JSON object.")
        ang_vel_clean = {
            "x_dps": round(_check_finite_number(ang_vel.get("x_dps", 0.0), "angular_velocity.x_dps", -2000.0, 2000.0), 3),
            "y_dps": round(_check_finite_number(ang_vel.get("y_dps", 0.0), "angular_velocity.y_dps", -2000.0, 2000.0), 3),
            "z_dps": round(_check_finite_number(ang_vel.get("z_dps", 0.0), "angular_velocity.z_dps", -2000.0, 2000.0), 3),
        }

    return {
        "device_id": PHONE_SATELLITE_IDENTITY["id"],
        "satellite_name": PHONE_SATELLITE_IDENTITY["name"],
        "sequence": sequence,
        "timestamp": parsed_ts.isoformat().replace("+00:00", "Z"),
        "received_at": parsed_received,
        "orientation": {
            "roll_deg": round(roll_deg, 2),
            "pitch_deg": round(pitch_deg, 2),
            "yaw_deg": round(yaw_deg, 2),
        },
        "angular_velocity": ang_vel_clean,
        "source": "phone_sensor",
        "mode": "simulated",
        "ground_station_id": GROUND_STATION_ID,
    }


def is_phone_telemetry_payload(payload_dict: Dict[str, Any]) -> bool:
    """Detect whether an incoming /api/ground-station/telemetry payload targets PHONE-SATELLITE-001."""
    if not isinstance(payload_dict, dict):
        return False
    ori = payload_dict.get("orientation")
    has_phone_ori_keys = isinstance(ori, dict) and any(
        k in ori for k in ("roll_deg", "pitch_deg", "yaw_deg")
    )
    return any([
        "device_id" in payload_dict and payload_dict["device_id"] is not None,
        payload_dict.get("source") == "phone_sensor",
        "satellite_name" in payload_dict and payload_dict["satellite_name"] is not None,
        "ground_station_id" in payload_dict and payload_dict["ground_station_id"] is not None,
        "angular_velocity" in payload_dict and payload_dict["angular_velocity"] is not None,
        "sequence" in payload_dict and payload_dict["sequence"] is not None,
        has_phone_ori_keys,
    ])


class PhoneSatelliteState:
    """Thread-safe in-memory state holder for the latest Raspberry Pi-forwarded phone telemetry."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._latest_telemetry: Optional[Dict[str, Any]] = None
        self._total_packets: int = 0
        self._last_backend_ingested_at: Optional[str] = None

    def reset(self) -> None:
        """Reset stored telemetry state (primarily for deterministic test isolation)."""
        with self._lock:
            self._latest_telemetry = None
            self._total_packets = 0
            self._last_backend_ingested_at = None

    def ingest_telemetry(self, payload: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Validate, store, and evaluate tilt conjunction for a phone telemetry packet."""
        validated = validate_phone_telemetry(payload)
        ingested_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with self._lock:
            self._latest_telemetry = validated
            self._total_packets += 1
            self._last_backend_ingested_at = ingested_at

        conjunction = evaluate_tilt_conjunction(
            roll_deg=validated["orientation"]["roll_deg"],
            pitch_deg=validated["orientation"]["pitch_deg"],
            yaw_deg=validated["orientation"]["yaw_deg"],
            last_updated=ingested_at,
        )
        return validated, conjunction

    def get_telemetry_snapshot(self) -> Dict[str, Any]:
        """Return latest validated telemetry or deterministic level baseline while awaiting link."""
        with self._lock:
            latest = dict(self._latest_telemetry) if self._latest_telemetry else None
            total = self._total_packets
            ingested_at = self._last_backend_ingested_at

        if latest is None:
            return {
                "device_id": PHONE_SATELLITE_IDENTITY["id"],
                "satellite_name": PHONE_SATELLITE_IDENTITY["name"],
                "sequence": 0,
                "timestamp": None,
                "received_at": None,
                "ingested_at": None,
                "orientation": {"roll_deg": 0.0, "pitch_deg": 0.0, "yaw_deg": 0.0},
                "angular_velocity": {"x_dps": 0.0, "y_dps": 0.0, "z_dps": 0.0},
                "source": "phone_sensor",
                "mode": "simulated",
                "ground_station_id": GROUND_STATION_ID,
                "link_status": "AWAITING_RPI3_TELEMETRY",
                "packets_received": total,
            }

        return {
            **latest,
            "ingested_at": ingested_at,
            "link_status": "LIVE_RPI3_GATEWAY",
            "packets_received": total,
        }

    def get_conjunction(self) -> Dict[str, Any]:
        """Return the current tilt-derived demonstration conjunction state."""
        telem = self.get_telemetry_snapshot()
        ori = telem["orientation"]
        return evaluate_tilt_conjunction(
            roll_deg=ori["roll_deg"],
            pitch_deg=ori["pitch_deg"],
            yaw_deg=ori["yaw_deg"],
            last_updated=telem.get("ingested_at") or telem.get("received_at"),
        )

    def get_full_state(self, timestamp: Optional[str] = None) -> Dict[str, Any]:
        """Return the combined /api/phone-satellite response payload."""
        orbit = get_phone_orbit_response(timestamp=timestamp)
        telemetry = self.get_telemetry_snapshot()
        conjunction = self.get_conjunction()
        return {
            **PHONE_SATELLITE_IDENTITY,
            "orbit": orbit,
            "telemetry": telemetry,
            "conjunction": conjunction,
            "safety_labels": SAFETY_LABELS,
            "disclaimer": DISCLAIMER_TEXT,
            "warnings": [
                "Mock demonstration orbit",
                "Collision probability is derived from phone tilt for demonstration only",
            ],
        }


phone_satellite_state = PhoneSatelliteState()
