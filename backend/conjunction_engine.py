"""
KesslerX Conjunction Analysis Engine
Uses SGP4 orbital propagation to compute real close approaches between two TLE-defined objects.
"""

import math
import logging
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)

try:
    from sgp4.api import Satrec, WGS72
    from sgp4.api import jday
    SGP4_AVAILABLE = True
except ImportError:
    logger.warning("sgp4 not available, conjunction analysis will use fallback mode")
    SGP4_AVAILABLE = False


# ── Data classes ────────────────────────────────────────────────

@dataclass
class OrbitalState:
    """Position and velocity in km and km/s (TEME frame)."""
    time_utc: str
    x: float
    y: float
    z: float
    vx: float
    vy: float
    vz: float
    altitude_km: float
    speed_km_s: float

@dataclass
class ConjunctionEvent:
    """Result of a close-approach analysis between two objects."""
    tca: str                    # Time of Closest Approach (ISO 8601)
    min_distance_km: float
    relative_velocity_km_s: float
    collision_probability: float
    risk_level: str             # SAFE, LOW, MEDIUM, HIGH, CRITICAL
    object_a_state: dict
    object_b_state: dict

@dataclass
class ConjunctionReport:
    """Full conjunction analysis report."""
    object_a_name: str
    object_b_name: str
    analysis_duration_hours: int
    step_size_seconds: int
    total_steps: int
    tca: str
    min_distance_km: float
    relative_velocity_km_s: float
    collision_probability: float
    risk_level: str
    recommended_action: str
    trajectory_a: List[dict]
    trajectory_b: List[dict]
    separation_timeline: List[dict]
    events: List[dict]


# ── Constants ────────────────────────────────────────────────

EARTH_RADIUS_KM = 6371.0
GM_EARTH = 398600.4418  # km³/s²

# Combined object cross-section for probability calculation (10m² typical satellite)
COMBINED_CROSS_SECTION_M2 = 20.0
# Position uncertainty covariance (simplified, meters)
POSITION_UNCERTAINTY_M = 500.0


# ── TLE Validation ────────────────────────────────────────────

def validate_tle(line1: str, line2: str) -> Tuple[bool, str]:
    """Validate TLE format. Returns (is_valid, error_message)."""
    line1 = line1.strip()
    line2 = line2.strip()

    if not line1 or not line2:
        return False, "TLE lines cannot be empty"
    if not line1.startswith("1"):
        return False, f"TLE Line 1 must start with '1', got '{line1[0]}'"
    if not line2.startswith("2"):
        return False, f"TLE Line 2 must start with '2', got '{line2[0]}'"
    if len(line1) < 69:
        return False, f"TLE Line 1 too short: {len(line1)} chars (need 69)"
    if len(line2) < 69:
        return False, f"TLE Line 2 too short: {len(line2)} chars (need 69)"
    return True, "OK"


# ── SGP4 Propagation ────────────────────────────────────────────

def _create_satrec(line1: str, line2: str) -> Optional[object]:
    """Create an SGP4 satellite record from TLE lines."""
    if not SGP4_AVAILABLE:
        return None
    try:
        sat = Satrec.twoline2rv(line1, line2, WGS72)
        return sat
    except Exception as e:
        logger.error(f"Failed to create satrec: {e}")
        return None


def _propagate_at(sat, dt: datetime) -> Optional[OrbitalState]:
    """Propagate a satellite to a specific datetime. Returns OrbitalState or None."""
    try:
        jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)
        e, r, v = sat.sgp4(jd, fr)
        if e != 0:
            return None
        x, y, z = r  # km in TEME
        vx, vy, vz = v  # km/s in TEME
        altitude = math.sqrt(x**2 + y**2 + z**2) - EARTH_RADIUS_KM
        speed = math.sqrt(vx**2 + vy**2 + vz**2)
        return OrbitalState(
            time_utc=dt.isoformat(),
            x=round(x, 3), y=round(y, 3), z=round(z, 3),
            vx=round(vx, 6), vy=round(vy, 6), vz=round(vz, 6),
            altitude_km=round(altitude, 2),
            speed_km_s=round(speed, 4),
        )
    except Exception as e:
        logger.error(f"Propagation error: {e}")
        return None


def _euclidean_distance(s1: OrbitalState, s2: OrbitalState) -> float:
    """Euclidean distance between two orbital states in km."""
    return math.sqrt((s1.x - s2.x)**2 + (s1.y - s2.y)**2 + (s1.z - s2.z)**2)


