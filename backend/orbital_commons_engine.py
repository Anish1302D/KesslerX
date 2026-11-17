"""
KesslerX Orbital Commons AI — Deterministic Multi-Operator Coordination Engine
==============================================================================

Evaluates multi-operator conjunction responses across safety, propellant, mission continuity,
data uncertainty, nearby-object externalities, and burden-sharing fairness.

NON-NEGOTIABLE SAFETY RULES:
1. Decision support only — human approval required. Not a flight command system.
2. Physics, feasibility, fairness, Pareto frontier, and scoring are 100% deterministic.
3. No random numbers are ever used for risk, probability, delta-v, or scoring.
4. No AI/LLM output may alter physics, scores, candidates, or issue/approve commands.
5. Stale TLEs (>72h), passed/invalid TCA, or missing covariance inputs yield INSUFFICIENT_DATA.
6. Privacy boundary notice: Prototype privacy masking hides raw private constraints in
   cross-operator views and summaries; this is NOT a production cryptographic MPC/FL system.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import threading
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field

try:
    from negotiator_engine import DISCLAIMER_TEXT, compute_deterministic_maneuver
except ImportError:
    from backend.negotiator_engine import DISCLAIMER_TEXT, compute_deterministic_maneuver


ENGINE_VERSION = "orbital-commons-1.0.0"
MAX_TLE_AGE_HOURS = 72.0

# ── Central Policy Weight Configurations (Sum to 1.00 each) ────────────────

SCORING_WEIGHTS: Dict[str, float] = {
    "risk_reduction": 0.30,
    "fuel_efficiency": 0.15,
    "mission_continuity": 0.15,
    "uncertainty": 0.10,
    "externality": 0.10,
    "fairness": 0.15,
    "human_review": 0.05,
}


class PolicyMode(str, Enum):
    FAIR_BURDEN_SHARING = "FAIR_BURDEN_SHARING"
    MINIMUM_FUEL = "MINIMUM_FUEL"
    MINIMUM_MISSION_INTERRUPTION = "MINIMUM_MISSION_INTERRUPTION"
    MAXIMUM_RISK_REDUCTION = "MAXIMUM_RISK_REDUCTION"
    MINIMUM_EXTERNALITY = "MINIMUM_EXTERNALITY"


class ReviewStatus(str, Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    FIRST_REVIEW_COMPLETE = "FIRST_REVIEW_COMPLETE"
    SECOND_REVIEW_COMPLETE = "SECOND_REVIEW_COMPLETE"
    REJECTED = "REJECTED"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


POLICY_WEIGHTS: Dict[PolicyMode, Dict[str, float]] = {
    PolicyMode.FAIR_BURDEN_SHARING: dict(SCORING_WEIGHTS),
    PolicyMode.MINIMUM_FUEL: {
        "risk_reduction": 0.22,
        "fuel_efficiency": 0.40,
        "mission_continuity": 0.10,
        "uncertainty": 0.08,
        "externality": 0.08,
        "fairness": 0.07,
        "human_review": 0.05,
    },
    PolicyMode.MINIMUM_MISSION_INTERRUPTION: {
        "risk_reduction": 0.22,
        "fuel_efficiency": 0.10,
        "mission_continuity": 0.40,
        "uncertainty": 0.08,
        "externality": 0.08,
        "fairness": 0.07,
        "human_review": 0.05,
    },
    PolicyMode.MAXIMUM_RISK_REDUCTION: {
        "risk_reduction": 0.50,
        "fuel_efficiency": 0.08,
        "mission_continuity": 0.08,
        "uncertainty": 0.10,
        "externality": 0.12,
        "fairness": 0.07,
        "human_review": 0.05,
    },
    PolicyMode.MINIMUM_EXTERNALITY: {
        "risk_reduction": 0.24,
        "fuel_efficiency": 0.10,
        "mission_continuity": 0.10,
        "uncertainty": 0.10,
        "externality": 0.33,
        "fairness": 0.08,
        "human_review": 0.05,
    },
}

POLICY_DESCRIPTIONS: Dict[PolicyMode, str] = {
    PolicyMode.FAIR_BURDEN_SHARING: "Balances collision risk reduction with equitable propellant and downtime sharing across operators.",
    PolicyMode.MINIMUM_FUEL: "Prioritizes minimal propellant expenditure (e.g. assigning higher-Isp or smaller required burn).",
    PolicyMode.MINIMUM_MISSION_INTERRUPTION: "Protects payload uptime and operational service continuity across mission windows.",
    PolicyMode.MAXIMUM_RISK_REDUCTION: "Maximizes miss-distance margin and primary conjunction Pc reduction above cost preferences.",
    PolicyMode.MINIMUM_EXTERNALITY: "Minimizes secondary conjunction hazard imposed on nearby objects in the orbital corridor.",
}


# ── Strongly Typed Models ──────────────────────────────────────────────────


class OperatorConstraint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operator_id: str = Field(..., min_length=1, max_length=64)
    object_id: str = Field(..., min_length=1, max_length=64)
    available_delta_v_m_s: float = Field(ge=0.0, le=1000.0)
    minimum_service_availability_percent: float = Field(ge=0.0, le=100.0)
    maneuverable: bool
    propulsion_type: str = Field(..., min_length=1, max_length=64)
    blackout_windows: List[str] = Field(default_factory=list)
    minimum_miss_distance_km: float = Field(ge=0.0, le=1000.0)
    maximum_allowed_risk: float = Field(ge=0.0, le=1.0)
    preferred_action: Optional[str] = None
    private: bool = True
    prior_maneuver_count: int = Field(default=0, ge=0, le=500)


class NearbyObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    object_id: str = Field(..., min_length=1, max_length=64)
    object_name: str = Field(..., min_length=1, max_length=100)
    altitude_km: float = Field(ge=120.0, le=45000.0)
    distance_km: float = Field(ge=0.0, le=50000.0)
    collision_probability: float = Field(ge=0.0, le=1.0)
    maneuverable: bool


class OrbitalCorridor(BaseModel):
    model_config = ConfigDict(extra="allow")

    regime: str = "LEO"
    altitude_band_km: List[float] = Field(default_factory=lambda: [500.0, 600.0])
    congestion_index: float = Field(default=0.5, ge=0.0, le=1.0)


class UncertaintySummary(BaseModel):
    model_config = ConfigDict(extra="allow")

    covariance_available: Optional[bool] = None
    position_sigma_km: Optional[float] = Field(default=None, ge=0.0)
    radial_sigma_m: Optional[float] = Field(default=None, ge=0.0)
    along_track_sigma_m: Optional[float] = Field(default=None, ge=0.0)
    cross_track_sigma_m: Optional[float] = Field(default=None, ge=0.0)
    source: Optional[str] = None


class ExternalitySummary(BaseModel):
    model_config = ConfigDict(extra="allow")

    corridor_risk_level: str = "MODERATE"
    nearby_object_count: Optional[int] = None
    notes: Optional[str] = None


class ImpactGraph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(..., min_length=1, max_length=64)
    primary_object: str = Field(..., min_length=1, max_length=100)
    secondary_object: str = Field(..., min_length=1, max_length=100)
    nearby_objects: List[NearbyObject] = Field(default_factory=list)
    orbital_corridor: OrbitalCorridor
    data_age_hours: float = Field(ge=0.0)
    uncertainty_summary: UncertaintySummary
    externality_summary: ExternalitySummary


class CommonsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(..., min_length=1, max_length=64)
    primary_object: str = Field(..., min_length=1, max_length=100)
    secondary_object: str = Field(..., min_length=1, max_length=100)
    altitude_km: float = Field(ge=120.0, le=45000.0)
    miss_distance_km: float = Field(ge=0.0, le=10000.0)
    collision_probability: float = Field(ge=0.0, le=1.0)
    tca: str = Field(..., min_length=10, max_length=64)
    tle_age_hours: float = Field(ge=0.0)
    operator_a: OperatorConstraint
    operator_b: OperatorConstraint
    impact_graph: ImpactGraph
    policy: PolicyMode = PolicyMode.FAIR_BURDEN_SHARING
    reference_time_utc: Optional[str] = None
    include_llm_explanation: bool = False
    viewer_operator_id: Optional[str] = None
    data_mode: str = Field(default="simulated")


class CandidatePhysicsMetrics(BaseModel):
    delta_v_a_m_s: float
    delta_v_b_m_s: float
    total_delta_v_m_s: float
    fuel_a_kg: float
    fuel_b_kg: float
    total_fuel_kg: float
    expected_miss_km: float
    post_action_probability: float
    downtime_a_pct: float
    downtime_b_pct: float
    nearby_max_risk: float


class BurdenDistribution(BaseModel):
    operator_a_fuel_kg: float
    operator_b_fuel_kg: float
    operator_a_downtime_minutes: float
    operator_b_downtime_minutes: float
    operator_a_risk_benefit_pct: float
    operator_b_risk_benefit_pct: float
    fairness_summary: str


class CommonsCandidate(BaseModel):
    id: str
    action_type: str
    title: str
    target_object: str
    feasible: bool
    recommended: bool = False
    pareto_optimal: bool = False
    risk_reduction_score: float
    fuel_efficiency_score: float
    mission_continuity_score: float
    uncertainty_score: float
    externality_score: float
    fairness_score: float
    human_review_score: float
    composite_score: float
    cost_bearer: str
    beneficiaries: List[str]
    burden_distribution: BurdenDistribution
    physics: CandidatePhysicsMetrics
    trade_off_summary: str
    rejected_reasons: List[str]
    evidence_refs: List[str]


class CounterfactualSummary(BaseModel):
    question: str = "What happens if no action is taken?"
    current_collision_probability: float
    expected_miss_distance_km: float
    expected_nearby_object_impact: str
    nearby_at_risk_count: int
    max_nearby_collision_probability: float
    remaining_time_to_tca_hours: float
    additional_tracking_recommended: bool
    summary: str


class PolicyHighlights(BaseModel):
    safest_feasible_id: Optional[str] = None
    lowest_fuel_id: Optional[str] = None
    lowest_disruption_id: Optional[str] = None
    fairest_id: Optional[str] = None
    lowest_externality_id: Optional[str] = None
    recommended_id: Optional[str] = None


class OperatorConstraintSafeSummary(BaseModel):
    operator_label: str
    operator_id_masked: str
    object_id: str
    maneuverable: bool
    propulsion_type: str
    privacy_protected: bool
    capability_summary: str
    authorized_private_details: Optional[Dict[str, Any]] = None


class ReviewerRecord(BaseModel):
    reviewer_id: str
    reviewer_role: str
    candidate_id: str
    notes: str
    reviewed_at_utc: str
    safety_acknowledged: bool = True


class ClarificationRecord(BaseModel):
    requested_by: str
    message: str
    requested_at_utc: str


class ApprovalState(BaseModel):
    status: ReviewStatus = ReviewStatus.PENDING_REVIEW
    selected_candidate_id: Optional[str] = None
    first_reviewer: Optional[ReviewerRecord] = None
    second_reviewer: Optional[ReviewerRecord] = None
    rejected_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    clarifications: List[ClarificationRecord] = Field(default_factory=list)
    command_executed: bool = False
    command_status_note: str = "No spacecraft command executed. Decision support only — human approval required."


class LLMCommonsExplanation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(..., min_length=10)
    recommended_option_explanation: str = Field(..., min_length=10)
    trade_offs: List[str]
    fairness_explanation: str = Field(..., min_length=5)
    externality_explanation: str = Field(..., min_length=5)
    evidence_references: List[str]
    assumptions: List[str]
    uncertainties: List[str]
    missing_inputs: List[str]
    disclaimer: str


class CommonsReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_id: str = Field(..., min_length=1, max_length=64)
    notes: str = Field(default="", max_length=1000)
    reviewer_id: Optional[str] = Field(default=None, max_length=64)
    reviewer_role: Optional[str] = Field(default=None, max_length=64)
    safety_acknowledged: bool = True


class CommonsRejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=3, max_length=1000)
    action: str = Field(default="reject", pattern="^(reject|clarification)$")
    reviewer_id: Optional[str] = Field(default=None, max_length=64)


class CommonsResult(BaseModel):
    event_id: str
    primary_object: str
    secondary_object: str
    status: str
    selected_policy: str
    policy_weights: Dict[str, float]
    recommended_candidate_id: str
    operational_recommendation: str
    candidates: List[CommonsCandidate]
    pareto_frontier: List[str]
    highlights: PolicyHighlights
    counterfactual: CounterfactualSummary
    operator_constraint_summaries: List[OperatorConstraintSafeSummary]
    fairness_explanation: str
    privacy_explanation: str
    provenance_summary: str
    data_mode: str
    tca_utc: str
    time_to_tca_hours: float
    tle_age_hours: float
    collision_probability: float
    miss_distance_km: float
    assumptions: List[str]
    uncertainties: List[str]
    missing_inputs: List[str]
    evidence_packet: Dict[str, Any]
    audit_hash_sha256: str
    explanation: Optional[Dict[str, Any]] = None
    review_state: ApprovalState
    generated_at_utc: str
    disclaimer: str = DISCLAIMER_TEXT


# ── Helpers ────────────────────────────────────────────────────────────────


def _clamp(val: float, low: float = 0.0, high: float = 100.0) -> float:
    return round(max(low, min(high, float(val))), 2)


def _isp_for_propulsion(propulsion_type: str) -> float:
    """Deterministic specific impulse mapping by propulsion category."""
    p = propulsion_type.upper()
    if any(k in p for k in ("HALL", "ION", "ELECTRIC", "XENON", "EP")):
        return 1550.0
    if any(k in p for k in ("BIPROP", "MMH", "NTO")):
        return 305.0
    if any(k in p for k in ("COLD", "NITROGEN")):
        return 68.0
    return 220.0  # Standard monopropellant hydrazine


def _compute_fuel_for_burn(delta_v_m_s: float, mass_kg: float, isp_seconds: float) -> float:
    """Tsiolkovsky propellant consumption in kg (zero randomness)."""
    if delta_v_m_s <= 0.0:
        return 0.0
    g0 = 9.80665
    fuel = mass_kg * (1.0 - math.exp(-delta_v_m_s / (isp_seconds * g0)))
    return round(max(fuel, 0.0001), 4)


def _parse_utc(ts: str) -> datetime:
    normalized = ts.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def canonicalize_json(obj: Any) -> str:
    """Canonical sorted-key JSON serialization compatible with frontend verification."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_canonical_sha256(payload: Any) -> str:
    """Compute real cryptographic SHA-256 hex digest of canonical JSON."""
    canonical = canonicalize_json(payload).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _parse_relative_hours_offset(token: str) -> Optional[float]:
    """Parse relative offset tokens such as T-4h, T-90m, T-0h into hours before TCA (>=0)."""
    m = re.match(r"^T-(\d+(?:\.\d+)?)([hm])$", token.strip(), re.IGNORECASE)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2).lower()
    return val / 60.0 if unit == "m" else val


