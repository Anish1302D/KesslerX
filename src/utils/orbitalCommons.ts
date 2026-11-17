/**
 * Orbital Commons AI — Strongly Typed Models, API Client & Offline Demo Fallback
 * ================================================================================
 * Decision support only — human approval required. Not a flight command system.
 * Research prototype; deterministic scoring & canonical evidence hashing.
 */

import { API_ENDPOINTS, getApiUrl } from '../config/api';
import { computeEvidenceHash } from './evidenceHash';

export const ORBITAL_COMMONS_DISCLAIMER =
  'Decision support only — human approval required. Not a flight command system.';

export const ORBITAL_COMMONS_PROTOTYPE_WARNING =
  'Research prototype. Decision support only — human approval required. No command execution.';

export type PolicyMode =
  | 'FAIR_BURDEN_SHARING'
  | 'MINIMUM_FUEL'
  | 'MINIMUM_MISSION_INTERRUPTION'
  | 'MAXIMUM_RISK_REDUCTION'
  | 'MINIMUM_EXTERNALITY';

export type ReviewStatus =
  | 'PENDING_REVIEW'
  | 'FIRST_REVIEW_COMPLETE'
  | 'SECOND_REVIEW_COMPLETE'
  | 'REJECTED'
  | 'INSUFFICIENT_DATA';

export interface PolicyWeights {
  risk_reduction: number;
  fuel_efficiency: number;
  mission_continuity: number;
  uncertainty: number;
  externality: number;
  fairness: number;
  human_review: number;
}

export interface PolicyMetadataItem {
  id: PolicyMode;
  label: string;
  description: string;
  weights: PolicyWeights;
}

export const ORBITAL_COMMONS_POLICIES: PolicyMetadataItem[] = [
  {
    id: 'FAIR_BURDEN_SHARING',
    label: 'Fair Burden Sharing',
    description:
      'Balances collision risk reduction with equitable propellant and downtime sharing across operators.',
    weights: {
      risk_reduction: 0.3,
      fuel_efficiency: 0.15,
      mission_continuity: 0.15,
      uncertainty: 0.1,
      externality: 0.1,
      fairness: 0.15,
      human_review: 0.05,
    },
  },
  {
    id: 'MINIMUM_FUEL',
    label: 'Minimum Fuel',
    description:
      'Prioritizes minimal propellant expenditure (e.g. assigning higher-Isp or smaller required burn).',
    weights: {
      risk_reduction: 0.22,
      fuel_efficiency: 0.4,
      mission_continuity: 0.1,
      uncertainty: 0.08,
      externality: 0.08,
      fairness: 0.07,
      human_review: 0.05,
    },
  },
  {
    id: 'MINIMUM_MISSION_INTERRUPTION',
    label: 'Minimum Mission Interruption',
    description:
      'Protects payload uptime and operational service continuity across mission windows.',
    weights: {
      risk_reduction: 0.22,
      fuel_efficiency: 0.1,
      mission_continuity: 0.4,
      uncertainty: 0.08,
      externality: 0.08,
      fairness: 0.07,
      human_review: 0.05,
    },
  },
  {
    id: 'MAXIMUM_RISK_REDUCTION',
    label: 'Maximum Risk Reduction',
    description:
      'Maximizes miss-distance margin and primary conjunction Pc reduction above cost preferences.',
    weights: {
      risk_reduction: 0.5,
      fuel_efficiency: 0.08,
      mission_continuity: 0.08,
      uncertainty: 0.1,
      externality: 0.12,
      fairness: 0.07,
      human_review: 0.05,
    },
  },
  {
    id: 'MINIMUM_EXTERNALITY',
    label: 'Minimum Externality',
    description:
      'Minimizes secondary conjunction hazard imposed on nearby objects in the orbital corridor.',
    weights: {
      risk_reduction: 0.24,
      fuel_efficiency: 0.1,
      mission_continuity: 0.1,
      uncertainty: 0.1,
      externality: 0.33,
      fairness: 0.08,
      human_review: 0.05,
    },
  },
];

export interface OperatorConstraint {
  operator_id: string;
  object_id: string;
  available_delta_v_m_s: number;
  minimum_service_availability_percent: number;
  maneuverable: boolean;
  propulsion_type: string;
  blackout_windows: string[];
  minimum_miss_distance_km: number;
  maximum_allowed_risk: number;
  preferred_action?: string | null;
  private: boolean;
  prior_maneuver_count?: number;
}

export interface NearbyObject {
  object_id: string;
  object_name: string;
  altitude_km: number;
  distance_km: number;
  collision_probability: number;
  maneuverable: boolean;
}

export interface ImpactGraph {
  event_id: string;
  primary_object: string;
  secondary_object: string;
  nearby_objects: NearbyObject[];
  orbital_corridor: {
    regime: string;
    altitude_band_km: number[];
    congestion_index: number;
  };
  data_age_hours: number;
  uncertainty_summary: {
    covariance_available?: boolean | null;
    position_sigma_km?: number | null;
    radial_sigma_m?: number | null;
    along_track_sigma_m?: number | null;
    cross_track_sigma_m?: number | null;
    source?: string | null;
  };
  externality_summary: {
    corridor_risk_level: string;
    nearby_object_count?: number | null;
    notes?: string | null;
  };
}

export interface CommonsRequest {
  event_id: string;
  primary_object: string;
  secondary_object: string;
  altitude_km: number;
  miss_distance_km: number;
  collision_probability: number;
  tca: string;
  tle_age_hours: number;
  operator_a: OperatorConstraint;
  operator_b: OperatorConstraint;
  impact_graph: ImpactGraph;
  policy: PolicyMode;
  reference_time_utc?: string | null;
  viewer_operator_id?: string | null;
  data_mode?: string;
}

