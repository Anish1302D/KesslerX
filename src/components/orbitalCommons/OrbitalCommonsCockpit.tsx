import { useState, useCallback } from 'react';
import {
  ShieldAlert,
  Scale,
  CheckCircle2,
  XCircle,
  Lock,
  FileCode2,
  Download,
  UserCheck,
  AlertTriangle,
  Sparkles,
  Fuel,
  Activity,
  Network,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { useCurrentUser } from '../handoff/UserContext';
import {
  type CommonsCandidate,
  type CommonsRequest,
  type CommonsResult,
  type PolicyMode,
  ORBITAL_COMMONS_DISCLAIMER,
  ORBITAL_COMMONS_POLICIES,
  ORBITAL_COMMONS_PROTOTYPE_WARNING,
  buildDemoCommonsRequest,
  computeOfflineFallbackCommons,
  evaluateOrbitalCommonsApi,
  submitCommonsApprovalApi,
  submitCommonsRejectApi,
} from '../../utils/orbitalCommons';

export interface OrbitalCommonsCockpitProps {
  initialResult?: CommonsResult;
  linkedEventSummary?: {
    event_id?: string;
    primary_object?: string;
    secondary_object?: string;
    altitude_km?: number;
    miss_distance_km?: number;
    collision_probability?: number;
    tle_age_hours?: number;
  };
  onEvaluateOverride?: (req: CommonsRequest) => Promise<CommonsResult>;
  onApproveOverride?: (
    eventId: string,
    payload: { candidate_id: string; notes: string; safety_acknowledged: boolean },
    reviewerId: string,
  ) => Promise<CommonsResult>;
  onRejectOverride?: (
    eventId: string,
    payload: { reason: string; action: 'reject' | 'clarification' },
    reviewerId: string,
  ) => Promise<CommonsResult>;
}

const REVIEW_STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  PENDING_REVIEW: {
    label: 'Pending 1st Human Review',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  },
  FIRST_REVIEW_COMPLETE: {
    label: '1st Review Signed — Awaiting 2nd Reviewer',
    cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  },
  SECOND_REVIEW_COMPLETE: {
    label: 'Two-Person Human Approval Recorded (No Auto-Command)',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  },
  REJECTED: {
    label: 'Rejected by Human Reviewer',
    cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  },
  INSUFFICIENT_DATA: {
    label: 'Halted — INSUFFICIENT_DATA Gate Triggered',
    cls: 'bg-rose-500/20 text-rose-200 border-rose-500/50',
  },
};