def _burn_violates_blackout(
    blackout_windows: List[str],
    burn_hours_before_tca: float,
    tca_dt: Optional[datetime],
    ref_dt: datetime,
) -> Optional[str]:
    """Check whether planned burn execution time intersects any declared blackout window."""
    if not blackout_windows:
        return None

    for raw in blackout_windows:
        win = raw.strip()
        if not win:
            continue
        upper = win.upper()
        if upper in ("ALL", "ALWAYS", "PRE_TCA", "IMAGING_PASS", "BLACKOUT_ALL"):
            return f"Operator blackout window '{win}' restricts maneuver execution."

        # Relative interval syntax: e.g. "T-4h..T-0h" or "T-6h to T-2h"
        rel_parts = re.split(r"\.\.|to|/", win, maxsplit=1, flags=re.IGNORECASE)
        if len(rel_parts) == 2:
            h1 = _parse_relative_hours_offset(rel_parts[0])
            h2 = _parse_relative_hours_offset(rel_parts[1])
            if h1 is not None and h2 is not None:
                hi, lo = max(h1, h2), min(h1, h2)
                if lo <= burn_hours_before_tca <= hi:
                    return "Planned burn timing conflicts with an operator restricted blackout window."

            # ISO interval syntax: "2026-11-17T10:00:00Z/2026-11-17T14:00:00Z"
            if tca_dt is not None:
                try:
                    w_start = _parse_utc(rel_parts[0])
                    w_end = _parse_utc(rel_parts[1])
                    burn_dt = tca_dt.timestamp() - (burn_hours_before_tca * 3600.0)
                    burn_dt = max(ref_dt.timestamp(), burn_dt)
                    if w_start.timestamp() <= burn_dt <= w_end.timestamp():
                        return "Planned burn epoch intersects an operator restricted blackout window."
                except Exception:
                    pass
    return None


def _build_safe_operator_summary(
    label: str,
    constraint: OperatorConstraint,
    authorized_view: bool = False,
) -> OperatorConstraintSafeSummary:
    """
    Build a cross-operator safe capability summary without leaking raw private thresholds.
    Raw values are only populated when viewer explicitly holds ownership authorization AND asks.
    """
    restricted_msgs: List[str] = []
    if not constraint.maneuverable:
        restricted_msgs.append("non-maneuverable object")
    else:
        if constraint.available_delta_v_m_s < 1.5:
            restricted_msgs.append("limited propellant delta-v reserve")
        else:
            restricted_msgs.append("adequate propellant reserve")
        if constraint.blackout_windows:
            restricted_msgs.append("has a restricted maneuver blackout window")
        if constraint.minimum_service_availability_percent >= 94.0:
            restricted_msgs.append("strict service-continuity constraint")
        if constraint.prior_maneuver_count >= 2:
            restricted_msgs.append("has borne recent prior avoidance maneuvers")

    summary_text = f"{label} ({constraint.object_id}): " + ", ".join(restricted_msgs) + "."
    masked_id = constraint.operator_id if not constraint.private else f"{label.upper().replace(' ', '_')}_MASKED"

    private_details = None
    if authorized_view or not constraint.private:
        private_details = {
            "operator_id": constraint.operator_id,
            "available_delta_v_m_s": constraint.available_delta_v_m_s,
            "minimum_service_availability_percent": constraint.minimum_service_availability_percent,
            "blackout_windows_count": len(constraint.blackout_windows),
            "minimum_miss_distance_km": constraint.minimum_miss_distance_km,
            "maximum_allowed_risk": constraint.maximum_allowed_risk,
            "preferred_action": constraint.preferred_action,
            "prior_maneuver_count": constraint.prior_maneuver_count,
        }

    return OperatorConstraintSafeSummary(
        operator_label=label,
        operator_id_masked=masked_id,
        object_id=constraint.object_id,
        maneuverable=constraint.maneuverable,
        propulsion_type=constraint.propulsion_type,
        privacy_protected=constraint.private,
        capability_summary=summary_text,
        authorized_private_details=private_details,
    )