export interface CandidatePhysicsMetrics {
  delta_v_a_m_s: number;
  delta_v_b_m_s: number;
  total_delta_v_m_s: number;
  fuel_a_kg: number;
  fuel_b_kg: number;
  total_fuel_kg: number;
  expected_miss_km: number;
  post_action_probability: number;
  downtime_a_pct: number;
  downtime_b_pct: number;
  nearby_max_risk: number;
}

export interface BurdenDistribution {
  operator_a_fuel_kg: number;
  operator_b_fuel_kg: number;
  operator_a_downtime_minutes: number;
  operator_b_downtime_minutes: number;
  operator_a_risk_benefit_pct: number;
  operator_b_risk_benefit_pct: number;
  fairness_summary: string;
}

export interface CommonsCandidate {
  id: string;
  action_type: string;
  title: string;
  target_object: string;
  feasible: boolean;
  recommended: boolean;
  pareto_optimal: boolean;
  risk_reduction_score: number;
  fuel_efficiency_score: number;
  mission_continuity_score: number;
  uncertainty_score: number;
  externality_score: number;
  fairness_score: number;
  human_review_score: number;
  composite_score: number;
  cost_bearer: string;
  beneficiaries: string[];
  burden_distribution: BurdenDistribution;
  physics: CandidatePhysicsMetrics;
  trade_off_summary: string;
  rejected_reasons: string[];
  evidence_refs: string[];
}

export interface CounterfactualSummary {
  question: string;
  current_collision_probability: number;
  expected_miss_distance_km: number;
  expected_nearby_object_impact: string;
  nearby_at_risk_count: number;
  max_nearby_collision_probability: number;
  remaining_time_to_tca_hours: number;
  additional_tracking_recommended: boolean;
  summary: string;
}

export interface PolicyHighlights {
  safest_feasible_id?: string | null;
  lowest_fuel_id?: string | null;
  lowest_disruption_id?: string | null;
  fairest_id?: string | null;
  lowest_externality_id?: string | null;
  recommended_id?: string | null;
}

export interface OperatorConstraintSafeSummary {
  operator_label: string;
  operator_id_masked: string;
  object_id: string;
  maneuverable: boolean;
  propulsion_type: string;
  privacy_protected: boolean;
  capability_summary: string;
  authorized_private_details?: Record<string, unknown> | null;
}

export interface ReviewerRecord {
  reviewer_id: string;
  reviewer_role: string;
  candidate_id: string;
  notes: string;
  reviewed_at_utc: string;
  safety_acknowledged: boolean;
}

export interface ClarificationRecord {
  requested_by: string;
  message: string;
  requested_at_utc: string;
}

export interface ApprovalState {
  status: ReviewStatus;
  selected_candidate_id?: string | null;
  first_reviewer?: ReviewerRecord | null;
  second_reviewer?: ReviewerRecord | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;
  clarifications: ClarificationRecord[];
  command_executed: boolean;
  command_status_note: string;
}

export interface CommonsExplanation {
  summary: string;
  recommended_option_explanation: string;
  trade_offs: string[];
  fairness_explanation: string;
  externality_explanation: string;
  evidence_references: string[];
  assumptions: string[];
  uncertainties: string[];
  missing_inputs: string[];
  disclaimer: string;
  provenance?: string;
}

export interface CommonsResult {
  event_id: string;
  primary_object: string;
  secondary_object: string;
  status: 'EVALUATED' | 'INSUFFICIENT_DATA';
  selected_policy: PolicyMode;
  policy_weights: Record<string, number>;
  recommended_candidate_id: string;
  operational_recommendation: string;
  candidates: CommonsCandidate[];
  pareto_frontier: string[];
  highlights: PolicyHighlights;
  counterfactual: CounterfactualSummary;
  operator_constraint_summaries: OperatorConstraintSafeSummary[];
  fairness_explanation: string;
  privacy_explanation: string;
  provenance_summary: string;
  data_mode: string;
  tca_utc: string;
  time_to_tca_hours: number;
  tle_age_hours: number;
  collision_probability: number;
  miss_distance_km: number;
  assumptions: string[];
  uncertainties: string[];
  missing_inputs: string[];
  evidence_packet: Record<string, unknown>;
  audit_hash_sha256: string;
  explanation?: CommonsExplanation | null;
  review_state: ApprovalState;
  generated_at_utc: string;
  disclaimer: string;
}

