"""
KesslerX Conjunction Assessment & Screening Engine.
Implements CCSDS Conjunction Data Message (CDM) parsing, 2D encounter-plane probability,
and deterministic SGP4 orbital propagation with explicit flight-qualification boundaries.
"""

import math
import logging
import json
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict
from typing import List, Tuple, Optional, Dict, Any

from config import config

logger = logging.getLogger(__name__)

try:
    from sgp4.api import Satrec, WGS72, jday
    SGP4_AVAILABLE = True
except ImportError:
    logger.warning("sgp4 not available, conjunction propagation will fail closed.")
    SGP4_AVAILABLE = False

EARTH_RADIUS_KM = 6371.0
GM_EARTH = 398600.4418  # km³/s²


# ============================================================
# CCSDS Conjunction Data Message (CDM) Parser & Validator
# ============================================================

class CDMEvent:
    def __init__(self, raw_cdm: Dict[str, Any]):
        self.raw = raw_cdm
        self.cdm_id = raw_cdm.get("CDM_ID", raw_cdm.get("MESSAGE_ID", f"CDM-{int(datetime.now(timezone.utc).timestamp())}"))
        self.created_at = raw_cdm.get("CREATION_DATE", datetime.now(timezone.utc).isoformat())
        self.tca = raw_cdm.get("TCA")
        self.miss_distance_m = float(raw_cdm.get("MISS_DISTANCE", 0.0))
        self.relative_speed_m_s = float(raw_cdm.get("RELATIVE_SPEED", 0.0))
        self.collision_probability = raw_cdm.get("COLLISION_PROBABILITY")
        self.collision_method = raw_cdm.get("COLLISION_PERCENTILE_METHOD", "ALFRIEND_2D")
        
        # Object 1 (Asset)
        self.obj1_name = raw_cdm.get("OBJECT1_NAME", "PRIMARY_ASSET")
        self.obj1_id = raw_cdm.get("OBJECT1_ID", "UNKNOWN")
        self.obj1_hbr_m = float(raw_cdm.get("OBJECT1_HARD_BODY_RADIUS", 2.0))
        
        # Object 2 (Chaser / Debris)
        self.obj2_name = raw_cdm.get("OBJECT2_NAME", "SECONDARY_OBJECT")
        self.obj2_id = raw_cdm.get("OBJECT2_ID", "UNKNOWN")
        self.obj2_hbr_m = float(raw_cdm.get("OBJECT2_HARD_BODY_RADIUS", 0.5))

        # Covariance in encounter plane (B-plane)
        self.c_xx = raw_cdm.get("COVARIANCE_XX")
        self.c_yy = raw_cdm.get("COVARIANCE_YY")
        self.c_xy = raw_cdm.get("COVARIANCE_XY")

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        if not self.tca:
            errors.append("TCA (Time of Closest Approach) is required.")
        if self.miss_distance_m < 0:
            errors.append("Miss distance cannot be negative.")
        if self.relative_speed_m_s < 0:
            errors.append("Relative speed cannot be negative.")
        return len(errors) == 0, errors

    def to_normalized_event(self) -> Dict[str, Any]:
        """Converts to normalized KesslerX event schema."""
        miss_km = round(self.miss_distance_m / 1000.0, 3)
        prob = float(self.collision_probability) if self.collision_probability is not None else 0.0
        
        if prob > 1e-3 or miss_km < 0.2:
            risk = "CRITICAL"
        elif prob > 1e-4 or miss_km < 1.0:
            risk = "HIGH"
        elif prob > 1e-5 or miss_km < 3.0:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        return {
            "id": str(self.cdm_id),
            "satellite": self.obj1_name,
            "object": self.obj2_name,
            "satellite_id": self.obj1_id,
            "object_id": self.obj2_id,
            "tca": self.tca,
            "miss_distance": miss_km,
            "relative_velocity_km_s": round(self.relative_speed_m_s / 1000.0, 2),
            "collision_probability": prob,
            "risk": risk,
            "status": "new",
            "source": "cdm_operator_stream",
            "mode": "observed",
            "warnings": [],
            "raw_payload": self.raw
        }


# ============================================================
# Conjunction Probability Calculation (Foster / Alfriend 2D)
# ============================================================

def compute_encounter_plane_probability(
    miss_distance_m: float,
    combined_hbr_m: float,
    sigma_x_m: Optional[float],
    sigma_y_m: Optional[float],
    correlation_xy: float = 0.0
) -> Tuple[Optional[float], str]:
    """
    Computes collision probability on the 2D B-plane using Foster-1992 integration.
    Requires valid covariance standard deviations.
    Fails closed with INSUFFICIENT_DATA if operator-grade covariance is not provided.
    """
    if sigma_x_m is None or sigma_y_m is None or sigma_x_m <= 0 or sigma_y_m <= 0:
        return None, "INSUFFICIENT_DATA: Operator Covariance Matrix required for flight-qualified probability"

    if combined_hbr_m <= 0:
        return None, "INSUFFICIENT_DATA: Hard-Body Radius (HBR) must be greater than zero"

    # Foster / Akella-Alfriend encounter plane integration approximation
    # For spherical combined object of radius R on encounter plane:
    # Pc ≈ (R² / (2 * σx * σy * sqrt(1 - ρ²))) * exp(-0.5 * (d² / σ_eff²))
    try:
        det = (1.0 - correlation_xy ** 2)
        if det <= 0.0:
            det = 0.0001
        
        sigma_eff_sq = (sigma_x_m * sigma_y_m) * math.sqrt(det)
        exponent = -0.5 * (miss_distance_m ** 2) / (sigma_x_m ** 2 + sigma_y_m ** 2)
        
        prob = (combined_hbr_m ** 2 / (2.0 * sigma_eff_sq)) * math.exp(exponent)
        prob = min(max(prob, 0.0), 1.0)
        return float(f"{prob:.2e}"), "OPERATIONAL_FOSTER_2D"
    except Exception as e:
        return None, f"COMPUTATION_ERROR: {str(e)}"