def _evaluate_nearby_externality(
    base_alt_km: float,
    alt_shift_km: float,
    nearby_objects: List[NearbyObject],
) -> Tuple[float, float, str]:
    """
    Deterministically evaluate externality imposed on nearby objects by an altitude shift.
    Returns (externality_score 0-100, post_shift_max_nearby_prob, concise note).
    """
    if not nearby_objects:
        return 95.0, 0.0, "No nearby cataloged corridor objects impacted."

    new_alt = base_alt_km + alt_shift_km
    total_penalty = 0.0
    max_risk = 0.0
    worst_name = ""

    for nb in nearby_objects:
        alt_diff = abs(new_alt - nb.altitude_km)
        # Closer post-burn altitude to a nearby object raises secondary conjunction pressure
        proximity_factor = max(0.0, 1.0 - (alt_diff / 25.0))
        baseline_dist_factor = 1.0 / max(nb.distance_km, 0.5)
        induced_risk = min(0.5, nb.collision_probability * (1.0 + 3.0 * proximity_factor * min(baseline_dist_factor, 2.0)))
        if induced_risk > max_risk:
            max_risk = induced_risk
            worst_name = nb.object_name

        # Non-maneuverable nearby satellites receive extra stewardship penalty
        maneuver_mult = 1.35 if not nb.maneuverable else 1.0
        total_penalty += (proximity_factor * 42.0 + nb.collision_probability * 120.0) * maneuver_mult

    score = _clamp(98.0 - total_penalty, 5.0, 100.0)
    if alt_shift_km == 0.0:
        base_max = max(nb.collision_probability for nb in nearby_objects)
        return _clamp(95.0 - base_max * 200.0, 20.0, 100.0), round(base_max, 5), "Zero orbital shift avoids perturbing adjacent corridors."

    note = (
        f"Trajectory shift ({alt_shift_km:+.1f} km) approaches corridor near {worst_name} (induced risk {max_risk:.2e})."
        if total_penalty > 25.0 and worst_name
        else f"Trajectory shift ({alt_shift_km:+.1f} km) maintains corridor clearance from nearby objects."
    )
    return score, round(max_risk, 5), note


def _compute_pareto_frontier(candidates: List[CommonsCandidate]) -> List[str]:
    """
    Identify non-dominated feasible candidates across:
    [risk_reduction, fuel_efficiency, mission_continuity, uncertainty, externality, fairness].
    """
    feasible = [c for c in candidates if c.feasible]
    if not feasible:
        return []

    dims = (
        "risk_reduction_score",
        "fuel_efficiency_score",
        "mission_continuity_score",
        "uncertainty_score",
        "externality_score",
        "fairness_score",
    )

    frontier_ids: List[str] = []
    for cand in feasible:
        dominated = False
        for other in feasible:
            if cand.id == other.id:
                continue
            ge_all = all(getattr(other, d) >= getattr(cand, d) for d in dims)
            gt_one = any(getattr(other, d) > getattr(cand, d) for d in dims)
            if ge_all and gt_one:
                dominated = True
                break
        cand.pareto_optimal = not dominated
        if not dominated:
            frontier_ids.append(cand.id)
    return frontier_ids


def generate_deterministic_commons_explanation(result: CommonsResult) -> Dict[str, Any]:
    """Deterministic structured explanation fallback used whenever LLM is unavailable or invalid."""
    rec = next((c for c in result.candidates if c.id == result.recommended_candidate_id), result.candidates[0])
    feasible_cnt = sum(1 for c in result.candidates if c.feasible)
    rejected_cnt = len(result.candidates) - feasible_cnt

    trade_offs = [
        f"{c.title} ({'FEASIBLE' if c.feasible else 'REJECTED'}): Composite {c.composite_score:.1f}/100 — {c.trade_off_summary}"
        for c in result.candidates
        if c.feasible or c.rejected_reasons
    ][:5]

    payload = LLMCommonsExplanation(
        summary=(
            f"Evaluated {len(result.candidates)} coordinated response options for {result.primary_object} × "
            f"{result.secondary_object} ({feasible_cnt} feasible, {rejected_cnt} rejected) under policy "
            f"{result.selected_policy}. Status: {result.status}. {DISCLAIMER_TEXT}"
        ),
        recommended_option_explanation=(
            f"Recommended candidate '{rec.title}' ({rec.id}) achieves composite score {rec.composite_score:.1f}/100 "
            f"with risk reduction {rec.risk_reduction_score:.1f}/100, fuel efficiency {rec.fuel_efficiency_score:.1f}/100, "
            f"fairness {rec.fairness_score:.1f}/100, and externality {rec.externality_score:.1f}/100."
        ),
        trade_offs=trade_offs,
        fairness_explanation=result.fairness_explanation,
        externality_explanation=result.counterfactual.expected_nearby_object_impact,
        evidence_references=[
            f"sha256:{result.audit_hash_sha256[:16]}...",
            *rec.evidence_refs,
        ],
        assumptions=result.assumptions,
        uncertainties=result.uncertainties,
        missing_inputs=result.missing_inputs,
        disclaimer=DISCLAIMER_TEXT,
    ).model_dump()
    payload["provenance"] = "deterministic-fallback"
    return payload


# ── Core Evaluator ─────────────────────────────────────────────────────────