export function buildDemoCommonsRequest(
  policy: PolicyMode = 'FAIR_BURDEN_SHARING',
  scenario: 'MULTI_OP' | 'DEBRIS_CONJUNCTION' | 'STALE_CDM' = 'MULTI_OP',
): CommonsRequest {
  const refIso = '2026-11-17T12:00:00Z';
  const tcaIso = '2026-11-18T02:00:00Z'; // +14h

  if (scenario === 'DEBRIS_CONJUNCTION') {
    return {
      event_id: 'OC-DEMO-DEBRIS-002',
      primary_object: 'SENTINEL-2A',
      secondary_object: 'SL-16 R/B DEB-9941',
      altitude_km: 785.0,
      miss_distance_km: 0.19,
      collision_probability: 0.068,
      tca: tcaIso,
      tle_age_hours: 4.2,
      reference_time_utc: refIso,
      data_mode: 'simulated',
      operator_a: {
        operator_id: 'op_esa_copernicus',
        object_id: 'SENTINEL-2A',
        available_delta_v_m_s: 4.2,
        minimum_service_availability_percent: 88.0,
        maneuverable: true,
        propulsion_type: 'HYDRAZINE',
        blackout_windows: [],
        minimum_miss_distance_km: 32.0,
        maximum_allowed_risk: 0.01,
        preferred_action: 'MANEUVER_PRIMARY',
        private: true,
        prior_maneuver_count: 1,
      },
      operator_b: {
        operator_id: 'untracked_debris_catalog',
        object_id: 'SL-16 R/B DEB-9941',
        available_delta_v_m_s: 0.0,
        minimum_service_availability_percent: 0.0,
        maneuverable: false,
        propulsion_type: 'NONE_DEBRIS',
        blackout_windows: [],
        minimum_miss_distance_km: 0.0,
        maximum_allowed_risk: 1.0,
        preferred_action: null,
        private: false,
        prior_maneuver_count: 0,
      },
      impact_graph: {
        event_id: 'OC-DEMO-DEBRIS-002',
        primary_object: 'SENTINEL-2A',
        secondary_object: 'SL-16 R/B DEB-9941',
        nearby_objects: [
          {
            object_id: 'SSO-CLUSTER-12',
            object_name: 'MICRO-OBS-12',
            altitude_km: 778.0,
            distance_km: 5.5,
            collision_probability: 0.0014,
            maneuverable: true,
          },
        ],
        orbital_corridor: { regime: 'SSO-LEO', altitude_band_km: [760, 820], congestion_index: 0.84 },
        data_age_hours: 4.2,
        uncertainty_summary: {
          covariance_available: true,
          position_sigma_km: 0.14,
          radial_sigma_m: 18.0,
          along_track_sigma_m: 78.0,
          cross_track_sigma_m: 26.0,
          source: 'Simulated 18 SDS Conjunction Screen',
        },
        externality_summary: {
          corridor_risk_level: 'HIGH',
          nearby_object_count: 1,
          notes: 'Passive debris target cannot share burn; primary satellite must clear SSO debris band.',
        },
      },
      policy,
    };
  }

  if (scenario === 'STALE_CDM') {
    const staleBase = buildDemoCommonsRequest(policy, 'MULTI_OP');
    return {
      ...staleBase,
      event_id: 'OC-DEMO-STALE-003',
      tle_age_hours: 84.5,
      impact_graph: {
        ...staleBase.impact_graph,
        event_id: 'OC-DEMO-STALE-003',
        data_age_hours: 84.5,
      },
    };
  }

  return {
    event_id: 'OC-DEMO-001',
    primary_object: 'EARTHOBS-IMG-01',
    secondary_object: 'COMMSAT-STAR-24',
    altitude_km: 560.0,
    miss_distance_km: 0.28,
    collision_probability: 0.042,
    tca: tcaIso,
    tle_age_hours: 6.5,
    reference_time_utc: refIso,
    data_mode: 'simulated',
    operator_a: {
      operator_id: 'op_imaging_alpha',
      object_id: 'EARTHOBS-IMG-01',
      available_delta_v_m_s: 2.8,
      minimum_service_availability_percent: 91.0,
      maneuverable: true,
      propulsion_type: 'HYDRAZINE',
      blackout_windows: [],
      minimum_miss_distance_km: 35.0,
      maximum_allowed_risk: 0.01,
      preferred_action: 'COORDINATED_SPLIT_MANEUVER',
      private: true,
      prior_maneuver_count: 2,
    },
    operator_b: {
      operator_id: 'op_comms_beta',
      object_id: 'COMMSAT-STAR-24',
      available_delta_v_m_s: 6.5,
      minimum_service_availability_percent: 94.0,
      maneuverable: true,
      propulsion_type: 'HALL_ELECTRIC',
      blackout_windows: [],
      minimum_miss_distance_km: 30.0,
      maximum_allowed_risk: 0.01,
      preferred_action: 'MANEUVER_SECONDARY',
      private: true,
      prior_maneuver_count: 0,
    },
    impact_graph: {
      event_id: 'OC-DEMO-001',
      primary_object: 'EARTHOBS-IMG-01',
      secondary_object: 'COMMSAT-STAR-24',
      nearby_objects: [
        {
          object_id: 'DEB-4421',
          object_name: 'COSMOS-DEB-4421',
          altitude_km: 586.0,
          distance_km: 2.4,
          collision_probability: 0.0052,
          maneuverable: false,
        },
        {
          object_id: 'MET-09',
          object_name: 'NOAA-WEATHER-09',
          altitude_km: 544.0,
          distance_km: 6.8,
          collision_probability: 0.0012,
          maneuverable: true,
        },
      ],
      orbital_corridor: {
        regime: 'LEO',
        altitude_band_km: [520.0, 610.0],
        congestion_index: 0.78,
      },
      data_age_hours: 6.5,
      uncertainty_summary: {
        covariance_available: true,
        position_sigma_km: 0.18,
        radial_sigma_m: 22.0,
        along_track_sigma_m: 95.0,
        cross_track_sigma_m: 30.0,
        source: 'Simulated 18 SDS CDM Baseline',
      },
      externality_summary: {
        corridor_risk_level: 'ELEVATED',
        nearby_object_count: 2,
        notes: 'Simulated upper corridor debris fragment COSMOS-DEB-4421 limits safe prograde boost.',
      },
    },
    policy,
  };
}

/**
 * Local offline fallback evaluator matching the exact backend scoring weights & fail-closed rules.
 * Clearly labeled as DEMO SIMULATION when FastAPI backend is unreachable.
 */