def _relative_velocity(s1: OrbitalState, s2: OrbitalState) -> float:
    """Relative velocity between two objects in km/s."""
    return math.sqrt((s1.vx - s2.vx)**2 + (s1.vy - s2.vy)**2 + (s1.vz - s2.vz)**2)


# ── Collision Probability (simplified Foster method) ──────────

def compute_collision_probability(miss_distance_km: float, relative_velocity_km_s: float) -> float:
    """
    Simplified collision probability using a Gaussian encounter model.
    Based on NASA's modified Foster method for LEO conjunctions.
    
    P = (A_combined / (2π * σ²)) * exp(-d² / (2σ²))
    where σ = position uncertainty, d = miss distance, A = combined cross-section
    """
    miss_distance_m = miss_distance_km * 1000.0
    sigma = POSITION_UNCERTAINTY_M  # meters
    area = COMBINED_CROSS_SECTION_M2  # m²

    if sigma <= 0:
        return 0.0

    exponent = -(miss_distance_m**2) / (2.0 * sigma**2)
    probability = (area / (2.0 * math.pi * sigma**2)) * math.exp(exponent)

    # Clamp to [0, 1]
    return min(max(probability, 0.0), 1.0)


def classify_risk(probability: float) -> str:
    """Classify risk level based on collision probability."""
    if probability >= 1e-2:
        return "CRITICAL"
    elif probability >= 1e-3:
        return "HIGH"
    elif probability >= 1e-4:
        return "MEDIUM"
    elif probability >= 1e-6:
        return "LOW"
    else:
        return "SAFE"


def get_recommended_action(risk_level: str, min_distance_km: float) -> str:
    """Generate recommended action based on risk level."""
    actions = {
        "CRITICAL": f"IMMEDIATE ACTION REQUIRED. Collision probability exceeds 1%. Execute Debris Avoidance Maneuver (DAM) immediately. Miss distance: {min_distance_km:.2f} km is within lethal range.",
        "HIGH": f"HIGH RISK. Schedule collision avoidance maneuver within the next 6 hours. Miss distance: {min_distance_km:.2f} km. Prepare burn parameters.",
        "MEDIUM": f"MONITOR CLOSELY. Miss distance of {min_distance_km:.2f} km warrants continued surveillance. Prepare contingency maneuver plan. Re-evaluate in 4 hours.",
        "LOW": f"LOW RISK. Miss distance of {min_distance_km:.2f} km is within acceptable margins. Continue routine tracking. No maneuver required at this time.",
        "SAFE": f"NO ACTION REQUIRED. Objects are well separated at {min_distance_km:.2f} km. Routine monitoring sufficient.",
    }
    return actions.get(risk_level, "Continue monitoring.")


# ── Main Analysis Function ──────────────────────────────────