def evaluate_orbital_commons(req: CommonsRequest) -> CommonsResult:
    """
    Deterministically evaluate multi-operator Orbital Commons options, feasibility rules,
    nearby-object externalities, operator fairness, Pareto frontier, counterfactual,
    and canonical SHA-256 evidence packet.
    """
    weights = POLICY_WEIGHTS[req.policy]

    # Parse reference epoch and TCA deterministically
    if req.reference_time_utc:
        ref_dt = _parse_utc(req.reference_time_utc)
    else:
        # Quantize wall-clock to whole minute when unpinned so rapid back-to-back repeated calls remain canonical
        now_raw = datetime.now(timezone.utc)
        ref_dt = now_raw.replace(second=0, microsecond=0)

    tca_valid = True
    tca_passed = False
    tca_dt: Optional[datetime] = None
    try:
        tca_dt = _parse_utc(req.tca)
        time_to_tca_hours = round((tca_dt - ref_dt).total_seconds() / 3600.0, 2)
        if time_to_tca_hours <= 0.0:
            tca_passed = True
    except Exception:
        tca_valid = False
        time_to_tca_hours = -1.0

    # Check data quality / missing uncertainty & covariance inputs
    missing_inputs: List[str] = []
    unc = req.impact_graph.uncertainty_summary
    has_sigma = any(
        val is not None
        for val in (unc.position_sigma_km, unc.radial_sigma_m, unc.along_track_sigma_m, unc.cross_track_sigma_m)
    )
    if unc.covariance_available is False:
        missing_inputs.append("Covariance matrix marked unavailable (covariance_available=false).")
    elif not has_sigma and not unc.model_dump(exclude_none=True):
        missing_inputs.append("Missing required orbital uncertainty / covariance sigma metrics.")

    if not tca_valid:
        missing_inputs.append(f"Invalid TCA timestamp format: '{req.tca}'.")
    elif tca_passed:
        missing_inputs.append("TCA has already passed relative to current operational epoch.")

    max_data_age = max(req.tle_age_hours, req.impact_graph.data_age_hours)
    stale_tle = max_data_age > MAX_TLE_AGE_HOURS
    if stale_tle:
        missing_inputs.append(
            f"Orbit ephemeris / impact graph age ({max_data_age:.1f}h) exceeds {MAX_TLE_AGE_HOURS:.0f}h operational threshold."
        )

    insufficient_data = (
        len(missing_inputs) > 0
        or math.isnan(req.collision_probability)
        or math.isnan(req.miss_distance_km)
    )

    # Baseline uncertainty score from TLE age & covariance
    base_uncertainty_score = _clamp(
        96.0 - (max_data_age * 1.1) - (15.0 if not has_sigma else 0.0),
        10.0,
        99.0,
    )

    # Compute physical maneuver sizing using existing negotiator mechanics (zero randomness)
    isp_a = _isp_for_propulsion(req.operator_a.propulsion_type)
    isp_b = _isp_for_propulsion(req.operator_b.propulsion_type)

    target_miss = max(req.operator_a.minimum_miss_distance_km, req.operator_b.minimum_miss_distance_km, 40.0)
    burn_lead_h = round(min(max(max(time_to_tca_hours, 1.0) * 0.6, 1.5), 6.0), 2)

    man_a_base = compute_deterministic_maneuver(
        altitude_km=req.altitude_km,
        current_miss_km=req.miss_distance_km,
        target_miss_km=target_miss,
        mass_kg=550.0,
        isp_seconds=isp_a,
    )
    revs_a = max((burn_lead_h * 3600.0) / max(man_a_base["orbital_period_seconds"], 1.0), 1.0)
    needed_sep_a = max(target_miss - req.miss_distance_km, 0.5)
    r_earth_a = 6371.0 + max(req.altitude_km, 180.0)
    v_circ_a_m_s = math.sqrt(398600.4418 / r_earth_a) * 1000.0
    dv_a_cw = (needed_sep_a * v_circ_a_m_s) / (6.0 * math.pi * revs_a * r_earth_a)
    dv_a_phased = round(min(max(dv_a_cw * 1.8, 0.08), man_a_base["delta_v_m_s"]), 4)
    man_a = {**man_a_base, "delta_v_m_s": dv_a_phased}
    fuel_a_full = _compute_fuel_for_burn(man_a["delta_v_m_s"], 550.0, isp_a)

    # Operator B maneuver sizing (can use smaller target miss slightly offset in plane if B is agile comms sat)
    target_miss_b = max(target_miss * 0.9, 32.0)
    man_b_base = compute_deterministic_maneuver(
        altitude_km=req.altitude_km + 2.0,
        current_miss_km=req.miss_distance_km,
        target_miss_km=target_miss_b,
        mass_kg=420.0,
        isp_seconds=isp_b,
    )
    revs_b = max((burn_lead_h * 3600.0) / max(man_b_base["orbital_period_seconds"], 1.0), 1.0)
    needed_sep_b = max(target_miss_b - req.miss_distance_km, 0.5)
    r_earth_b = 6371.0 + max(req.altitude_km + 2.0, 180.0)
    v_circ_b_m_s = math.sqrt(398600.4418 / r_earth_b) * 1000.0
    dv_b_cw = (needed_sep_b * v_circ_b_m_s) / (6.0 * math.pi * revs_b * r_earth_b)
    dv_b_phased = round(min(max(dv_b_cw * 1.8, 0.08), man_b_base["delta_v_m_s"]), 4)
    man_b = {**man_b_base, "delta_v_m_s": dv_b_phased}
    fuel_b_full = _compute_fuel_for_burn(man_b["delta_v_m_s"], 420.0, isp_b)

    # Split maneuver (each pays 55% of unilateral phasing burn for wider combined separation)
    dv_split_a = round(man_a["delta_v_m_s"] * 0.55, 4)
    dv_split_b = round(man_b["delta_v_m_s"] * 0.55, 4)
    fuel_split_a = _compute_fuel_for_burn(dv_split_a, 550.0, isp_a)
    fuel_split_b = _compute_fuel_for_burn(dv_split_b, 420.0, isp_b)

    def _compute_fairness(
        dv_a: float,
        dv_b: float,
        downtime_a: float,
        downtime_b: float,
        nearby_risk: float,
    ) -> float:
        if dv_a == 0.0 and dv_b == 0.0:
            # Passive coordination shares procedural review evenly; mild penalty if primary risk stays elevated
            return _clamp(78.0 - (req.collision_probability * 150.0) - (nearby_risk * 120.0), 20.0, 95.0)

        burden_a = (dv_a / max(req.operator_a.available_delta_v_m_s, 0.25)) + (downtime_a / 15.0)
        burden_b = (dv_b / max(req.operator_b.available_delta_v_m_s, 0.25)) + (downtime_b / 15.0)
        total_b = burden_a + burden_b
        imbalance = abs(burden_a - burden_b) / total_b if total_b > 0 else 0.0

        # Penalty if operator paying majority of cost already bore prior maneuvers
        repeat_penalty = 0.0
        if burden_a > burden_b * 1.4 and req.operator_a.prior_maneuver_count > 0:
            repeat_penalty = min(22.0, req.operator_a.prior_maneuver_count * 8.0)
        elif burden_b > burden_a * 1.4 and req.operator_b.prior_maneuver_count > 0:
            repeat_penalty = min(22.0, req.operator_b.prior_maneuver_count * 8.0)

        ext_penalty = min(25.0, nearby_risk * 180.0)
        return _clamp(98.0 - (40.0 * imbalance) - repeat_penalty - ext_penalty, 5.0, 99.0)

    def _weighted_composite(c: CommonsCandidate) -> float:
        if not c.feasible:
            return 0.0
        raw = (
            c.risk_reduction_score * weights["risk_reduction"]
            + c.fuel_efficiency_score * weights["fuel_efficiency"]
            + c.mission_continuity_score * weights["mission_continuity"]
            + c.uncertainty_score * weights["uncertainty"]
            + c.externality_score * weights["externality"]
            + c.fairness_score * weights["fairness"]
            + c.human_review_score * weights["human_review"]
        )
        return _clamp(raw, 0.0, 100.0)

    common_stale_or_missing_reasons: List[str] = []
    if stale_tle:
        common_stale_or_missing_reasons.append(f"Ephemeris age ({max_data_age:.1f}h) exceeds 72h limit.")
    if not tca_valid:
        common_stale_or_missing_reasons.append("Invalid TCA timestamp.")
    elif tca_passed:
        common_stale_or_missing_reasons.append("TCA has already passed.")
    if not has_sigma and unc.covariance_available is not True:
        common_stale_or_missing_reasons.append("Required uncertainty/covariance inputs are missing.")
    elif unc.covariance_available is False:
        common_stale_or_missing_reasons.append("Covariance data explicitly marked unavailable.")

    candidates: List[CommonsCandidate] = []

    # ── 1. Maneuver Primary Satellite ───────────────────────────────────────
    rej_1 = list(common_stale_or_missing_reasons)
    if not req.operator_a.maneuverable:
        rej_1.append(f"Primary object {req.primary_object} is marked non-maneuverable.")
    if man_a["delta_v_m_s"] > req.operator_a.available_delta_v_m_s:
        rej_1.append("Required delta-v exceeds Operator A available propellant budget.")
    downtime_1a = 8.0  # % service impact during imaging attitude slew & burn
    if (100.0 - downtime_1a) < req.operator_a.minimum_service_availability_percent:
        rej_1.append("Projected mission availability falls below Operator A minimum service threshold.")
    bo_1 = _burn_violates_blackout(req.operator_a.blackout_windows, burn_lead_h, tca_dt, ref_dt)
    if bo_1:
        rej_1.append(bo_1)

    ext_score_1, nearby_risk_1, ext_note_1 = _evaluate_nearby_externality(
        req.altitude_km, 28.0, req.impact_graph.nearby_objects
    )
    post_prob_1 = round(max(1e-6, req.collision_probability * 0.02), 6)
    max_risk_limit = min(req.operator_a.maximum_allowed_risk, req.operator_b.maximum_allowed_risk)
    if post_prob_1 > max_risk_limit or nearby_risk_1 > req.operator_a.maximum_allowed_risk:
        rej_1.append("Residual or induced secondary risk exceeds configured safety limit.")

    feasible_1 = len(rej_1) == 0
    fair_1 = _compute_fairness(man_a["delta_v_m_s"], 0.0, downtime_1a, 0.0, nearby_risk_1)
    fuel_eff_1 = _clamp(100.0 - (fuel_a_full * 180.0) - (man_a["delta_v_m_s"] * 22.0), 15.0, 99.0)
    cont_1 = _clamp(100.0 - downtime_1a * 4.5, 10.0, 100.0)
    c1 = CommonsCandidate(
        id="OPT-1-MANEUVER-PRIMARY",
        action_type="MANEUVER_PRIMARY",
        title=f"Maneuver Primary Satellite ({req.primary_object})",
        target_object=req.primary_object,
        feasible=feasible_1,
        risk_reduction_score=94.0 if feasible_1 else 0.0,
        fuel_efficiency_score=fuel_eff_1 if feasible_1 else 0.0,
        mission_continuity_score=cont_1 if feasible_1 else 0.0,
        uncertainty_score=base_uncertainty_score,
        externality_score=ext_score_1 if feasible_1 else 0.0,
        fairness_score=fair_1 if feasible_1 else 0.0,
        human_review_score=82.0,
        composite_score=0.0,
        cost_bearer=f"Operator A ({req.primary_object})",
        beneficiaries=[f"Operator A ({req.primary_object})", f"Operator B ({req.secondary_object})"],
        burden_distribution=BurdenDistribution(
            operator_a_fuel_kg=fuel_a_full,
            operator_b_fuel_kg=0.0,
            operator_a_downtime_minutes=round(downtime_1a * 4.5, 1),
            operator_b_downtime_minutes=0.0,
            operator_a_risk_benefit_pct=98.0,
            operator_b_risk_benefit_pct=98.0,
            fairness_summary="Unilateral primary maneuver: Operator A absorbs 100% of propellant and mission interruption cost.",
        ),
        physics=CandidatePhysicsMetrics(
            delta_v_a_m_s=man_a["delta_v_m_s"],
            delta_v_b_m_s=0.0,
            total_delta_v_m_s=man_a["delta_v_m_s"],
            fuel_a_kg=fuel_a_full,
            fuel_b_kg=0.0,
            total_fuel_kg=fuel_a_full,
            expected_miss_km=round(req.miss_distance_km + target_miss, 2),
            post_action_probability=post_prob_1,
            downtime_a_pct=downtime_1a,
            downtime_b_pct=0.0,
            nearby_max_risk=nearby_risk_1,
        ),
        trade_off_summary=(
            f"Unilateral burn on {req.primary_object} ({man_a['delta_v_m_s']:.2f} m/s, {fuel_a_full:.4f} kg). {ext_note_1}"
        ),
        rejected_reasons=rej_1,
        evidence_refs=["vis-viva-phasing", "tsiolkovsky-propellant", "impact-graph-corridor"],
    )
    c1.composite_score = _weighted_composite(c1)
    candidates.append(c1)

    # ── 2. Maneuver Secondary Satellite (if maneuverable) ───────────────────
    rej_2 = list(common_stale_or_missing_reasons)
    if not req.operator_b.maneuverable:
        rej_2.append(f"Secondary object {req.secondary_object} is non-maneuverable.")
    else:
        if man_b["delta_v_m_s"] > req.operator_b.available_delta_v_m_s:
            rej_2.append("Required delta-v exceeds Operator B available propellant budget.")
        downtime_2b = 5.0 if isp_b >= 1000.0 else 3.5  # Electric EP low-thrust takes longer burn window but minimal fuel
        if (100.0 - downtime_2b) < req.operator_b.minimum_service_availability_percent:
            rej_2.append("Projected mission availability falls below Operator B minimum service threshold.")
        bo_2 = _burn_violates_blackout(req.operator_b.blackout_windows, burn_lead_h, tca_dt, ref_dt)
        if bo_2:
            rej_2.append(bo_2)
    downtime_2b_val = (5.0 if isp_b >= 1000.0 else 3.5) if req.operator_b.maneuverable else 0.0

    # Retrograde/lower corridor offset (-18 km) often clears higher-altitude debris band
    ext_score_2, nearby_risk_2, ext_note_2 = _evaluate_nearby_externality(
        req.altitude_km, -18.0, req.impact_graph.nearby_objects
    )
    post_prob_2 = round(max(1e-6, req.collision_probability * 0.03), 6)
    if req.operator_b.maneuverable and (post_prob_2 > max_risk_limit or nearby_risk_2 > req.operator_b.maximum_allowed_risk):
        rej_2.append("Residual or induced secondary risk exceeds configured safety limit.")

    feasible_2 = len(rej_2) == 0
    fair_2 = _compute_fairness(0.0, man_b["delta_v_m_s"], 0.0, downtime_2b_val, nearby_risk_2)
    fuel_eff_2 = _clamp(100.0 - (fuel_b_full * 90.0) - (man_b["delta_v_m_s"] * 6.0), 20.0, 99.5)
    cont_2 = _clamp(100.0 - downtime_2b_val * 4.5, 25.0, 98.0)
    c2 = CommonsCandidate(
        id="OPT-2-MANEUVER-SECONDARY",
        action_type="MANEUVER_SECONDARY",
        title=f"Maneuver Secondary Satellite ({req.secondary_object})",
        target_object=req.secondary_object,
        feasible=feasible_2,
        risk_reduction_score=91.0 if feasible_2 else 0.0,
        fuel_efficiency_score=fuel_eff_2 if feasible_2 else 0.0,
        mission_continuity_score=cont_2 if feasible_2 else 0.0,
        uncertainty_score=base_uncertainty_score,
        externality_score=ext_score_2 if feasible_2 else 0.0,
        fairness_score=fair_2 if feasible_2 else 0.0,
        human_review_score=84.0,
        composite_score=0.0,
        cost_bearer=f"Operator B ({req.secondary_object})",
        beneficiaries=[f"Operator A ({req.primary_object})", f"Operator B ({req.secondary_object})"],
        burden_distribution=BurdenDistribution(
            operator_a_fuel_kg=0.0,
            operator_b_fuel_kg=fuel_b_full if req.operator_b.maneuverable else 0.0,
            operator_a_downtime_minutes=0.0,
            operator_b_downtime_minutes=round(downtime_2b_val * 4.5, 1),
            operator_a_risk_benefit_pct=97.0 if req.operator_b.maneuverable else 0.0,
            operator_b_risk_benefit_pct=97.0 if req.operator_b.maneuverable else 0.0,
            fairness_summary=(
                "Operator B executes avoidance burn, preserving Operator A mission continuity; B assumes full fuel cost."
                if req.operator_b.maneuverable
                else "Infeasible: secondary object lacks maneuverability."
            ),
        ),
        physics=CandidatePhysicsMetrics(
            delta_v_a_m_s=0.0,
            delta_v_b_m_s=man_b["delta_v_m_s"] if req.operator_b.maneuverable else 0.0,
            total_delta_v_m_s=man_b["delta_v_m_s"] if req.operator_b.maneuverable else 0.0,
            fuel_a_kg=0.0,
            fuel_b_kg=fuel_b_full if req.operator_b.maneuverable else 0.0,
            total_fuel_kg=fuel_b_full if req.operator_b.maneuverable else 0.0,
            expected_miss_km=round(req.miss_distance_km + (target_miss * 0.9 if req.operator_b.maneuverable else 0.0), 2),
            post_action_probability=post_prob_2 if req.operator_b.maneuverable else req.collision_probability,
            downtime_a_pct=0.0,
            downtime_b_pct=downtime_2b_val,
            nearby_max_risk=nearby_risk_2,
        ),
        trade_off_summary=(
            f"Operator B burn ({man_b['delta_v_m_s']:.2f} m/s, {fuel_b_full:.4f} kg, {req.operator_b.propulsion_type}). {ext_note_2}"
            if req.operator_b.maneuverable
            else f"Rejected: {req.secondary_object} cannot maneuver."
        ),
        rejected_reasons=rej_2,
        evidence_refs=["operator-b-propulsion-isp", "impact-graph-corridor"],
    )
    c2.composite_score = _weighted_composite(c2)
    candidates.append(c2)

    # ── 3. Request Additional Tracking ──────────────────────────────────────
    rej_3: List[str] = []
    if not tca_valid:
        rej_3.append("Invalid TCA timestamp.")
    elif tca_passed:
        rej_3.append("TCA has already passed.")
    elif time_to_tca_hours < 2.0:
        rej_3.append("Insufficient lead time (<2h to TCA) to task and process follow-up tracking.")
    if stale_tle:
        rej_3.append(f"Ephemeris age ({max_data_age:.1f}h) exceeds 72h limit; catalog refresh required.")

    ext_score_3, nearby_risk_3, _ = _evaluate_nearby_externality(
        req.altitude_km, 0.0, req.impact_graph.nearby_objects
    )
    feasible_3 = len(rej_3) == 0
    fair_3 = _compute_fairness(0.0, 0.0, 0.0, 0.0, nearby_risk_3)
    risk_red_3 = 40.0 if req.collision_probability > max_risk_limit else 58.0
    c3 = CommonsCandidate(
        id="OPT-3-ADDITIONAL-TRACKING",
        action_type="ADDITIONAL_TRACKING",
        title="Request Additional SSN / Optical Tracking Pass",
        target_object=f"{req.primary_object} & {req.secondary_object}",
        feasible=feasible_3,
        risk_reduction_score=risk_red_3 if feasible_3 else 0.0,
        fuel_efficiency_score=100.0 if feasible_3 else 0.0,
        mission_continuity_score=100.0 if feasible_3 else 0.0,
        uncertainty_score=96.0 if feasible_3 else 15.0,
        externality_score=ext_score_3 if feasible_3 else 0.0,
        fairness_score=fair_3 if feasible_3 else 0.0,
        human_review_score=95.0,
        composite_score=0.0,
        cost_bearer="Shared Tracking Coordination (Zero Propellant)",
        beneficiaries=[f"Operator A ({req.primary_object})", f"Operator B ({req.secondary_object})"],
        burden_distribution=BurdenDistribution(
            operator_a_fuel_kg=0.0,
            operator_b_fuel_kg=0.0,
            operator_a_downtime_minutes=0.0,
            operator_b_downtime_minutes=0.0,
            operator_a_risk_benefit_pct=35.0,
            operator_b_risk_benefit_pct=35.0,
            fairness_summary="Equal procedural tracking cost; zero propellant or mission interruption on either operator.",
        ),
        physics=CandidatePhysicsMetrics(
            delta_v_a_m_s=0.0,
            delta_v_b_m_s=0.0,
            total_delta_v_m_s=0.0,
            fuel_a_kg=0.0,
            fuel_b_kg=0.0,
            total_fuel_kg=0.0,
            expected_miss_km=round(req.miss_distance_km, 2),
            post_action_probability=req.collision_probability,
            downtime_a_pct=0.0,
            downtime_b_pct=0.0,
            nearby_max_risk=nearby_risk_3,
        ),
        trade_off_summary="Zero propellant and zero payload interruption; shrinks covariance ellipsoid before maneuver commitment.",
        rejected_reasons=rej_3,
        evidence_refs=["covariance-collapse-tasking", "zero-delta-v-baseline"],
    )
    c3.composite_score = _weighted_composite(c3)
    candidates.append(c3)

    # ── 4. Hold and Re-screen ───────────────────────────────────────────────
    rej_4 = list(common_stale_or_missing_reasons)
    if tca_valid and not tca_passed and time_to_tca_hours < 18.0:
        rej_4.append("TCA is under 18h; holding without mitigation narrows avoidance execution margin.")
    if req.collision_probability > max_risk_limit:
        rej_4.append(
            f"Passive hold leaves collision probability ({req.collision_probability:.2e}) above operator safety threshold ({max_risk_limit:.2e})."
        )

    feasible_4 = len(rej_4) == 0
    fair_4 = _compute_fairness(0.0, 0.0, 0.0, 0.0, nearby_risk_3)
    c4 = CommonsCandidate(
        id="OPT-4-HOLD-RESCREEN",
        action_type="HOLD_AND_RESCREEN",
        title="Hold Maneuver & Re-screen at Next Ephemeris Update",
        target_object="CONJUNCTION_PAIR",
        feasible=feasible_4,
        risk_reduction_score=22.0 if feasible_4 else 0.0,
        fuel_efficiency_score=100.0 if feasible_4 else 0.0,
        mission_continuity_score=100.0 if feasible_4 else 0.0,
        uncertainty_score=base_uncertainty_score * 0.85,
        externality_score=ext_score_3 if feasible_4 else 0.0,
        fairness_score=fair_4 if feasible_4 else 0.0,
        human_review_score=75.0,
        composite_score=0.0,
        cost_bearer="None (Passive Screening)",
        beneficiaries=[f"Operator A ({req.primary_object})", f"Operator B ({req.secondary_object})"],
        burden_distribution=BurdenDistribution(
            operator_a_fuel_kg=0.0,
            operator_b_fuel_kg=0.0,
            operator_a_downtime_minutes=0.0,
            operator_b_downtime_minutes=0.0,
            operator_a_risk_benefit_pct=0.0,
            operator_b_risk_benefit_pct=0.0,
            fairness_summary="No maneuver executed; acceptable only when Pc stays below safety threshold and TCA >= 18h.",
        ),
        physics=CandidatePhysicsMetrics(
            delta_v_a_m_s=0.0,
            delta_v_b_m_s=0.0,
            total_delta_v_m_s=0.0,
            fuel_a_kg=0.0,
            fuel_b_kg=0.0,
            total_fuel_kg=0.0,
            expected_miss_km=round(req.miss_distance_km, 2),
            post_action_probability=req.collision_probability,
            downtime_a_pct=0.0,
            downtime_b_pct=0.0,
            nearby_max_risk=nearby_risk_3,
        ),
        trade_off_summary="Conserves propellant and avoids interruption while awaiting next batch ephemeris.",
        rejected_reasons=rej_4,
        evidence_refs=["batch-rescreen-policy"],
    )
    c4.composite_score = _weighted_composite(c4)
    candidates.append(c4)

    # ── 5. Coordinate a Shared / Split Maneuver ─────────────────────────────
    rej_5 = list(common_stale_or_missing_reasons)
    if not (req.operator_a.maneuverable and req.operator_b.maneuverable):
        rej_5.append("Shared split maneuver requires both primary and secondary objects to be maneuverable.")
    else:
        if dv_split_a > req.operator_a.available_delta_v_m_s:
            rej_5.append("Split share exceeds Operator A available delta-v.")
        if dv_split_b > req.operator_b.available_delta_v_m_s:
            rej_5.append("Split share exceeds Operator B available delta-v.")
        downtime_5a = 3.0
        downtime_5b = 2.5
        if (100.0 - downtime_5a) < req.operator_a.minimum_service_availability_percent:
            rej_5.append("Split burn availability drops below Operator A minimum.")
        if (100.0 - downtime_5b) < req.operator_b.minimum_service_availability_percent:
            rej_5.append("Split burn availability drops below Operator B minimum.")
        # Split maneuver coordinates phased timing across operators (-8 km / +8 km counter-phasing)
        bo_5a = _burn_violates_blackout(req.operator_a.blackout_windows, burn_lead_h + 2.0, tca_dt, ref_dt)
        bo_5b = _burn_violates_blackout(req.operator_b.blackout_windows, burn_lead_h, tca_dt, ref_dt)
        if bo_5a:
            rej_5.append(bo_5a)
        if bo_5b:
            rej_5.append(bo_5b)

    ext_score_5, nearby_risk_5, ext_note_5 = _evaluate_nearby_externality(
        req.altitude_km, 6.0, req.impact_graph.nearby_objects
    )
    post_prob_5 = round(max(1e-6, req.collision_probability * 0.015), 6)
    if req.operator_a.maneuverable and req.operator_b.maneuverable:
        if post_prob_5 > max_risk_limit or nearby_risk_5 > max_risk_limit:
            rej_5.append("Residual or induced nearby risk exceeds configured safety limit.")

    feasible_5 = len(rej_5) == 0
    fair_5 = _compute_fairness(dv_split_a, dv_split_b, 3.0, 2.5, nearby_risk_5) if req.operator_b.maneuverable else 0.0
    total_fuel_5 = round(fuel_split_a + fuel_split_b, 4)
    fuel_eff_5 = _clamp(96.0 - (total_fuel_5 * 140.0) - ((dv_split_a + dv_split_b) * 14.0), 15.0, 97.0)
    cont_5 = _clamp(100.0 - (3.0 + 2.5) * 4.0, 20.0, 96.0)
    c5 = CommonsCandidate(
        id="OPT-5-COORDINATED-SPLIT",
        action_type="COORDINATED_SPLIT_MANEUVER",
        title="Coordinate Shared Split Avoidance Maneuver (Op A + Op B)",
        target_object=f"{req.primary_object} & {req.secondary_object}",
        feasible=feasible_5,
        risk_reduction_score=96.0 if feasible_5 else 0.0,
        fuel_efficiency_score=fuel_eff_5 if feasible_5 else 0.0,
        mission_continuity_score=cont_5 if feasible_5 else 0.0,
        uncertainty_score=base_uncertainty_score,
        externality_score=ext_score_5 if feasible_5 else 0.0,
        fairness_score=fair_5 if feasible_5 else 0.0,
        human_review_score=90.0,
        composite_score=0.0,
        cost_bearer="Shared (Operator A & Operator B)",
        beneficiaries=[f"Operator A ({req.primary_object})", f"Operator B ({req.secondary_object})"],
        burden_distribution=BurdenDistribution(
            operator_a_fuel_kg=fuel_split_a if feasible_5 else 0.0,
            operator_b_fuel_kg=fuel_split_b if feasible_5 else 0.0,
            operator_a_downtime_minutes=13.5 if feasible_5 else 0.0,
            operator_b_downtime_minutes=11.3 if feasible_5 else 0.0,
            operator_a_risk_benefit_pct=98.5 if feasible_5 else 0.0,
            operator_b_risk_benefit_pct=98.5 if feasible_5 else 0.0,
            fairness_summary=(
                "Balanced mutual phasing splits propellant and operational interruption symmetrically across both operators."
                if feasible_5
                else "Infeasible under current maneuverability or constraint bounds."
            ),
        ),
        physics=CandidatePhysicsMetrics(
            delta_v_a_m_s=dv_split_a if feasible_5 else 0.0,
            delta_v_b_m_s=dv_split_b if feasible_5 else 0.0,
            total_delta_v_m_s=round(dv_split_a + dv_split_b, 4) if feasible_5 else 0.0,
            fuel_a_kg=fuel_split_a if feasible_5 else 0.0,
            fuel_b_kg=fuel_split_b if feasible_5 else 0.0,
            total_fuel_kg=total_fuel_5 if feasible_5 else 0.0,
            expected_miss_km=round(req.miss_distance_km + target_miss * 1.15, 2) if feasible_5 else round(req.miss_distance_km, 2),
            post_action_probability=post_prob_5 if feasible_5 else req.collision_probability,
            downtime_a_pct=3.0 if feasible_5 else 0.0,
            downtime_b_pct=2.5 if feasible_5 else 0.0,
            nearby_max_risk=nearby_risk_5,
        ),
        trade_off_summary=f"Coordinated counter-phasing across both spacecraft. {ext_note_5}",
        rejected_reasons=rej_5,
        evidence_refs=["mutual-phasing-split", "fair-burden-model", "impact-graph-corridor"],
    )
    c5.composite_score = _weighted_composite(c5)
    candidates.append(c5)

    # ── 6. Escalate to Human Safety Lead ────────────────────────────────────
    rej_6: List[str] = []
    if stale_tle or not tca_valid or tca_passed or not has_sigma or unc.covariance_available is False:
        # Escalation remains feasible as governance fallback even when physics maneuver fails!
        pass
    c6 = CommonsCandidate(
        id="OPT-6-ESCALATE-SAFETY-LEAD",
        action_type="ESCALATE_HUMAN_SAFETY_LEAD",
        title="Escalate to Coalition Flight Director & Human Safety Lead",
        target_object="HUMAN_SAFETY_BOARD",
        feasible=True,
        risk_reduction_score=48.0,
        fuel_efficiency_score=78.0,
        mission_continuity_score=74.0,
        uncertainty_score=base_uncertainty_score,
        externality_score=ext_score_3,
        fairness_score=80.0,
        human_review_score=100.0,
        composite_score=0.0,
        cost_bearer="Shared Governance / Safety Board",
        beneficiaries=[f"Operator A ({req.primary_object})", f"Operator B ({req.secondary_object})"],
        burden_distribution=BurdenDistribution(
            operator_a_fuel_kg=0.0,
            operator_b_fuel_kg=0.0,
            operator_a_downtime_minutes=0.0,
            operator_b_downtime_minutes=0.0,
            operator_a_risk_benefit_pct=50.0,
            operator_b_risk_benefit_pct=50.0,
            fairness_summary="Places human safety arbitration ahead of automated scoring when constraints conflict.",
        ),
        physics=CandidatePhysicsMetrics(
            delta_v_a_m_s=0.0,
            delta_v_b_m_s=0.0,
            total_delta_v_m_s=0.0,
            fuel_a_kg=0.0,
            fuel_b_kg=0.0,
            total_fuel_kg=0.0,
            expected_miss_km=round(req.miss_distance_km, 2),
            post_action_probability=req.collision_probability,
            downtime_a_pct=0.0,
            downtime_b_pct=0.0,
            nearby_max_risk=nearby_risk_3,
        ),
        trade_off_summary="Routes full trade-off matrix to designated human flight safety directors; zero autonomous command.",
        rejected_reasons=rej_6,
        evidence_refs=["two-person-governance-rule"],
    )
    c6.composite_score = _weighted_composite(c6)
    candidates.append(c6)

    # ── 7. Insufficient Data ────────────────────────────────────────────────
    c7 = CommonsCandidate(
        id="OPT-7-INSUFFICIENT-DATA",
        action_type="INSUFFICIENT_DATA",
        title="Flag Event as INSUFFICIENT_DATA Pending Verified Ephemeris",
        target_object="DATA_PROVENANCE_GATE",
        feasible=True,
        risk_reduction_score=15.0 if not insufficient_data else 85.0,
        fuel_efficiency_score=100.0,
        mission_continuity_score=100.0,
        uncertainty_score=10.0 if not insufficient_data else 95.0,
        externality_score=ext_score_3,
        fairness_score=80.0,
        human_review_score=95.0,
        composite_score=0.0,
        cost_bearer="Data Provenance & Tracking Team",
        beneficiaries=[f"Operator A ({req.primary_object})", f"Operator B ({req.secondary_object})"],
        burden_distribution=BurdenDistribution(
            operator_a_fuel_kg=0.0,
            operator_b_fuel_kg=0.0,
            operator_a_downtime_minutes=0.0,
            operator_b_downtime_minutes=0.0,
            operator_a_risk_benefit_pct=0.0,
            operator_b_risk_benefit_pct=0.0,
            fairness_summary="Halts maneuver selection until stale TLE, invalid TCA, or missing covariance inputs are resolved.",
        ),
        physics=CandidatePhysicsMetrics(
            delta_v_a_m_s=0.0,
            delta_v_b_m_s=0.0,
            total_delta_v_m_s=0.0,
            fuel_a_kg=0.0,
            fuel_b_kg=0.0,
            total_fuel_kg=0.0,
            expected_miss_km=round(req.miss_distance_km, 2),
            post_action_probability=req.collision_probability,
            downtime_a_pct=0.0,
            downtime_b_pct=0.0,
            nearby_max_risk=nearby_risk_3,
        ),
        trade_off_summary="Fail-safe gate preventing maneuver planning on stale, missing, or unverified orbital inputs.",
        rejected_reasons=[] if insufficient_data else ["Inputs are valid and fresh; only selected if higher-confidence options fail."],
        evidence_refs=["fail-closed-provenance-gate"],
    )
    c7.composite_score = _weighted_composite(c7)
    candidates.append(c7)

    # ── Pareto Frontier & Selection ─────────────────────────────────────────
    pareto_ids = _compute_pareto_frontier(candidates)

    if insufficient_data:
        status = "INSUFFICIENT_DATA"
        recommended = c7
        op_rec = (
            "INSUFFICIENT_DATA: " + " ".join(missing_inputs) + f" {DISCLAIMER_TEXT}"
        )
    else:
        status = "EVALUATED"
        # Pick highest-scoring feasible candidate excluding passive insufficient-data gate
        active_feasible = [c for c in candidates if c.feasible and c.id != "OPT-7-INSUFFICIENT-DATA"]
        recommended = max(active_feasible, key=lambda x: x.composite_score) if active_feasible else c6
        op_rec = (
            f"Under policy {req.policy.value}, '{recommended.title}' leads with composite score "
            f"{recommended.composite_score:.1f}/100 ({recommended.cost_bearer}). {DISCLAIMER_TEXT}"
        )

    for c in candidates:
        c.recommended = c.id == recommended.id

    feasible_non_gate = [c for c in candidates if c.feasible and c.id != "OPT-7-INSUFFICIENT-DATA"] or [c for c in candidates if c.feasible]
    highlights = PolicyHighlights(
        safest_feasible_id=max(feasible_non_gate, key=lambda c: c.risk_reduction_score).id if feasible_non_gate else recommended.id,
        lowest_fuel_id=max(feasible_non_gate, key=lambda c: c.fuel_efficiency_score).id if feasible_non_gate else recommended.id,
        lowest_disruption_id=max(feasible_non_gate, key=lambda c: c.mission_continuity_score).id if feasible_non_gate else recommended.id,
        fairest_id=max(feasible_non_gate, key=lambda c: c.fairness_score).id if feasible_non_gate else recommended.id,
        lowest_externality_id=max(feasible_non_gate, key=lambda c: c.externality_score).id if feasible_non_gate else recommended.id,
        recommended_id=recommended.id,
    )

    # ── Counterfactual ("What happens if no action is taken?") ───────────────
    nearby_cnt = len(req.impact_graph.nearby_objects)
    max_nb_prob = max((n.collision_probability for n in req.impact_graph.nearby_objects), default=0.0)
    at_risk_nb = sum(1 for n in req.impact_graph.nearby_objects if n.collision_probability >= 0.001 or n.distance_km <= 5.0)
    counterfactual = CounterfactualSummary(
        current_collision_probability=req.collision_probability,
        expected_miss_distance_km=round(req.miss_distance_km, 3),
        expected_nearby_object_impact=(
            f"{nearby_cnt} corridor objects monitored ({at_risk_nb} within 5 km / elevated Pc; max baseline Pc {max_nb_prob:.2e}). "
            f"A secondary fragment breakup would place adjacent objects at immediate cascading risk."
            if nearby_cnt > 0
            else "No cataloged nearby corridor objects provided in impact graph."
        ),
        nearby_at_risk_count=at_risk_nb,
        max_nearby_collision_probability=max_nb_prob,
        remaining_time_to_tca_hours=time_to_tca_hours,
        additional_tracking_recommended=bool(max_data_age > 12.0 or req.collision_probability >= 0.001 or not has_sigma),
        summary=(
            f"If no action is taken, baseline conjunction risk remains {req.collision_probability:.2e} at miss "
            f"{req.miss_distance_km:.2f} km with T-{time_to_tca_hours:.1f}h remaining."
        ),
    )

    # ── Privacy-Masked Operator Summaries ───────────────────────────────────
    auth_a = req.viewer_operator_id == req.operator_a.operator_id
    auth_b = req.viewer_operator_id == req.operator_b.operator_id
    op_summaries = [
        _build_safe_operator_summary("Operator A", req.operator_a, authorized_view=auth_a),
        _build_safe_operator_summary("Operator B", req.operator_b, authorized_view=auth_b),
    ]

    fairness_explanation = (
        f"Recommended option '{recommended.title}' assigns cost bearer as '{recommended.cost_bearer}' "
        f"({recommended.burden_distribution.fairness_summary}) while benefiting {', '.join(recommended.beneficiaries)}."
    )
    privacy_explanation = (
        "Prototype privacy boundary: private operator delta-v reserves, mission availability thresholds, "
        "and blackout windows are evaluated server-side and masked in cross-operator summaries. "
        "Note: this is a server-enforced prototype privacy boundary, not cryptographic federated learning or MPC."
    )

    assumptions = [
        "Circular Vis-Viva orbital velocity approximation used for comparative phasing delta-v sizing.",
        "Specific impulse derived deterministically from declared propulsion type.",
        "Operator-grade CDM covariance refinement required prior to operational burn planning.",
        f"Ephemeris data age evaluated against {MAX_TLE_AGE_HOURS:.0f}h staleness ceiling.",
    ]
    uncertainties = [
        f"Primary ephemeris/TLE age: {req.tle_age_hours:.1f}h; impact graph age: {req.impact_graph.data_age_hours:.1f}h.",
        (
            f"Covariance 1-sigma summary: pos={unc.position_sigma_km} km, radial={unc.radial_sigma_m} m, "
            f"along-track={unc.along_track_sigma_m} m."
            if has_sigma
            else "Missing quantitative covariance sigma values; decision gated as INSUFFICIENT_DATA."
        ),
        f"Corridor congestion index: {req.impact_graph.orbital_corridor.congestion_index:.2f} ({req.impact_graph.orbital_corridor.regime}).",
    ]

    generated_at_utc = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Build canonical deterministic payload for cryptographic SHA-256 hash
    # Excludes volatile wall-clock generated_at_utc so identical requests yield identical SHA-256 digests.
    canonical_digest_body = {
        "event_id": req.event_id,
        "engine_version": ENGINE_VERSION,
        "selected_policy": req.policy.value,
        "scoring_weights": weights,
        "input_snapshot": {
            "primary_object": req.primary_object,
            "secondary_object": req.secondary_object,
            "altitude_km": req.altitude_km,
            "miss_distance_km": req.miss_distance_km,
            "collision_probability": req.collision_probability,
            "tca": req.tca,
            "tle_age_hours": req.tle_age_hours,
            "data_mode": req.data_mode,
        },
        "operator_constraint_summary": [
            {
                "operator_label": s.operator_label,
                "object_id": s.object_id,
                "maneuverable": s.maneuverable,
                "propulsion_type": s.propulsion_type,
                "privacy_protected": s.privacy_protected,
                "capability_summary": s.capability_summary,
            }
            for s in op_summaries
        ],
        "impact_graph": req.impact_graph.model_dump(),
        "candidate_results": [c.model_dump() for c in candidates],
        "pareto_frontier": pareto_ids,
        "recommendation": recommended.id,
        "assumptions": assumptions,
        "uncertainties": uncertainties,
        "missing_inputs": missing_inputs,
    }
    audit_hash_sha256 = compute_canonical_sha256(canonical_digest_body)

    evidence_packet = {
        **canonical_digest_body,
        "hash_algorithm": "SHA-256",
        "hash_scope": "canonical_deterministic_evidence",
        "audit_hash_sha256": audit_hash_sha256,
        "generated_at_utc": generated_at_utc,
        "disclaimer": DISCLAIMER_TEXT,
    }

    review_state = ApprovalState(
        status=ReviewStatus.INSUFFICIENT_DATA if insufficient_data else ReviewStatus.PENDING_REVIEW,
        selected_candidate_id=recommended.id,
    )

    preliminary_result = CommonsResult(
        event_id=req.event_id,
        primary_object=req.primary_object,
        secondary_object=req.secondary_object,
        status=status,
        selected_policy=req.policy.value,
        policy_weights=weights,
        recommended_candidate_id=recommended.id,
        operational_recommendation=op_rec,
        candidates=candidates,
        pareto_frontier=pareto_ids,
        highlights=highlights,
        counterfactual=counterfactual,
        operator_constraint_summaries=op_summaries,
        fairness_explanation=fairness_explanation,
        privacy_explanation=privacy_explanation,
        provenance_summary=f"Source: {req.data_mode.upper()} multi-operator screening | Mode: {req.data_mode} | Engine: {ENGINE_VERSION}",
        data_mode=req.data_mode,
        tca_utc=req.tca,
        time_to_tca_hours=time_to_tca_hours,
        tle_age_hours=req.tle_age_hours,
        collision_probability=req.collision_probability,
        miss_distance_km=req.miss_distance_km,
        assumptions=assumptions,
        uncertainties=uncertainties,
        missing_inputs=missing_inputs,
        evidence_packet=evidence_packet,
        audit_hash_sha256=audit_hash_sha256,
        review_state=review_state,
        generated_at_utc=generated_at_utc,
        disclaimer=DISCLAIMER_TEXT,
    )
    preliminary_result.explanation = generate_deterministic_commons_explanation(preliminary_result)
    return preliminary_result