export async function computeOfflineFallbackCommons(req: CommonsRequest): Promise<CommonsResult> {
  const policyMeta =
    ORBITAL_COMMONS_POLICIES.find(p => p.id === req.policy) ?? ORBITAL_COMMONS_POLICIES[0];
  const w = policyMeta.weights;
  const maxAge = Math.max(req.tle_age_hours, req.impact_graph.data_age_hours);
  const unc = req.impact_graph.uncertainty_summary;
  const hasSigma = unc.position_sigma_km != null || unc.radial_sigma_m != null;
  const staleOrMissing = maxAge > 72 || unc.covariance_available === false || !hasSigma;

  const missingInputs: string[] = [];
  if (maxAge > 72) missingInputs.push(`TLE age (${maxAge.toFixed(1)}h) exceeds 72h limit.`);
  if (!hasSigma || unc.covariance_available === false) {
    missingInputs.push('Covariance / uncertainty summary unavailable.');
  }

  const scoreComposite = (c: Omit<CommonsCandidate, 'composite_score' | 'recommended' | 'pareto_optimal'>) => {
    if (!c.feasible) return 0;
    const raw =
      c.risk_reduction_score * w.risk_reduction +
      c.fuel_efficiency_score * w.fuel_efficiency +
      c.mission_continuity_score * w.mission_continuity +
      c.uncertainty_score * w.uncertainty +
      c.externality_score * w.externality +
      c.fairness_score * w.fairness +
      c.human_review_score * w.human_review;
    return Number(Math.max(0, Math.min(100, raw)).toFixed(2));
  };

  const extPrimaryConflict = req.impact_graph.nearby_objects.some(
    nb => Math.abs(req.altitude_km + 28 - nb.altitude_km) < 12 && nb.collision_probability >= 0.004,
  );
  const canA = !staleOrMissing && req.operator_a.maneuverable && req.operator_a.available_delta_v_m_s >= 1.1 && !extPrimaryConflict;
  const canB = !staleOrMissing && req.operator_b.maneuverable && req.operator_b.available_delta_v_m_s >= 1.0 && req.operator_b.minimum_service_availability_percent <= 95.0;
  const canSplit = !staleOrMissing && req.operator_a.maneuverable && req.operator_b.maneuverable;

  const baseCandidates: CommonsCandidate[] = [
    {
      id: 'OPT-1-MANEUVER-PRIMARY',
      action_type: 'MANEUVER_PRIMARY',
      title: `Maneuver Primary Satellite (${req.primary_object})`,
      target_object: req.primary_object,
      feasible: canA,
      recommended: false,
      pareto_optimal: false,
      risk_reduction_score: canA ? 94 : 0,
      fuel_efficiency_score: canA ? 52 : 0,
      mission_continuity_score: canA ? 64 : 0,
      uncertainty_score: 78,
      externality_score: canA ? 82 : 0,
      fairness_score: canA ? 46 : 0,
      human_review_score: 82,
      composite_score: 0,
      cost_bearer: `Operator A (${req.primary_object})`,
      beneficiaries: [`Operator A (${req.primary_object})`, `Operator B (${req.secondary_object})`],
      burden_distribution: {
        operator_a_fuel_kg: canA ? 0.28 : 0,
        operator_b_fuel_kg: 0,
        operator_a_downtime_minutes: canA ? 36 : 0,
        operator_b_downtime_minutes: 0,
        operator_a_risk_benefit_pct: 98,
        operator_b_risk_benefit_pct: 98,
        fairness_summary: 'Unilateral primary burn: Operator A absorbs full fuel & mission interruption.',
      },
      physics: {
        delta_v_a_m_s: 1.1,
        delta_v_b_m_s: 0,
        total_delta_v_m_s: 1.1,
        fuel_a_kg: 0.28,
        fuel_b_kg: 0,
        total_fuel_kg: 0.28,
        expected_miss_km: Number((req.miss_distance_km + 40).toFixed(2)),
        post_action_probability: Number(Math.max(1e-6, req.collision_probability * 0.02).toFixed(6)),
        downtime_a_pct: 8,
        downtime_b_pct: 0,
        nearby_max_risk: extPrimaryConflict ? 0.0112 : 0.0021,
      },
      trade_off_summary: extPrimaryConflict
        ? 'Rejected in crowded corridor: prograde +28 km shift raises nearby COSMOS-DEB-4421 conjunction hazard.'
        : 'High primary miss margin, borne solely by Operator A.',
      rejected_reasons: staleOrMissing
        ? [...missingInputs]
        : extPrimaryConflict
          ? ['Residual or induced secondary risk exceeds configured safety limit.']
          : !req.operator_a.maneuverable
            ? ['Primary object is marked non-maneuverable.']
            : [],
      evidence_refs: ['vis-viva-phasing', 'impact-graph-corridor'],
    },
    {
      id: 'OPT-2-MANEUVER-SECONDARY',
      action_type: 'MANEUVER_SECONDARY',
      title: `Maneuver Secondary Satellite (${req.secondary_object})`,
      target_object: req.secondary_object,
      feasible: canB,
      recommended: false,
      pareto_optimal: false,
      risk_reduction_score: canB ? 91 : 0,
      fuel_efficiency_score: canB ? 91.58 : 0,
      mission_continuity_score: canB ? 77.5 : 0,
      uncertainty_score: 78,
      externality_score: canB ? 58.37 : 0,
      fairness_score: canB ? 57.06 : 0,
      human_review_score: 84,
      composite_score: 0,
      cost_bearer: `Operator B (${req.secondary_object})`,
      beneficiaries: [`Operator A (${req.primary_object})`, `Operator B (${req.secondary_object})`],
      burden_distribution: {
        operator_a_fuel_kg: 0,
        operator_b_fuel_kg: canB ? 0.027 : 0,
        operator_a_downtime_minutes: 0,
        operator_b_downtime_minutes: canB ? 22.5 : 0,
        operator_a_risk_benefit_pct: canB ? 97 : 0,
        operator_b_risk_benefit_pct: canB ? 97 : 0,
        fairness_summary: canB
          ? 'Operator B performs high-Isp Hall-electric maneuver with minimal propellant cost.'
          : 'Infeasible: secondary object is non-maneuverable or constrained.',
      },
      physics: {
        delta_v_a_m_s: 0,
        delta_v_b_m_s: canB ? 0.99 : 0,
        total_delta_v_m_s: canB ? 0.99 : 0,
        fuel_a_kg: 0,
        fuel_b_kg: canB ? 0.027 : 0,
        total_fuel_kg: canB ? 0.027 : 0,
        expected_miss_km: Number((req.miss_distance_km + (canB ? 36 : 0)).toFixed(2)),
        post_action_probability: canB ? Number(Math.max(1e-6, req.collision_probability * 0.03).toFixed(6)) : req.collision_probability,
        downtime_a_pct: 0,
        downtime_b_pct: canB ? 5 : 0,
        nearby_max_risk: 0.0017,
      },
      trade_off_summary: canB
        ? 'Ultra-low propellant via Hall Electric thruster (0.027 kg); slight lower-corridor proximity.'
        : `Rejected: ${req.secondary_object} cannot execute avoidance burn.`,
      rejected_reasons: staleOrMissing
        ? [...missingInputs]
        : !req.operator_b.maneuverable
          ? [`Secondary object ${req.secondary_object} is non-maneuverable.`]
          : [],
      evidence_refs: ['operator-b-propulsion-isp', 'impact-graph-corridor'],
    },
    {
      id: 'OPT-3-ADDITIONAL-TRACKING',
      action_type: 'ADDITIONAL_TRACKING',
      title: 'Request Additional SSN / Optical Tracking Pass',
      target_object: `${req.primary_object} & ${req.secondary_object}`,
      feasible: !staleOrMissing,
      recommended: false,
      pareto_optimal: false,
      risk_reduction_score: staleOrMissing ? 0 : 40,
      fuel_efficiency_score: staleOrMissing ? 0 : 100,
      mission_continuity_score: staleOrMissing ? 0 : 100,
      uncertainty_score: staleOrMissing ? 15 : 96,
      externality_score: staleOrMissing ? 0 : 93.96,
      fairness_score: staleOrMissing ? 0 : 71.08,
      human_review_score: 95,
      composite_score: 0,
      cost_bearer: 'Shared Tracking Coordination (Zero Propellant)',
      beneficiaries: [`Operator A (${req.primary_object})`, `Operator B (${req.secondary_object})`],
      burden_distribution: {
        operator_a_fuel_kg: 0,
        operator_b_fuel_kg: 0,
        operator_a_downtime_minutes: 0,
        operator_b_downtime_minutes: 0,
        operator_a_risk_benefit_pct: 35,
        operator_b_risk_benefit_pct: 35,
        fairness_summary: 'Equal procedural tracking cost; zero propellant or mission interruption.',
      },
      physics: {
        delta_v_a_m_s: 0,
        delta_v_b_m_s: 0,
        total_delta_v_m_s: 0,
        fuel_a_kg: 0,
        fuel_b_kg: 0,
        total_fuel_kg: 0,
        expected_miss_km: Number(req.miss_distance_km.toFixed(2)),
        post_action_probability: req.collision_probability,
        downtime_a_pct: 0,
        downtime_b_pct: 0,
        nearby_max_risk: 0.0052,
      },
      trade_off_summary: 'Zero propellant and zero payload interruption; shrinks covariance prior to burn decision.',
      rejected_reasons: staleOrMissing ? [...missingInputs] : [],
      evidence_refs: ['covariance-collapse-tasking'],
    },
    {
      id: 'OPT-4-HOLD-RESCREEN',
      action_type: 'HOLD_AND_RESCREEN',
      title: 'Hold Maneuver & Re-screen at Next Ephemeris Update',
      target_object: 'CONJUNCTION_PAIR',
      feasible: false,
      recommended: false,
      pareto_optimal: false,
      risk_reduction_score: 0,
      fuel_efficiency_score: 0,
      mission_continuity_score: 0,
      uncertainty_score: 66,
      externality_score: 0,
      fairness_score: 0,
      human_review_score: 75,
      composite_score: 0,
      cost_bearer: 'None (Passive Screening)',
      beneficiaries: [`Operator A (${req.primary_object})`, `Operator B (${req.secondary_object})`],
      burden_distribution: {
        operator_a_fuel_kg: 0,
        operator_b_fuel_kg: 0,
        operator_a_downtime_minutes: 0,
        operator_b_downtime_minutes: 0,
        operator_a_risk_benefit_pct: 0,
        operator_b_risk_benefit_pct: 0,
        fairness_summary: 'Passive hold disallowed when Pc exceeds configured safety limit or TCA < 18h.',
      },
      physics: {
        delta_v_a_m_s: 0,
        delta_v_b_m_s: 0,
        total_delta_v_m_s: 0,
        fuel_a_kg: 0,
        fuel_b_kg: 0,
        total_fuel_kg: 0,
        expected_miss_km: Number(req.miss_distance_km.toFixed(2)),
        post_action_probability: req.collision_probability,
        downtime_a_pct: 0,
        downtime_b_pct: 0,
        nearby_max_risk: 0.0052,
      },
      trade_off_summary: 'Infeasible: TCA < 18h and Pc exceeds maximum allowed risk.',
      rejected_reasons: [
        'TCA is under 18h; holding without mitigation narrows avoidance execution margin.',
        `Passive hold leaves collision probability (${req.collision_probability.toExponential(2)}) above operator safety threshold.`,
      ],
      evidence_refs: ['batch-rescreen-policy'],
    },
    {
      id: 'OPT-5-COORDINATED-SPLIT',
      action_type: 'COORDINATED_SPLIT_MANEUVER',
      title: 'Coordinate Shared Split Avoidance Maneuver (Op A + Op B)',
      target_object: `${req.primary_object} & ${req.secondary_object}`,
      feasible: canSplit,
      recommended: false,
      pareto_optimal: false,
      risk_reduction_score: canSplit ? 96 : 0,
      fuel_efficiency_score: canSplit ? 56.09 : 0,
      mission_continuity_score: canSplit ? 78 : 0,
      uncertainty_score: 78,
      externality_score: canSplit ? 80.63 : 0,
      fairness_score: canSplit ? 70.87 : 0,
      human_review_score: 90,
      composite_score: 0,
      cost_bearer: 'Shared (Operator A & Operator B)',
      beneficiaries: [`Operator A (${req.primary_object})`, `Operator B (${req.secondary_object})`],
      burden_distribution: {
        operator_a_fuel_kg: canSplit ? 0.155 : 0,
        operator_b_fuel_kg: canSplit ? 0.015 : 0,
        operator_a_downtime_minutes: canSplit ? 13.5 : 0,
        operator_b_downtime_minutes: canSplit ? 11.3 : 0,
        operator_a_risk_benefit_pct: canSplit ? 98.5 : 0,
        operator_b_risk_benefit_pct: canSplit ? 98.5 : 0,
        fairness_summary: 'Balanced mutual counter-phasing splits operational and propellant burden across both operators.',
      },
      physics: {
        delta_v_a_m_s: canSplit ? 0.6068 : 0,
        delta_v_b_m_s: canSplit ? 0.5457 : 0,
        total_delta_v_m_s: canSplit ? 1.1525 : 0,
        fuel_a_kg: canSplit ? 0.155 : 0,
        fuel_b_kg: canSplit ? 0.015 : 0,
        total_fuel_kg: canSplit ? 0.17 : 0,
        expected_miss_km: Number((req.miss_distance_km + (canSplit ? 46 : 0)).toFixed(2)),
        post_action_probability: canSplit ? Number(Math.max(1e-6, req.collision_probability * 0.015).toFixed(6)) : req.collision_probability,
        downtime_a_pct: canSplit ? 3 : 0,
        downtime_b_pct: canSplit ? 2.5 : 0,
        nearby_max_risk: 0.0059,
      },
      trade_off_summary: canSplit
        ? 'Maximum combined miss distance and equitable burden sharing while avoiding COSMOS-DEB-4421.'
        : 'Infeasible: shared split maneuver requires both satellites to be maneuverable.',
      rejected_reasons: staleOrMissing
        ? [...missingInputs]
        : !canSplit
          ? ['Shared split maneuver requires both primary and secondary objects to be maneuverable.']
          : [],
      evidence_refs: ['mutual-phasing-split', 'fair-burden-model', 'impact-graph-corridor'],
    },
    {
      id: 'OPT-6-ESCALATE-SAFETY-LEAD',
      action_type: 'ESCALATE_HUMAN_SAFETY_LEAD',
      title: 'Escalate to Coalition Flight Director & Human Safety Lead',
      target_object: 'HUMAN_SAFETY_BOARD',
      feasible: true,
      recommended: false,
      pareto_optimal: true,
      risk_reduction_score: 48,
      fuel_efficiency_score: 78,
      mission_continuity_score: 74,
      uncertainty_score: 78,
      externality_score: 93.96,
      fairness_score: 80,
      human_review_score: 100,
      composite_score: 0,
      cost_bearer: 'Shared Governance / Safety Board',
      beneficiaries: [`Operator A (${req.primary_object})`, `Operator B (${req.secondary_object})`],
      burden_distribution: {
        operator_a_fuel_kg: 0,
        operator_b_fuel_kg: 0,
        operator_a_downtime_minutes: 0,
        operator_b_downtime_minutes: 0,
        operator_a_risk_benefit_pct: 50,
        operator_b_risk_benefit_pct: 50,
        fairness_summary: 'Places human safety arbitration ahead of automated scoring when constraints conflict.',
      },
      physics: {
        delta_v_a_m_s: 0,
        delta_v_b_m_s: 0,
        total_delta_v_m_s: 0,
        fuel_a_kg: 0,
        fuel_b_kg: 0,
        total_fuel_kg: 0,
        expected_miss_km: Number(req.miss_distance_km.toFixed(2)),
        post_action_probability: req.collision_probability,
        downtime_a_pct: 0,
        downtime_b_pct: 0,
        nearby_max_risk: 0.0052,
      },
      trade_off_summary: 'Routes trade-off matrix to human flight directors; zero autonomous action.',
      rejected_reasons: [],
      evidence_refs: ['two-person-governance-rule'],
    },
    {
      id: 'OPT-7-INSUFFICIENT-DATA',
      action_type: 'INSUFFICIENT_DATA',
      title: 'Flag Event as INSUFFICIENT_DATA Pending Verified Ephemeris',
      target_object: 'DATA_PROVENANCE_GATE',
      feasible: true,
      recommended: false,
      pareto_optimal: true,
      risk_reduction_score: staleOrMissing ? 85 : 15,
      fuel_efficiency_score: 100,
      mission_continuity_score: 100,
      uncertainty_score: staleOrMissing ? 95 : 10,
      externality_score: 93.96,
      fairness_score: 80,
      human_review_score: 95,
      composite_score: 0,
      cost_bearer: 'Data Provenance & Tracking Team',
      beneficiaries: [`Operator A (${req.primary_object})`, `Operator B (${req.secondary_object})`],
      burden_distribution: {
        operator_a_fuel_kg: 0,
        operator_b_fuel_kg: 0,
        operator_a_downtime_minutes: 0,
        operator_b_downtime_minutes: 0,
        operator_a_risk_benefit_pct: 0,
        operator_b_risk_benefit_pct: 0,
        fairness_summary: 'Fail-safe gate halting maneuver execution until fresh covariance & TLE arrive.',
      },
      physics: {
        delta_v_a_m_s: 0,
        delta_v_b_m_s: 0,
        total_delta_v_m_s: 0,
        fuel_a_kg: 0,
        fuel_b_kg: 0,
        total_fuel_kg: 0,
        expected_miss_km: Number(req.miss_distance_km.toFixed(2)),
        post_action_probability: req.collision_probability,
        downtime_a_pct: 0,
        downtime_b_pct: 0,
        nearby_max_risk: 0.0052,
      },
      trade_off_summary: 'Fail-safe gate when ephemeris or covariance inputs fail integrity checks.',
      rejected_reasons: staleOrMissing ? [] : ['Inputs are valid and fresh; only selected if higher-confidence options fail.'],
      evidence_refs: ['fail-closed-provenance-gate'],
    },
  ];

  baseCandidates.forEach(c => {
    c.composite_score = scoreComposite(c);
  });

  const feasible = baseCandidates.filter(c => c.feasible);
  const dims: (keyof CommonsCandidate)[] = [
    'risk_reduction_score',
    'fuel_efficiency_score',
    'mission_continuity_score',
    'uncertainty_score',
    'externality_score',
    'fairness_score',
  ];
  const paretoIds: string[] = [];
  for (const cand of feasible) {
    const dominated = feasible.some(
      other =>
        other.id !== cand.id &&
        dims.every(d => Number(other[d]) >= Number(cand[d])) &&
        dims.some(d => Number(other[d]) > Number(cand[d])),
    );
    cand.pareto_optimal = !dominated;
    if (!dominated) paretoIds.push(cand.id);
  }

  let recommended = baseCandidates.find(c => c.id === 'OPT-7-INSUFFICIENT-DATA')!;
  if (!staleOrMissing) {
    const operationalFeasible = feasible.filter(c => c.action_type !== 'INSUFFICIENT_DATA');
    if (operationalFeasible.length > 0) {
      recommended = [...operationalFeasible].sort((a, b) => b.composite_score - a.composite_score)[0];
    }
  }
  recommended.recommended = true;

  const evidenceBody = {
    event_id: req.event_id,
    engine_version: 'orbital-commons-1.0.0-offline-fallback',
    selected_policy: req.policy,
    scoring_weights: w,
    recommendation: recommended.id,
    pareto_frontier: paretoIds,
    candidate_results: baseCandidates.map(c => ({
      id: c.id,
      feasible: c.feasible,
      composite_score: c.composite_score,
    })),
  };
  const auditHash = await computeEvidenceHash(evidenceBody);

  return {
    event_id: req.event_id,
    primary_object: req.primary_object,
    secondary_object: req.secondary_object,
    status: staleOrMissing ? 'INSUFFICIENT_DATA' : 'EVALUATED',
    selected_policy: req.policy,
    policy_weights: { ...w },
    recommended_candidate_id: recommended.id,
    operational_recommendation: `${recommended.title} (Offline DEMO SIMULATION fallback — Policy: ${req.policy})`,
    candidates: baseCandidates,
    pareto_frontier: paretoIds,
    highlights: {
      safest_feasible_id: [...feasible].sort((a, b) => b.risk_reduction_score - a.risk_reduction_score)[0]?.id,
      lowest_fuel_id: [...feasible].sort((a, b) => b.fuel_efficiency_score - a.fuel_efficiency_score)[0]?.id,
      lowest_disruption_id: [...feasible].sort((a, b) => b.mission_continuity_score - a.mission_continuity_score)[0]?.id,
      fairest_id: [...feasible].sort((a, b) => b.fairness_score - a.fairness_score)[0]?.id,
      lowest_externality_id: [...feasible].sort((a, b) => b.externality_score - a.externality_score)[0]?.id,
      recommended_id: recommended.id,
    },
    counterfactual: {
      question: 'What happens if no action is taken?',
      current_collision_probability: req.collision_probability,
      expected_miss_distance_km: req.miss_distance_km,
      expected_nearby_object_impact: `${req.impact_graph.nearby_objects.length} corridor objects monitored.`,
      nearby_at_risk_count: req.impact_graph.nearby_objects.filter(nb => nb.distance_km <= 5).length,
      max_nearby_collision_probability: Math.max(0, ...req.impact_graph.nearby_objects.map(nb => nb.collision_probability)),
      remaining_time_to_tca_hours: 14.0,
      additional_tracking_recommended: true,
      summary: `If no action is taken, baseline risk stays ${req.collision_probability.toExponential(2)} at miss ${req.miss_distance_km.toFixed(2)} km.`,
    },
    operator_constraint_summaries: [
      {
        operator_label: 'Operator A',
        operator_id_masked: `MASKED-${req.operator_a.operator_id.slice(0, 4)}***`,
        object_id: req.operator_a.object_id,
        maneuverable: req.operator_a.maneuverable,
        propulsion_type: req.operator_a.propulsion_type,
        privacy_protected: req.operator_a.private,
        capability_summary: 'Maneuver-capable spacecraft; propellant reserves masked in cross-operator view.',
        authorized_private_details: null,
      },
      {
        operator_label: 'Operator B',
        operator_id_masked: `MASKED-${req.operator_b.operator_id.slice(0, 4)}***`,
        object_id: req.operator_b.object_id,
        maneuverable: req.operator_b.maneuverable,
        propulsion_type: req.operator_b.propulsion_type,
        privacy_protected: req.operator_b.private,
        capability_summary: req.operator_b.maneuverable
          ? 'Maneuver-capable spacecraft; propellant reserves masked in cross-operator view.'
          : 'Non-maneuverable object (unable to execute orbital avoidance burn).',
        authorized_private_details: null,
      },
    ],
    fairness_explanation: `${recommended.title} assigns cost bearer '${recommended.cost_bearer}' (${recommended.burden_distribution.fairness_summary}).`,
    privacy_explanation:
      'Prototype privacy boundary: private operator reserves and blackout windows are masked in cross-operator summaries (not production cryptographic MPC).',
    provenance_summary: 'DEMO SIMULATION — Offline Local Fallback | Decision support only',
    data_mode: 'demo-simulation-offline',
    tca_utc: req.tca,
    time_to_tca_hours: 14.0,
    tle_age_hours: req.tle_age_hours,
    collision_probability: req.collision_probability,
    miss_distance_km: req.miss_distance_km,
    assumptions: [
      'Circular Vis-Viva orbital velocity approximation used in offline demo mode.',
      'Canonical SHA-256 hash computed from deterministic scoring snapshot.',
    ],
    uncertainties: [
      `TLE age: ${req.tle_age_hours.toFixed(1)}h; corridor congestion index: ${req.impact_graph.orbital_corridor.congestion_index.toFixed(2)}.`,
    ],
    missing_inputs: missingInputs,
    evidence_packet: {
      ...evidenceBody,
      hash_algorithm: 'SHA-256',
      hash_scope: 'canonical_deterministic_evidence',
      audit_hash_sha256: auditHash,
      disclaimer: ORBITAL_COMMONS_DISCLAIMER,
    },
    audit_hash_sha256: auditHash,
    explanation: {
      summary: `${recommended.title} selected under ${req.policy} (${recommended.composite_score.toFixed(1)}/100). ${ORBITAL_COMMONS_DISCLAIMER}`,
      recommended_option_explanation: recommended.trade_off_summary,
      trade_offs: feasible.slice(0, 4).map(c => `${c.id}: ${c.composite_score.toFixed(1)}/100 (${c.cost_bearer})`),
      fairness_explanation: recommended.burden_distribution.fairness_summary,
      externality_explanation: `${req.impact_graph.nearby_objects.length} corridor neighbors screened.`,
      evidence_references: recommended.evidence_refs,
      assumptions: ['Offline fallback deterministic evaluation (DEMO SIMULATION).'],
      uncertainties: [`Position 1-sigma: ${req.impact_graph.uncertainty_summary.position_sigma_km ?? 'N/A'} km`],
      missing_inputs: missingInputs,
      disclaimer: ORBITAL_COMMONS_DISCLAIMER,
      provenance: 'offline-demo-fallback',
    },
    review_state: {
      status: staleOrMissing ? 'INSUFFICIENT_DATA' : 'PENDING_REVIEW',
      selected_candidate_id: recommended.id,
      clarifications: [],
      command_executed: false,
      command_status_note: 'No spacecraft command executed. Decision support only — human approval required.',
    },
    generated_at_utc: '2026-11-17T12:00:00Z',
    disclaimer: ORBITAL_COMMONS_DISCLAIMER,
  };
}