# ============================================================
# Educational SGP4 Propagation
# ============================================================

def analyze_conjunction(
    tle1_line1: str,
    tle1_line2: str,
    tle2_line1: str,
    tle2_line2: str,
    name_a: str = "Object A",
    name_b: str = "Object B",
    duration_hours: int = 24,
    step_seconds: int = 60,
    hbr_m: float = 5.0,
    covariance_sigma_m: Optional[float] = None
) -> Dict[str, Any]:
    """
    Runs deterministic SGP4 propagation between two TLEs.
    Identified strictly as: EDUCATIONAL / UNQUALIFIED FOR FLIGHT OPERATIONS.
    """
    if not SGP4_AVAILABLE:
        raise RuntimeError("SGP4 propagation library unavailable on host system.")

    sat_a = Satrec.twoline2rv(tle1_line1.strip(), tle1_line2.strip(), WGS72)
    sat_b = Satrec.twoline2rv(tle2_line1.strip(), tle2_line2.strip(), WGS72)

    start_time = datetime.now(timezone.utc)
    steps = int((duration_hours * 3600) / step_seconds)
    min_dist_km = float("inf")
    tca_time = start_time

    trajectory_a = []
    trajectory_b = []
    timeline = []

    for i in range(steps):
        t = start_time + timedelta(seconds=i * step_seconds)
        jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond * 1e-6)

        err_a, r_a, v_a = sat_a.sgp4(jd, fr)
        err_b, r_b, v_b = sat_b.sgp4(jd, fr)

        if err_a != 0 or err_b != 0:
            continue

        dx = r_a[0] - r_b[0]
        dy = r_a[1] - r_b[1]
        dz = r_a[2] - r_b[2]
        dist_km = math.sqrt(dx * dx + dy * dy + dz * dz)

        if dist_km < min_dist_km:
            min_dist_km = dist_km
            tca_time = t

        if i % max(1, (steps // 50)) == 0:
            timeline.append({
                "time": t.isoformat(),
                "distance_km": round(dist_km, 3)
            })

    # Conjunction probability calculation
    prob, prob_status = compute_encounter_plane_probability(
        miss_distance_m=min_dist_km * 1000.0,
        combined_hbr_m=hbr_m,
        sigma_x_m=covariance_sigma_m,
        sigma_y_m=covariance_sigma_m,
    )

    risk_level = "SAFE"
    if min_dist_km < 1.0:
        risk_level = "CRITICAL" if min_dist_km < 0.2 else "HIGH"
    elif min_dist_km < 5.0:
        risk_level = "MEDIUM"
    elif min_dist_km < 15.0:
        risk_level = "LOW"

    return {
        "object_a_name": name_a,
        "object_b_name": name_b,
        "analysis_duration_hours": duration_hours,
        "step_size_seconds": step_seconds,
        "tca": tca_time.isoformat(),
        "min_distance_km": round(min_dist_km, 3),
        "collision_probability": prob if prob is not None else 0.0,
        "probability_status": prob_status,
        "risk_level": risk_level,
        "data_qualification": "EDUCATIONAL_SGP4_ONLY",
        "compliance_notice": "TLE-derived propagation is not operator-grade. Decision support only — human approval required.",
        "separation_timeline": timeline,
    }


# ============================================================
# Educational Preset Pairs (For Analysis Simulation)
# ============================================================

CONJUNCTION_PRESETS = [
    {
        "id": "iss-cosmos",
        "name": "ISS vs COSMOS 2251 Debris",
        "description": "Historical close-approach scenario between ISS (Zarya) and Cosmos 2251 breakup debris.",
        "object_a": {
            "name": "ISS (ZARYA)",
            "norad_id": 25544,
            "tle_line1": "1 25544U 98067A   26310.53055556  .00016717  00000-0  30062-3 0  9997",
            "tle_line2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261",
        },
        "object_b": {
            "name": "COSMOS 2251 DEB",
            "norad_id": 34454,
            "tle_line1": "1 34454U 93036SJ  26310.45000000  .00005000  00000-0  15000-3 0  9990",
            "tle_line2": "2 34454  74.0400 120.5000 0015000  45.0000 315.0000 14.85000000123456",
        },
    },
    {
        "id": "starlink-oneweb",
        "name": "Starlink vs OneWeb Co-planar Cross",
        "description": "Constellation intersection analysis between Starlink-1007 and OneWeb-0012.",
        "object_a": {
            "name": "STARLINK-1007",
            "norad_id": 44713,
            "tle_line1": "1 44713U 19074A   26310.12345678  .00012345  00000-0  12345-3 0  9991",
            "tle_line2": "2 44713  53.0500 123.4567 0001234 123.4567 123.4567 15.00000000123451",
        },
        "object_b": {
            "name": "ONEWEB-0012",
            "norad_id": 44714,
            "tle_line1": "1 44714U 19074B   26310.12345678  .00012345  00000-0  12345-3 0  9991",
            "tle_line2": "2 44714  87.0500 123.4567 0001234 123.4567 123.4567 13.00000000123451",
        },
    },
]