# ── Seeded Demonstration Scenario & Backend Store ──────────────────────────


def build_default_demo_commons_request(reference_time_utc: Optional[str] = None) -> CommonsRequest:
    """
    Deterministic demonstration scenario per Step 11:
    - Operator A owns a high-value imaging satellite with limited propellant / strict imaging continuity
    - Operator B owns a maneuverable communications satellite with Hall-thruster propulsion
    - Debris fragment DEBRIS-4421 occupies nearby prograde corridor creating externality pressure
    """
    ref = _parse_utc(reference_time_utc) if reference_time_utc else datetime.now(timezone.utc).replace(second=0, microsecond=0)
    tca_str = (ref.replace(microsecond=0).isoformat()).replace("+00:00", "Z")
    # Default TCA 12 hours ahead of reference epoch
    from datetime import timedelta

    tca_dt = ref + timedelta(hours=12)
    tca_str = tca_dt.isoformat().replace("+00:00", "Z")

    return CommonsRequest(
        event_id="OC-DEMO-001",
        primary_object="EARTHOBS-IMG-01",
        secondary_object="COMMSAT-STAR-24",
        altitude_km=560.0,
        miss_distance_km=0.28,
        collision_probability=0.042,
        tca=tca_str,
        tle_age_hours=6.5,
        reference_time_utc=ref.isoformat().replace("+00:00", "Z"),
        data_mode="simulated",
        operator_a=OperatorConstraint(
            operator_id="op_imaging_alpha",
            object_id="EARTHOBS-IMG-01",
            available_delta_v_m_s=2.8,
            minimum_service_availability_percent=91.0,
            maneuverable=True,
            propulsion_type="HYDRAZINE",
            blackout_windows=[],
            minimum_miss_distance_km=35.0,
            maximum_allowed_risk=0.01,
            preferred_action="COORDINATED_SPLIT_MANEUVER",
            private=True,
            prior_maneuver_count=2,
        ),
        operator_b=OperatorConstraint(
            operator_id="op_comms_beta",
            object_id="COMMSAT-STAR-24",
            available_delta_v_m_s=6.5,
            minimum_service_availability_percent=94.0,
            maneuverable=True,
            propulsion_type="HALL_ELECTRIC",
            blackout_windows=[],
            minimum_miss_distance_km=30.0,
            maximum_allowed_risk=0.01,
            preferred_action="MANEUVER_SECONDARY",
            private=True,
            prior_maneuver_count=0,
        ),
        impact_graph=ImpactGraph(
            event_id="OC-DEMO-001",
            primary_object="EARTHOBS-IMG-01",
            secondary_object="COMMSAT-STAR-24",
            nearby_objects=[
                NearbyObject(
                    object_id="DEB-4421",
                    object_name="COSMOS-DEB-4421",
                    altitude_km=586.0,
                    distance_km=2.4,
                    collision_probability=0.0052,
                    maneuverable=False,
                ),
                NearbyObject(
                    object_id="MET-09",
                    object_name="NOAA-WEATHER-09",
                    altitude_km=544.0,
                    distance_km=6.8,
                    collision_probability=0.0012,
                    maneuverable=True,
                ),
            ],
            orbital_corridor=OrbitalCorridor(regime="LEO", altitude_band_km=[520.0, 610.0], congestion_index=0.78),
            data_age_hours=6.5,
            uncertainty_summary=UncertaintySummary(
                covariance_available=True,
                position_sigma_km=0.18,
                radial_sigma_m=22.0,
                along_track_sigma_m=95.0,
                cross_track_sigma_m=30.0,
                source="Simulated 18 SDS CDM Baseline",
            ),
            externality_summary=ExternalitySummary(
                corridor_risk_level="ELEVATED",
                nearby_object_count=2,
                notes="Simulated upper corridor debris fragment COSMOS-DEB-4421 limits safe prograde boost.",
            ),
        ),
        policy=PolicyMode.FAIR_BURDEN_SHARING,
    )