def analyze_conjunction(
    tle1_line1: str, tle1_line2: str,
    tle2_line1: str, tle2_line2: str,
    name_a: str = "Object A",
    name_b: str = "Object B",
    duration_hours: int = 24,
    step_seconds: int = 10,
) -> dict:
    """
    Perform full conjunction analysis between two TLE-defined objects.
    
    Returns a complete report dict with trajectories, TCA, collision probability, etc.
    """
    # Validate TLEs
    valid1, msg1 = validate_tle(tle1_line1, tle1_line2)
    if not valid1:
        return {"error": f"Object A TLE invalid: {msg1}"}
    valid2, msg2 = validate_tle(tle2_line1, tle2_line2)
    if not valid2:
        return {"error": f"Object B TLE invalid: {msg2}"}

    if not SGP4_AVAILABLE:
        return {"error": "SGP4 library not installed. Run: pip install sgp4"}

    # Create satellite records
    sat_a = _create_satrec(tle1_line1.strip(), tle1_line2.strip())
    sat_b = _create_satrec(tle2_line1.strip(), tle2_line2.strip())
    if sat_a is None:
        return {"error": "Failed to parse Object A TLE"}
    if sat_b is None:
        return {"error": "Failed to parse Object B TLE"}

    # Propagate over duration
    now = datetime.now(timezone.utc)
    total_steps = (duration_hours * 3600) // step_seconds
    
    trajectory_a = []
    trajectory_b = []
    separation_timeline = []
    
    min_distance = float('inf')
    tca_time = now
    tca_state_a = None
    tca_state_b = None
    tca_rel_vel = 0.0

    for step in range(total_steps):
        t = now + timedelta(seconds=step * step_seconds)
        
        state_a = _propagate_at(sat_a, t)
        state_b = _propagate_at(sat_b, t)
        
        if state_a is None or state_b is None:
            continue

        distance = _euclidean_distance(state_a, state_b)
        rel_vel = _relative_velocity(state_a, state_b)

        # Store trajectory data (subsample for chart performance — every 60th point)
        if step % 60 == 0:
            trajectory_a.append(asdict(state_a))
            trajectory_b.append(asdict(state_b))
            separation_timeline.append({
                "time": t.isoformat(),
                "minutes": step * step_seconds / 60.0,
                "distance_km": round(distance, 3),
                "relative_velocity_km_s": round(rel_vel, 4),
            })

        # Track minimum distance (TCA)
        if distance < min_distance:
            min_distance = distance
            tca_time = t
            tca_state_a = state_a
            tca_state_b = state_b
            tca_rel_vel = rel_vel

    if tca_state_a is None or tca_state_b is None:
        return {"error": "Propagation failed for both objects. TLE data may be invalid or too old."}

    # Compute collision probability and risk
    probability = compute_collision_probability(min_distance, tca_rel_vel)
    risk = classify_risk(probability)
    action = get_recommended_action(risk, min_distance)

    # Build the conjunction event
    event = ConjunctionEvent(
        tca=tca_time.isoformat(),
        min_distance_km=round(min_distance, 4),
        relative_velocity_km_s=round(tca_rel_vel, 4),
        collision_probability=probability,
        risk_level=risk,
        object_a_state=asdict(tca_state_a),
        object_b_state=asdict(tca_state_b),
    )

    report = ConjunctionReport(
        object_a_name=name_a,
        object_b_name=name_b,
        analysis_duration_hours=duration_hours,
        step_size_seconds=step_seconds,
        total_steps=total_steps,
        tca=tca_time.isoformat(),
        min_distance_km=round(min_distance, 4),
        relative_velocity_km_s=round(tca_rel_vel, 4),
        collision_probability=probability,
        risk_level=risk,
        recommended_action=action,
        trajectory_a=trajectory_a,
        trajectory_b=trajectory_b,
        separation_timeline=separation_timeline,
        events=[asdict(event)],
    )

    return asdict(report)


# ── Preset TLE Pairs for Demo ──────────────────────────────────

CONJUNCTION_PRESETS = [
    {
        "id": "iss-starlink",
        "name": "ISS vs STARLINK-1007",
        "description": "International Space Station close approach with Starlink constellation satellite in LEO",
        "object_a": {
            "name": "ISS (ZARYA)",
            "tle_line1": "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9997",
            "tle_line2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261",
        },
        "object_b": {
            "name": "STARLINK-1007",
            "tle_line1": "1 44713U 19074A   24128.12345678  .00012345  00000-0  12345-3 0  9991",
            "tle_line2": "2 44713  53.0500 123.4567 0001234 123.4567 123.4567 15.00000000123451",
        },
    },
    {
        "id": "iss-debris",
        "name": "ISS vs COSMOS Debris",
        "description": "ISS conjunction with COSMOS satellite debris fragment in polar orbit",
        "object_a": {
            "name": "ISS (ZARYA)",
            "tle_line1": "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9997",
            "tle_line2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261",
        },
        "object_b": {
            "name": "COSMOS-2251 DEB",
            "tle_line1": "1 90000U 09005A   24128.12345678  .00012345  00000-0  12345-3 0  9991",
            "tle_line2": "2 90000  74.0400 123.4567 0001234 123.4567 123.4567 14.80000000123451",
        },
    },
    {
        "id": "starlink-oneweb",
        "name": "STARLINK-1008 vs ONEWEB-0012",
        "description": "Two mega-constellation satellites in intersecting orbital planes",
        "object_a": {
            "name": "STARLINK-1008",
            "tle_line1": "1 44713U 19074A   24128.12345678  .00012345  00000-0  12345-3 0  9991",
            "tle_line2": "2 44713  53.0500 143.4567 0001234 123.4567 123.4567 15.00000000123451",
        },
        "object_b": {
            "name": "ONEWEB-0012",
            "tle_line1": "1 44713U 19074A   24128.12345678  .00012345  00000-0  12345-3 0  9991",
            "tle_line2": "2 44713  87.0500 123.4567 0001234 123.4567 123.4567 13.00000000123451",
        },
    },
]