function ScoreBar({ label, value, tone = 'cyan' }: { label: string; value: number; tone?: string }) {
  const barColors: Record<string, string> = {
    cyan: 'bg-cyan-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    violet: 'bg-violet-400',
    sky: 'bg-sky-400',
    teal: 'bg-teal-400',
    indigo: 'bg-indigo-400',
  };
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-mono">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-200 font-semibold">{pct.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColors[tone] || 'bg-cyan-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function OrbitalCommonsCockpit({
  initialResult,
  linkedEventSummary,
  onEvaluateOverride,
  onApproveOverride,
  onRejectOverride,
}: OrbitalCommonsCockpitProps) {
  const { currentUser, allUsers } = useCurrentUser();

  const [scenario, setScenario] = useState<'MULTI_OP' | 'DEBRIS_CONJUNCTION' | 'STALE_CDM'>('MULTI_OP');
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyMode>(
    initialResult?.selected_policy ?? 'FAIR_BURDEN_SHARING',
  );
  const [result, setResult] = useState<CommonsResult | null>(initialResult ?? null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    initialResult?.recommended_candidate_id ?? 'OPT-5-COORDINATED-SPLIT',
  );
  const [viaBackend, setViaBackend] = useState<boolean>(Boolean(initialResult));
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showEvidenceDrawer, setShowEvidenceDrawer] = useState<boolean>(false);
  const [reviewerId, setReviewerId] = useState<string>(currentUser?.user_id || 'anish');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [safetyAcknowledged, setSafetyAcknowledged] = useState<boolean>(true);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);

  const runEvaluation = useCallback(
    async (
      nextPolicy: PolicyMode,
      nextScenario: 'MULTI_OP' | 'DEBRIS_CONJUNCTION' | 'STALE_CDM',
    ) => {
      setLoading(true);
      setErrorMsg(null);
      setReviewFeedback(null);
      try {
        const baseReq = buildDemoCommonsRequest(nextPolicy, nextScenario);
        const req: CommonsRequest = linkedEventSummary && nextScenario === 'MULTI_OP'
          ? {
              ...baseReq,
              event_id: linkedEventSummary.event_id || baseReq.event_id,
              primary_object: linkedEventSummary.primary_object || baseReq.primary_object,
              secondary_object: linkedEventSummary.secondary_object || baseReq.secondary_object,
              altitude_km: linkedEventSummary.altitude_km ?? baseReq.altitude_km,
              miss_distance_km: linkedEventSummary.miss_distance_km ?? baseReq.miss_distance_km,
              collision_probability: linkedEventSummary.collision_probability ?? baseReq.collision_probability,
              tle_age_hours: linkedEventSummary.tle_age_hours ?? baseReq.tle_age_hours,
              operator_a: {
                ...baseReq.operator_a,
                object_id: linkedEventSummary.primary_object || baseReq.operator_a.object_id,
              },
              operator_b: {
                ...baseReq.operator_b,
                object_id: linkedEventSummary.secondary_object || baseReq.operator_b.object_id,
              },
            }
          : baseReq;

        let evaluated: CommonsResult;
        if (onEvaluateOverride) {
          evaluated = await onEvaluateOverride(req);
          setViaBackend(true);
        } else {
          const out = await evaluateOrbitalCommonsApi(req, reviewerId);
          evaluated = out.result;
          setViaBackend(out.viaBackend);
        }
        setResult(evaluated);
        setSelectedCandidateId(evaluated.recommended_candidate_id);
      } catch (err) {
        const fallback = await computeOfflineFallbackCommons(buildDemoCommonsRequest(nextPolicy, nextScenario));
        setResult(fallback);
        setSelectedCandidateId(fallback.recommended_candidate_id);
        setViaBackend(false);
        setErrorMsg(err instanceof Error ? err.message : 'Evaluation fell back to offline demo simulation.');
      } finally {
        setLoading(false);
      }
    },
    [linkedEventSummary, onEvaluateOverride, reviewerId],
  );

  const handlePolicyChange = (policyId: PolicyMode) => {
    setSelectedPolicy(policyId);
    void runEvaluation(policyId, scenario);
  };

  const handleScenarioChange = (nextScenario: 'MULTI_OP' | 'DEBRIS_CONJUNCTION' | 'STALE_CDM') => {
    setScenario(nextScenario);
    void runEvaluation(selectedPolicy, nextScenario);
  };

  const handleApproveReview = async () => {
    if (!result) return;
    setReviewFeedback(null);
    setErrorMsg(null);
    if (!safetyAcknowledged) {
      setErrorMsg('Human reviewer must acknowledge decision-support safety warning before signing off.');
      return;
    }
    try {
      let updated: CommonsResult;
      if (onApproveOverride) {
        updated = await onApproveOverride(
          result.event_id,
          { candidate_id: selectedCandidateId, notes: reviewNotes, safety_acknowledged: true },
          reviewerId,
        );
      } else if (viaBackend) {
        updated = await submitCommonsApprovalApi(
          result.event_id,
          { candidate_id: selectedCandidateId, notes: reviewNotes, safety_acknowledged: true },
          reviewerId,
        );
      } else {
        // Offline UI demonstration of strict Two-Person Rule without claiming backend persistence
        const rs = result.review_state;
        const nowIso = new Date().toISOString();
        if (rs.status === 'INSUFFICIENT_DATA') {
          throw new Error('Cannot approve when event status is INSUFFICIENT_DATA.');
        }
        if (rs.status === 'PENDING_REVIEW') {
          updated = {
            ...result,
            review_state: {
              ...rs,
              status: 'FIRST_REVIEW_COMPLETE',
              selected_candidate_id: selectedCandidateId,
              first_reviewer: {
                reviewer_id: reviewerId,
                reviewer_role: 'human-reviewer',
                candidate_id: selectedCandidateId,
                notes: reviewNotes || 'First review verified.',
                reviewed_at_utc: nowIso,
                safety_acknowledged: true,
              },
              command_executed: false,
            },
          };
        } else if (rs.status === 'FIRST_REVIEW_COMPLETE') {
          if (rs.first_reviewer?.reviewer_id.toLowerCase() === reviewerId.toLowerCase()) {
            throw new Error(
              'Two-person rule violation: second reviewer must be distinct from the first reviewer.',
            );
          }
          updated = {
            ...result,
            review_state: {
              ...rs,
              status: 'SECOND_REVIEW_COMPLETE',
              selected_candidate_id: rs.selected_candidate_id || selectedCandidateId,
              second_reviewer: {
                reviewer_id: reviewerId,
                reviewer_role: 'human-reviewer-2',
                candidate_id: rs.selected_candidate_id || selectedCandidateId,
                notes: reviewNotes || 'Independent second human confirmation recorded.',
                reviewed_at_utc: nowIso,
                safety_acknowledged: true,
              },
              command_executed: false,
              command_status_note:
                'Two-person approval complete. No spacecraft command executed. Decision support only.',
            },
          };
        } else {
          throw new Error(`Cannot approve while status is ${rs.status}.`);
        }
      }
      setResult(updated);
      setReviewNotes('');
      setReviewFeedback(
        `Human review recorded by '${reviewerId}' (${updated.review_state.status}). No spacecraft command executed.`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Approval rejected.');
    }
  };

  const handleRejectOrClarify = async (action: 'reject' | 'clarification') => {
    if (!result) return;
    setErrorMsg(null);
    setReviewFeedback(null);
    const reasonText = rejectReason.trim() || (action === 'clarification' ? 'Request updated CDM covariance' : 'Stand down');
    try {
      let updated: CommonsResult;
      if (onRejectOverride) {
        updated = await onRejectOverride(result.event_id, { reason: reasonText, action }, reviewerId);
      } else if (viaBackend) {
        updated = await submitCommonsRejectApi(result.event_id, { reason: reasonText, action }, reviewerId);
      } else {
        const rs = result.review_state;
        const nowIso = new Date().toISOString();
        updated = {
          ...result,
          review_state:
            action === 'clarification'
              ? {
                  ...rs,
                  clarifications: [...rs.clarifications, { requested_by: reviewerId, message: reasonText, requested_at_utc: nowIso }],
                }
              : {
                  ...rs,
                  status: 'REJECTED',
                  rejected_by: reviewerId,
                  rejection_reason: reasonText,
                },
        };
      }
      setResult(updated);
      setRejectReason('');
      setReviewFeedback(
        action === 'clarification'
          ? `Clarification logged by '${reviewerId}'.`
          : `Recommendation rejected by '${reviewerId}'.`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to record action.');
    }
  };

  const handleDownloadEvidence = () => {
    if (!result) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            event_id: result.event_id,
            audit_hash_sha256: result.audit_hash_sha256,
            evidence_packet: result.evidence_packet,
            review_state: result.review_state,
            disclaimer: ORBITAL_COMMONS_DISCLAIMER,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${result.event_id}-orbital-commons-evidence.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const activePolicyMeta =
    ORBITAL_COMMONS_POLICIES.find(p => p.id === selectedPolicy) ?? ORBITAL_COMMONS_POLICIES[0];

  const selectedCandidate: CommonsCandidate | undefined = result?.candidates.find(
    c => c.id === selectedCandidateId,
  );

  const reviewBadge = result
    ? REVIEW_STATUS_BADGES[result.review_state.status] || REVIEW_STATUS_BADGES.PENDING_REVIEW
    : REVIEW_STATUS_BADGES.PENDING_REVIEW;

  return (
    <div className="space-y-5" data-testid="orbital-commons-cockpit">
      {/* Safety Warning & Prototype Provenance Banner */}
      <div
        role="region"
        aria-label="Orbital Commons Safety Notice"
        className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                {ORBITAL_COMMONS_DISCLAIMER}
              </p>
              <p className="text-xs text-slate-300">
                {ORBITAL_COMMONS_PROTOTYPE_WARNING} Deterministic orbital physics and policy scoring; AI provides
                narrative explanation only and never issues or approves spacecraft burns.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span
              className={`px-2.5 py-1 rounded border ${
                viaBackend
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
              }`}
            >
              {result ? (viaBackend ? `LIVE BACKEND · ${result.data_mode.toUpperCase()}` : 'DEMO SIMULATION') : 'READY'}
            </span>
            {result && (
              <span className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800/80 text-slate-300">
                Data Age: {result.tle_age_hours.toFixed(1)}h · T-{result.time_to_tca_hours.toFixed(1)}h
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scenario Control & Optimization Policy Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#131a29] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Orbital Commons AI — Multi-Operator Conjunction Negotiation
              </h2>
              <p className="text-xs text-slate-400">
                Compares 7 deterministic actions across safety, fuel, downtime, uncertainty, corridor externality, and fairness.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleScenarioChange('MULTI_OP')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                scenario === 'MULTI_OP'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:border-slate-600'
              }`}
            >
              Active vs Active (OC-DEMO-001)
            </button>
            <button
              type="button"
              onClick={() => handleScenarioChange('DEBRIS_CONJUNCTION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                scenario === 'DEBRIS_CONJUNCTION'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:border-slate-600'
              }`}
            >
              Active vs Debris
            </button>
            <button
              type="button"
              onClick={() => handleScenarioChange('STALE_CDM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                scenario === 'STALE_CDM'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:border-slate-600'
              }`}
            >
              Stale TLE Gate Demo
            </button>
            <button
              type="button"
              onClick={() => void runEvaluation(selectedPolicy, scenario)}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Evaluating...' : result ? 'Re-Evaluate' : 'Run Orbital Commons AI'}
            </button>
          </div>
        </div>

        {/* Policy Mode Selector */}
        <div className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            Optimization Policy Mode (Explicit Auditable Weights)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2" role="tablist" aria-label="Optimization Policies">
            {ORBITAL_COMMONS_POLICIES.map(pol => {
              const active = pol.id === selectedPolicy;
              return (
                <button
                  key={pol.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handlePolicyChange(pol.id)}
                  className={`text-left p-2.5 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                    active
                      ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">{pol.label}</div>
                  <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">{pol.description}</div>
                </button>
              );
            })}
          </div>
          <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 border border-slate-800 rounded px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-1">
            <span>Weights ({activePolicyMeta.id}):</span>
            <span>Risk {(activePolicyMeta.weights.risk_reduction * 100).toFixed(0)}%</span>
            <span>Fuel {(activePolicyMeta.weights.fuel_efficiency * 100).toFixed(0)}%</span>
            <span>Continuity {(activePolicyMeta.weights.mission_continuity * 100).toFixed(0)}%</span>
            <span>Fairness {(activePolicyMeta.weights.fairness * 100).toFixed(0)}%</span>
            <span>Externality {(activePolicyMeta.weights.externality * 100).toFixed(0)}%</span>
            <span>Uncertainty {(activePolicyMeta.weights.uncertainty * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/50 bg-rose-950/50 px-4 py-2.5 text-xs text-rose-200 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!result ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center space-y-3">
          <Scale className="w-10 h-10 text-cyan-400 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-200">
            Ready to Evaluate Multi-Operator Orbital Commons Trade-Offs
          </h3>
          <p className="text-xs text-slate-400 max-w-xl mx-auto">
            Click <strong>Run Orbital Commons AI</strong> to compare 7 deterministic actions, inspect corridor
            externalities, privacy-masked operator constraints, Pareto frontier rankings, and the SHA-256 evidence packet.
          </p>
          <button
            type="button"
            onClick={() => void runEvaluation(selectedPolicy, scenario)}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            Run Orbital Commons AI
          </button>
        </div>
      ) : (
        <>
          {/* INSUFFICIENT_DATA Gate Warning if active */}
          {result.status === 'INSUFFICIENT_DATA' && (
            <div
              role="status"
              className="rounded-xl border border-rose-500/60 bg-rose-950/60 p-4 flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-bold text-rose-200">
                  INSUFFICIENT_DATA Gate Triggered — Automated Maneuver Scoring Halted
                </div>
                <p className="text-xs text-rose-200/90">{result.operational_recommendation}</p>
                <ul className="list-disc list-inside text-xs text-rose-300 space-y-0.5">
                  {result.missing_inputs.map((m, idx) => (
                    <li key={idx}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Recommendation + Counterfactual Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recommended Option Summary */}
            <div className="lg:col-span-2 rounded-xl border border-cyan-500/35 bg-[#141d2e] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono uppercase tracking-wider text-cyan-300">
                    Recommended Course of Action ({result.selected_policy})
                  </span>
                </div>
                <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded border ${reviewBadge.cls}`}>
                  {reviewBadge.label}
                </span>
              </div>

              <div className="text-sm font-semibold text-white">{result.operational_recommendation}</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {result.explanation?.recommended_option_explanation || result.fairness_explanation}
              </p>

              {/* Category Highlights & Pareto Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                <div className="bg-slate-900/70 rounded p-2 border border-slate-800">
                  <div className="text-slate-400">Safest Feasible</div>
                  <div className="font-mono text-emerald-300 truncate">{result.highlights.safest_feasible_id || 'N/A'}</div>
                </div>
                <div className="bg-slate-900/70 rounded p-2 border border-slate-800">
                  <div className="text-slate-400">Lowest Fuel</div>
                  <div className="font-mono text-cyan-300 truncate">{result.highlights.lowest_fuel_id || 'N/A'}</div>
                </div>
                <div className="bg-slate-900/70 rounded p-2 border border-slate-800">
                  <div className="text-slate-400">Lowest Disruption</div>
                  <div className="font-mono text-sky-300 truncate">{result.highlights.lowest_disruption_id || 'N/A'}</div>
                </div>
                <div className="bg-slate-900/70 rounded p-2 border border-slate-800">
                  <div className="text-slate-400">Fairest Burden</div>
                  <div className="font-mono text-violet-300 truncate">{result.highlights.fairest_id || 'N/A'}</div>
                </div>
                <div className="bg-slate-900/70 rounded p-2 border border-slate-800">
                  <div className="text-slate-400">Pareto Frontier</div>
                  <div className="font-mono text-amber-300">{result.pareto_frontier.length} non-dominated</div>
                </div>
              </div>
            </div>

            {/* Counterfactual Box */}
            <div className="rounded-xl border border-rose-500/30 bg-[#181624] p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-rose-300">
                <HelpCircle className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">{result.counterfactual.question}</h3>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{result.counterfactual.summary}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                  <div className="text-slate-400">Baseline Pc</div>
                  <div className="text-rose-300 font-bold">
                    {result.counterfactual.current_collision_probability.toExponential(2)}
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                  <div className="text-slate-400">Miss Distance</div>
                  <div className="text-slate-200 font-bold">
                    {result.counterfactual.expected_miss_distance_km.toFixed(2)} km
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {result.counterfactual.expected_nearby_object_impact}
              </p>
            </div>
          </div>

          {/* 7 Candidate Comparison Cards */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                7-Action Deterministic Trade-Off Matrix (Select an Option to Inspect & Sign Off)
              </h3>
              <span className="text-[11px] text-slate-400">
                Pareto Frontier IDs: <span className="font-mono text-cyan-300">{result.pareto_frontier.join(', ')}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {result.candidates.map(cand => {
                const isSelected = cand.id === selectedCandidateId;
                return (
                  <button
                    key={cand.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedCandidateId(cand.id)}
                    className={`text-left rounded-xl border p-3.5 transition focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                      isSelected
                        ? 'border-cyan-400 bg-[#162238] shadow-lg shadow-cyan-950/40'
                        : cand.feasible
                          ? 'border-slate-800 bg-[#111827] hover:border-slate-700'
                          : 'border-rose-900/50 bg-[#17121b] opacity-90 hover:border-rose-700/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-mono text-slate-400">{cand.id}</span>
                          {cand.recommended && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              RECOMMENDED
                            </span>
                          )}
                          {cand.pareto_optimal && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-500/15 text-amber-300 border border-amber-500/40">
                              PARETO
                            </span>
                          )}
                          {!cand.feasible && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              REJECTED
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-white">{cand.title}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-slate-400">Composite</div>
                        <div className="text-base font-mono font-bold text-cyan-300">
                          {cand.composite_score.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-2.5">
                      <ScoreBar label="Risk Red." value={cand.risk_reduction_score} tone="emerald" />
                      <ScoreBar label="Fuel Eff." value={cand.fuel_efficiency_score} tone="cyan" />
                      <ScoreBar label="Continuity" value={cand.mission_continuity_score} tone="sky" />
                      <ScoreBar label="Uncertainty" value={cand.uncertainty_score} tone="indigo" />
                      <ScoreBar label="Externality" value={cand.externality_score} tone="teal" />
                      <ScoreBar label="Fairness" value={cand.fairness_score} tone="violet" />
                      <ScoreBar label="Human Rev." value={cand.human_review_score} tone="amber" />
                    </div>

                    <div className="text-[11px] text-slate-300 space-y-1 border-t border-slate-800/80 pt-2">
                      <div>
                        <span className="text-slate-400">Cost Bearer: </span>
                        <span className="font-medium text-slate-200">{cand.cost_bearer}</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        ΔV: {cand.physics.total_delta_v_m_s.toFixed(3)} m/s · Fuel: {cand.physics.total_fuel_kg.toFixed(4)} kg ·
                        Miss: {cand.physics.expected_miss_km.toFixed(1)} km
                      </div>
                      {cand.rejected_reasons.length > 0 && (
                        <div className="mt-1.5 rounded bg-rose-950/60 border border-rose-500/30 p-1.5 text-[10px] text-rose-200">
                          {cand.rejected_reasons.map((r, idx) => (
                            <div key={idx}>• {r}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Candidate Deep Breakdown + Privacy Masked Summaries + Fairness */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Burden & Privacy Masked Operator Summaries */}
            <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#111827] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-violet-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Privacy-Preserving Cross-Operator Summaries & Burden Allocation
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  PROTOTYPE PRIVACY MASKING
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.operator_constraint_summaries.map(op => (
                  <div key={op.operator_label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">
                        {op.operator_label} ({op.object_id})
                      </span>
                      <span className="text-[10px] font-mono text-violet-300">{op.operator_id_masked}</span>
                    </div>
                    <div className="text-[11px] font-mono text-cyan-300">
                      Propulsion: {op.propulsion_type} · Maneuverable: {op.maneuverable ? 'YES' : 'NO'}
                    </div>
                    <p className="text-[11px] text-slate-400">{op.capability_summary}</p>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-400 border-t border-slate-800 pt-2">{result.privacy_explanation}</p>

              {selectedCandidate && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs space-y-1.5">
                  <div className="font-semibold text-cyan-300 flex items-center gap-2">
                    <Fuel className="w-3.5 h-3.5" />
                    Selected Candidate Burden Breakdown: {selectedCandidate.id}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                    <div>Op A Fuel: {selectedCandidate.burden_distribution.operator_a_fuel_kg.toFixed(4)} kg</div>
                    <div>Op B Fuel: {selectedCandidate.burden_distribution.operator_b_fuel_kg.toFixed(4)} kg</div>
                    <div>Op A Downtime: {selectedCandidate.burden_distribution.operator_a_downtime_minutes.toFixed(1)} min</div>
                    <div>Op B Downtime: {selectedCandidate.burden_distribution.operator_b_downtime_minutes.toFixed(1)} min</div>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {selectedCandidate.burden_distribution.fairness_summary}
                  </div>
                </div>
              )}
            </div>

            {/* Assumptions, Uncertainties & Explanation */}
            <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Assumptions, Uncertainties & Narrative
                </h3>
              </div>
              <div className="text-xs text-slate-300">{result.explanation?.summary}</div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">Assumptions</div>
                <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                  {result.assumptions.map((a, idx) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">Uncertainties & Missing Inputs</div>
                <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
                  {result.uncertainties.map((u, idx) => (
                    <li key={idx}>{u}</li>
                  ))}
                  {result.missing_inputs.length === 0 ? (
                    <li className="text-emerald-300">No missing required ephemeris/covariance inputs.</li>
                  ) : (
                    result.missing_inputs.map((m, idx) => (
                      <li key={`miss-${idx}`} className="text-rose-300">
                        {m}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Human Two-Person Governance + Auditable SHA-256 Evidence Packet Drawer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Two-Person Review Panel (NEVER executes commands) */}
            <div className="rounded-xl border border-emerald-500/30 bg-[#101a24] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Human-in-the-Loop Two-Person Governance
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-500/30">
                  Command Execution: DISABLED
                </span>
              </div>

              <div className="text-[11px] text-slate-300">
                {result.review_state.command_status_note}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5">
                  <div className="text-slate-400 font-mono">1st Reviewer</div>
                  {result.review_state.first_reviewer ? (
                    <div className="text-emerald-300 font-semibold mt-0.5">
                      {result.review_state.first_reviewer.reviewer_id} ({result.review_state.first_reviewer.reviewer_role})
                    </div>
                  ) : (
                    <div className="text-slate-500 mt-0.5">Awaiting 1st human review</div>
                  )}
                </div>
                <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5">
                  <div className="text-slate-400 font-mono">2nd Reviewer (Must Be Distinct)</div>
                  {result.review_state.second_reviewer ? (
                    <div className="text-emerald-300 font-semibold mt-0.5">
                      {result.review_state.second_reviewer.reviewer_id} ({result.review_state.second_reviewer.reviewer_role})
                    </div>
                  ) : (
                    <div className="text-slate-500 mt-0.5">Awaiting 2nd independent human review</div>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-slate-400" htmlFor="oc-reviewer-select">
                    Acting Reviewer Identity:
                  </label>
                  <select
                    id="oc-reviewer-select"
                    value={reviewerId}
                    onChange={e => setReviewerId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
                  >
                    {allUsers.map(u => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.name} ({u.user_id} · {u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  aria-label="Reviewer Sign-off Notes"
                  placeholder="Optional human verification notes (propellant margin, corridor clearance)..."
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
                />

                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={safetyAcknowledged}
                    onChange={e => setSafetyAcknowledged(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <span>I acknowledge this is decision support only — no flight command is transmitted.</span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleApproveReview()}
                    disabled={
                      result.status === 'INSUFFICIENT_DATA' ||
                      result.review_state.status === 'SECOND_REVIEW_COMPLETE' ||
                      result.review_state.status === 'REJECTED' ||
                      !selectedCandidate?.feasible
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 disabled:opacity-45"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {result.review_state.status === 'FIRST_REVIEW_COMPLETE'
                      ? 'Record 2nd Human Review'
                      : 'Record 1st Human Review'}
                  </button>

                  <input
                    type="text"
                    aria-label="Rejection or Clarification Reason"
                    placeholder="Reason for rejection or clarification..."
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    className="flex-1 min-w-[160px] bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRejectOrClarify('clarification')}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                  >
                    Request Clarification
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRejectOrClarify('reject')}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject Option
                  </button>
                </div>

                {reviewFeedback && (
                  <div className="text-[11px] text-emerald-300 font-mono bg-emerald-950/50 border border-emerald-500/30 rounded px-2.5 py-1.5">
                    {reviewFeedback}
                  </div>
                )}
              </div>
            </div>

            {/* Auditable Evidence Packet & SHA-256 Drawer */}
            <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Canonical Evidence Packet & SHA-256 Digest
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEvidenceDrawer(prev => !prev)}
                    className="px-2.5 py-1 rounded text-[11px] font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:border-cyan-500/50 flex items-center gap-1"
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
                    {showEvidenceDrawer ? 'Hide Evidence JSON' : 'Inspect Evidence Drawer'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadEvidence}
                    className="px-2.5 py-1 rounded text-[11px] font-medium border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export JSON
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
                <div className="text-[10px] font-mono uppercase text-slate-400">Audit SHA-256 Hash</div>
                <div
                  data-testid="audit-sha256-hash"
                  className="text-xs font-mono text-cyan-300 break-all select-all"
                >
                  {result.audit_hash_sha256}
                </div>
                <div className="text-[10px] text-slate-400">
                  Deterministic digest over inputs, scoring weights, engine version, candidate physics, and Pareto frontier.
                </div>
              </div>

              {showEvidenceDrawer && (
                <pre
                  data-testid="evidence-packet-json"
                  className="max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-[10px] font-mono text-slate-300"
                >
                  {JSON.stringify(result.evidence_packet, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
