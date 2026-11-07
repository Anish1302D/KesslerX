"""
KesslerX Intent-to-Action Negotiator Engine
Deterministic 6-candidate evaluation, multi-factor scoring, and safety boundaries.

NON-NEGOTIABLE SAFETY RULES:
1. Decision support only — human approval required.
2. Never present generated maneuver advice as flight-ready.
3. Never use random values for collision probability, delta-v, miss distance, etc.
4. AI models provide textual reasoning only; they never compute or alter flight dynamics.
"""

import math
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field
from storage import storage

DISCLAIMER_TEXT = "Decision support only — human approval required. Not a flight command system."

class CandidateOption(BaseModel):
    id: str
    action_type: str
    title: str
    target_object: str
    burn_direction: Optional[str] = None
    delta_v_m_s: float = 0.0
    burn_duration_seconds: float = 0.0
    fuel_cost_kg: float = 0.0
    expected_miss_km: float
    time_to_tca_hours: float
    risk_reduction_score: float  # 0-100
    fuel_efficiency_score: float # 0-100
    mission_continuity_score: float # 0-100 (100 = zero payload downtime)
    confidence_score: float      # 0-100
    composite_score: float       # 0-100
    recommended: bool = False
    trade_off_summary: str
    disclaimer: str = DISCLAIMER_TEXT

class NegotiationResult(BaseModel):
    event_id: str
    primary_object: str
    secondary_object: str
    current_miss_km: float
    collision_probability: float
    tca_utc: str
    generated_at_utc: str
    disclaimer: str = DISCLAIMER_TEXT
    operational_recommendation: str
    candidates: List[CandidateOption]
    audit_hash: str


def compute_deterministic_maneuver(
    altitude_km: float,
    current_miss_km: float,
    target_miss_km: float = 50.0,
    mass_kg: float = 500.0,
    isp_seconds: float = 220.0,
    thrust_n: float = 10.0,
) -> Dict[str, float]:
    """
    Compute delta-v and propellant consumption deterministically from orbital mechanics.
    Uses Vis-Viva circular velocity approximation and Tsiolkovsky Rocket Equation.
    Zero random variables.
    """
    mu_earth = 398600.4418  # km^3/s^2
    earth_radius = 6371.0   # km
    g0 = 9.80665            # m/s^2

    r_km = earth_radius + max(altitude_km, 180.0)
    v_circ_km_s = math.sqrt(mu_earth / r_km)
    
    needed_separation_km = max(target_miss_km - current_miss_km, 1.0)
    
    # Delta-V required to shift trajectory phasing by needed_separation_km over 2 orbital revs
    orbital_period_s = 2 * math.pi * math.sqrt((r_km ** 3) / mu_earth)
    delta_v_m_s = (needed_separation_km / (2 * r_km)) * (v_circ_km_s * 1000.0)
    
    # Bound delta-v realistically (0.01 m/s to 12.0 m/s)
    delta_v_m_s = round(min(max(delta_v_m_s, 0.01), 12.0), 4)
    
    # Tsiolkovsky Rocket Equation: Delta_m = m0 * (1 - exp(-Delta_v / (Isp * g0)))
    fuel_kg = mass_kg * (1.0 - math.exp(-delta_v_m_s / (isp_seconds * g0)))
    fuel_kg = round(max(fuel_kg, 0.005), 4)
    
    burn_duration_s = round((delta_v_m_s * mass_kg) / thrust_n, 1)

    return {
        "delta_v_m_s": delta_v_m_s,
        "fuel_cost_kg": fuel_kg,
        "burn_duration_seconds": burn_duration_s,
        "orbital_period_seconds": orbital_period_s,
    }