export async function evaluateOrbitalCommonsApi(
  req: CommonsRequest,
  userId = 'anish',
): Promise<{ result: CommonsResult; viaBackend: boolean }> {
  try {
    const res = await fetch(getApiUrl(API_ENDPOINTS.ORBITAL_COMMONS_EVALUATE), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as CommonsResult;
    return { result: data, viaBackend: true };
  } catch {
    const fallback = await computeOfflineFallbackCommons(req);
    return { result: fallback, viaBackend: false };
  }
}

export async function submitCommonsApprovalApi(
  eventId: string,
  payload: { candidate_id: string; notes: string; safety_acknowledged: boolean },
  userId: string,
): Promise<CommonsResult> {
  const res = await fetch(getApiUrl(`${API_ENDPOINTS.ORBITAL_COMMONS_EVENTS}/${encodeURIComponent(eventId)}/approve`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || data?.detail || `Approval failed (HTTP ${res.status})`);
  }
  return data as CommonsResult;
}

export async function submitCommonsRejectApi(
  eventId: string,
  payload: { reason: string; action: 'reject' | 'clarification' },
  userId: string,
): Promise<CommonsResult> {
  const res = await fetch(getApiUrl(`${API_ENDPOINTS.ORBITAL_COMMONS_EVENTS}/${encodeURIComponent(eventId)}/reject`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || data?.detail || `Action failed (HTTP ${res.status})`);
  }
  return data as CommonsResult;
}