class OrbitalCommonsStore:
    """Thread-safe backend store holding raw constraints privately and governing human approvals."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._requests: Dict[str, CommonsRequest] = {}
        self._results: Dict[str, CommonsResult] = {}
        self._seed_demo()

    def _seed_demo(self) -> None:
        demo_req = build_default_demo_commons_request()
        demo_res = evaluate_orbital_commons(demo_req)
        self._requests[demo_req.event_id] = demo_req
        self._results[demo_req.event_id] = demo_res

    def reset(self) -> None:
        with self._lock:
            self._requests.clear()
            self._results.clear()
            self._seed_demo()

    def save_evaluation(self, req: CommonsRequest, res: CommonsResult) -> CommonsResult:
        with self._lock:
            # Preserve existing approval history only if evidence hash matches identical evaluation
            prev = self._results.get(req.event_id)
            if prev and prev.audit_hash_sha256 == res.audit_hash_sha256:
                res.review_state = prev.review_state.model_copy(deep=True)
            self._requests[req.event_id] = req.model_copy(deep=True)
            self._results[req.event_id] = res.model_copy(deep=True)
            return res

    def get_result(
        self,
        event_id: str,
        viewer_operator_id: Optional[str] = None,
    ) -> Optional[CommonsResult]:
        with self._lock:
            stored_req = self._requests.get(event_id)
            stored_res = self._results.get(event_id)
            if not stored_req or not stored_res:
                return None

            if viewer_operator_id is not None and viewer_operator_id != stored_req.viewer_operator_id:
                updated_req = stored_req.model_copy(update={"viewer_operator_id": viewer_operator_id})
                recomputed = evaluate_orbital_commons(updated_req)
                recomputed.review_state = stored_res.review_state.model_copy(deep=True)
                return recomputed
            return stored_res.model_copy(deep=True)

    def submit_approval(
        self,
        event_id: str,
        candidate_id: str,
        reviewer_id: str,
        reviewer_role: str,
        notes: str,
        safety_acknowledged: bool,
    ) -> CommonsResult:
        if not safety_acknowledged:
            raise ValueError("Human reviewer must acknowledge that Orbital Commons AI is decision support only.")

        with self._lock:
            res = self._results.get(event_id)
            if not res:
                raise KeyError(f"Orbital Commons event '{event_id}' not found.")

            if res.status == "INSUFFICIENT_DATA":
                raise ValueError("Cannot approve recommendation when event status is INSUFFICIENT_DATA.")

            target_cand = next((c for c in res.candidates if c.id == candidate_id), None)
            if not target_cand:
                raise ValueError(f"Candidate '{candidate_id}' not found on event '{event_id}'.")
            if not target_cand.feasible:
                raise ValueError(f"Cannot approve rejected/infeasible candidate '{candidate_id}'.")

            rs = res.review_state
            if rs.status == ReviewStatus.REJECTED:
                raise ValueError("Cannot approve a rejected event without re-evaluation.")
            if rs.status == ReviewStatus.SECOND_REVIEW_COMPLETE:
                raise ValueError("Two-person review is already complete for this event.")

            now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            rec = ReviewerRecord(
                reviewer_id=reviewer_id,
                reviewer_role=reviewer_role,
                candidate_id=candidate_id,
                notes=notes,
                reviewed_at_utc=now_iso,
                safety_acknowledged=True,
            )

            if rs.status == ReviewStatus.PENDING_REVIEW:
                rs.status = ReviewStatus.FIRST_REVIEW_COMPLETE
                rs.selected_candidate_id = candidate_id
                rs.first_reviewer = rec
            elif rs.status == ReviewStatus.FIRST_REVIEW_COMPLETE:
                if rs.first_reviewer and rs.first_reviewer.reviewer_id.lower() == reviewer_id.lower():
                    raise PermissionError(
                        "Two-person rule violation: second reviewer must be distinct from the first reviewer."
                    )
                if rs.selected_candidate_id and rs.selected_candidate_id != candidate_id:
                    raise ValueError(
                        f"Second reviewer must confirm selected candidate '{rs.selected_candidate_id}'."
                    )
                rs.status = ReviewStatus.SECOND_REVIEW_COMPLETE
                rs.selected_candidate_id = candidate_id
                rs.second_reviewer = rec

            # Enforce invariant: never execute commands
            rs.command_executed = False
            rs.command_status_note = "Human review recorded. No spacecraft command executed. Decision support only — human approval required."
            return res.model_copy(deep=True)

    def submit_rejection(
        self,
        event_id: str,
        reviewer_id: str,
        reason: str,
        action: str = "reject",
    ) -> CommonsResult:
        with self._lock:
            res = self._results.get(event_id)
            if not res:
                raise KeyError(f"Orbital Commons event '{event_id}' not found.")

            now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            rs = res.review_state
            if action == "clarification":
                rs.clarifications.append(
                    ClarificationRecord(
                        requested_by=reviewer_id,
                        message=reason,
                        requested_at_utc=now_iso,
                    )
                )
            else:
                rs.status = ReviewStatus.REJECTED
                rs.rejected_by = reviewer_id
                rs.rejection_reason = reason
            rs.command_executed = False
            return res.model_copy(deep=True)


orbital_commons_store = OrbitalCommonsStore()