def evaluate_intent_negotiation(
    event_id: str,
    obj_a_name: str,
    obj_b_name: str,
    altitude_km: float,
    current_miss_km: float,
    collision_probability: float,
    tca_utc: str,
    tle_age_hours: float = 6.0,
) -> NegotiationResult:
    """
    Generate all 6 deterministic options for the Intent-to-Action Negotiator,
    evaluating trade-offs across fuel, risk, downtime, and tracking uncertainty.
    Retrieves authoritative server-side event data when event_id exists.
    """
    if event_id:
        db_event = storage.get_event(event_id)
        if db_event:
            obj_a_name = db_event.get("satellite") or obj_a_name
            obj_b_name = db_event.get("object") or obj_b_name
            current_miss_km = float(db_event.get("miss_distance", current_miss_km))
            collision_probability = float(db_event.get("collision_probability", collision_probability))
            tca_utc = db_event.get("tca") or tca_utc
    try:
        tca_dt = datetime.fromisoformat(tca_utc.replace("Z", "+00:00"))
        now_dt = datetime.now(timezone.utc)
        time_to_tca_hours = max((tca_dt - now_dt).total_seconds() / 3600.0, 0.1)
    except Exception:
        time_to_tca_hours = 24.0

    # 1. Option A: Maneuver Object A (Primary satellite)
    man_a = compute_deterministic_maneuver(altitude_km, current_miss_km, target_miss_km=45.0, mass_kg=550.0)
    # Direction: Retrograde for LEO < 550km (lowers perigee, passes behind); Prograde for >= 550km
    direction_a = "RETROGRADE" if altitude_km < 550.0 else "PROGRADE"
    exp_miss_a = round(current_miss_km + 45.0, 1)
    
    risk_score_a = 95.0
    fuel_score_a = round(max(100.0 - (man_a["fuel_cost_kg"] * 30.0), 10.0), 1)
    continuity_score_a = 70.0  # Station-keeping payload downtime required
    confidence_a = round(min(max(100.0 - (tle_age_hours * 1.5), 60.0), 98.0), 1)
    comp_a = round((risk_score_a * 0.40) + (fuel_score_a * 0.25) + (continuity_score_a * 0.15) + (confidence_a * 0.20), 1)

    cand_1 = CandidateOption(
        id="OPT-1-MANEUVER-A",
        action_type="MANEUVER_A",
        title=f"Execute Avoidance Burn on {obj_a_name}",
        target_object=obj_a_name,
        burn_direction=direction_a,
        delta_v_m_s=man_a["delta_v_m_s"],
        burn_duration_seconds=man_a["burn_duration_seconds"],
        fuel_cost_kg=man_a["fuel_cost_kg"],
        expected_miss_km=exp_miss_a,
        time_to_tca_hours=time_to_tca_hours,
        risk_reduction_score=risk_score_a,
        fuel_efficiency_score=fuel_score_a,
        mission_continuity_score=continuity_score_a,
        confidence_score=confidence_a,
        composite_score=comp_a,
        trade_off_summary=(
            f"Achieves highest safety margin (+{exp_miss_a:.1f} km). Consumes {man_a['fuel_cost_kg']:.3f} kg hydrazine "
            f"and requires 45 min payload offline window during {direction_a} burn."
        ),
    )

    # 2. Option B: Maneuver Object B (If maneuverable / cooperative operator)
    is_debris = any(k in obj_b_name.upper() for k in ["DEB", "R/B", "FRAGMENT", "UNKNOWN"])
    if is_debris:
        # Non-maneuverable debris
        cand_2 = CandidateOption(
            id="OPT-2-MANEUVER-B",
            action_type="MANEUVER_B",
            title=f"Request Avoidance Burn on {obj_b_name} (Debris / Inactive)",
            target_object=obj_b_name,
            burn_direction="N/A",
            delta_v_m_s=0.0,
            burn_duration_seconds=0.0,
            fuel_cost_kg=0.0,
            expected_miss_km=current_miss_km,
            time_to_tca_hours=time_to_tca_hours,
            risk_reduction_score=0.0,
            fuel_efficiency_score=100.0,
            mission_continuity_score=100.0,
            confidence_score=99.0,
            composite_score=15.0,
            trade_off_summary=f"Infeasible. {obj_b_name} is non-operational orbital debris with zero propulsion capability.",
        )
    else:
        man_b = compute_deterministic_maneuver(altitude_km + 10.0, current_miss_km, target_miss_km=40.0, mass_kg=480.0)
        direction_b = "NORMAL"
        exp_miss_b = round(current_miss_km + 40.0, 1)
        risk_score_b = 92.0
        fuel_score_b = 88.0  # Operator B pays fuel cost
        continuity_score_b = 95.0  # Primary asset keeps 100% mission payload online
        confidence_b = 85.0
        comp_b = round((risk_score_b * 0.40) + (fuel_score_b * 0.25) + (continuity_score_b * 0.15) + (confidence_b * 0.20), 1)
        cand_2 = CandidateOption(
            id="OPT-2-MANEUVER-B",
            action_type="MANEUVER_B",
            title=f"Coordinate Co-Avoidance Burn with {obj_b_name}",
            target_object=obj_b_name,
            burn_direction=direction_b,
            delta_v_m_s=man_b["delta_v_m_s"],
            burn_duration_seconds=man_b["burn_duration_seconds"],
            fuel_cost_kg=man_b["fuel_cost_kg"],
            expected_miss_km=exp_miss_b,
            time_to_tca_hours=time_to_tca_hours,
            risk_reduction_score=risk_score_b,
            fuel_efficiency_score=fuel_score_b,
            mission_continuity_score=continuity_score_b,
            confidence_score=confidence_b,
            composite_score=comp_b,
            trade_off_summary=f"Preserves {obj_a_name} fuel and payload mission. Requires cross-operator inter-agency coordination protocol.",
        )

    # 3. Option 3: Request Additional Tracking / SSN Sensor Tasking
    cand_3 = CandidateOption(
        id="OPT-3-SENSOR-TASKING",
        action_type="SENSOR_TASKING",
        title="Task Space Surveillance Network (SSN) Radar Tracking Pass",
        target_object=f"{obj_a_name} & {obj_b_name}",
        burn_direction="NONE",
        delta_v_m_s=0.0,
        burn_duration_seconds=0.0,
        fuel_cost_kg=0.0,
        expected_miss_km=current_miss_km,
        time_to_tca_hours=time_to_tca_hours,
        risk_reduction_score=65.0,
        fuel_efficiency_score=100.0,
        mission_continuity_score=100.0,
        confidence_score=94.0,
        composite_score=78.5,
        trade_off_summary=(
            "Zero propellant consumed. Obtains high-fidelity radar metric observations to collapse covariance ellipsoid "
            "prior to committing to burn."
        ),
    )

    # 4. Option 4: Hold and Re-screen at Next TLE Epoch
    can_hold = time_to_tca_hours > 18.0
    cand_4 = CandidateOption(
        id="OPT-4-HOLD-RESCREEN",
        action_type="HOLD_RESCREEN",
        title="Hold Maneuver & Re-screen at Next TLE Batch Update",
        target_object="CONJUNCTION_PAIR",
        burn_direction="NONE",
        delta_v_m_s=0.0,
        burn_duration_seconds=0.0,
        fuel_cost_kg=0.0,
        expected_miss_km=current_miss_km,
        time_to_tca_hours=time_to_tca_hours,
        risk_reduction_score=40.0 if can_hold else 10.0,
        fuel_efficiency_score=100.0,
        mission_continuity_score=100.0,
        confidence_score=70.0,
        composite_score=62.0 if can_hold else 25.0,
        trade_off_summary=(
            f"TCA is T-{time_to_tca_hours:.1f}h. Holding avoids premature fuel expenditure while orbital covariance shrinks, "
            f"re-evaluating at T-12h Go/No-Go gate."
            if can_hold else "High risk: TCA is under 18 hours. Holding severely narrows available maneuver execution windows."
        ),
    )

    # 5. Option 5: Escalate to Safety Lead / Mission Manager
    cand_5 = CandidateOption(
        id="OPT-5-ESCALATE-SAFETY",
        action_type="ESCALATE",
        title="Escalate Event to Mission Operations Lead & Flight Director",
        target_object="FLIGHT_DIRECTOR",
        burn_direction="NONE",
        delta_v_m_s=0.0,
        burn_duration_seconds=0.0,
        fuel_cost_kg=0.0,
        expected_miss_km=current_miss_km,
        time_to_tca_hours=time_to_tca_hours,
        risk_reduction_score=80.0,
        fuel_efficiency_score=90.0,
        mission_continuity_score=85.0,
        confidence_score=90.0,
        composite_score=84.5,
        trade_off_summary=(
            "Transfers operational oversight to Mission Safety Lead for formal Go/No-Go flight decision and ground station uplink authorization."
        ),
    )

    # 6. Option 6: Insufficient Data / Observation Tasking
    is_sparse = tle_age_hours > 72.0 or current_miss_km > 20.0
    cand_6 = CandidateOption(
        id="OPT-6-INSUFFICIENT-DATA",
        action_type="INSUFFICIENT_DATA",
        title="Flag Conjunction as Insufficient Ephemeris Fidelity",
        target_object="EPHEMERIS_AUDIT",
        burn_direction="NONE",
        delta_v_m_s=0.0,
        burn_duration_seconds=0.0,
        fuel_cost_kg=0.0,
        expected_miss_km=current_miss_km,
        time_to_tca_hours=time_to_tca_hours,
        risk_reduction_score=50.0,
        fuel_efficiency_score=100.0,
        mission_continuity_score=100.0,
        confidence_score=50.0,
        composite_score=45.0,
        trade_off_summary=(
            f"TLE age is {tle_age_hours:.1f}h. SGP4 error growth exceeds 10 km. Maneuver calculation based on current TLE "
            "is unconstrained without verified fresh vector."
        ),
    )

    candidates = [cand_1, cand_2, cand_3, cand_4, cand_5, cand_6]

    # Deterministic Selection Logic for Recommended Option
    # If collision probability > 1e-4 and TCA < 18h -> Option 1 (or 2 if feasible and better)
    # If TCA > 24h and probability > 1e-4 -> Option 3 (Radar Tasking) or Option 4 (Hold)
    # If TLE is stale (> 72h) -> Option 6 (Insufficient data)
    if tle_age_hours > 72.0:
        recommended_cand = cand_6
        op_rec = "Ephemeris data is stale (>72h). Flagged for observational tasking before maneuver commitment."
    elif collision_probability >= 0.05:
        if time_to_tca_hours <= 18.0:
            recommended_cand = cand_1
            op_rec = f"Critical conjunction at T-{time_to_tca_hours:.1f}h. Execute {direction_a} burn on {obj_a_name} (Decision support only — human approval required)."
        else:
            recommended_cand = cand_3
            op_rec = f"High probability conjunction at T-{time_to_tca_hours:.1f}h. Immediate SSN radar tracking recommended to verify covariance before burn commitment."
    elif collision_probability >= 0.01:
        if time_to_tca_hours > 20.0:
            recommended_cand = cand_4
            op_rec = f"Medium risk at T-{time_to_tca_hours:.1f}h. Hold and re-screen at next TLE pass to conserve propellant."
        else:
            recommended_cand = cand_1
            op_rec = f"Medium risk with short horizon (T-{time_to_tca_hours:.1f}h). Execute evasive maneuver on {obj_a_name}."
    else:
        recommended_cand = cand_4
        op_rec = "Nominal trajectory margin. Hold position and continue automated passive screening."

    # Mark the recommended candidate
    for c in candidates:
        if c.id == recommended_cand.id:
            c.recommended = True
        else:
            c.recommended = False

    audit_hash = f"NEG-{event_id}-{int(datetime.now(timezone.utc).timestamp())}"

    return NegotiationResult(
        event_id=event_id,
        primary_object=obj_a_name,
        secondary_object=obj_b_name,
        current_miss_km=current_miss_km,
        collision_probability=collision_probability,
        tca_utc=tca_utc,
        generated_at_utc=datetime.now(timezone.utc).isoformat(),
        disclaimer=DISCLAIMER_TEXT,
        operational_recommendation=op_rec,
        candidates=candidates,
        audit_hash=audit_hash,
    )

