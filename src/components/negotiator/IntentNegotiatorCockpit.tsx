import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Compass, AlertTriangle, CheckCircle2, Scale, ArrowRight, UserCheck
} from 'lucide-react';

export interface CandidateOption {
  id: string;
  action_type: string;
  title: string;
  target_object: string;
  burn_direction?: string | null;
  delta_v_m_s: number;
  burn_duration_seconds: number;
  fuel_cost_kg: number;
  expected_miss_km: number;
  time_to_tca_hours: number;
  risk_reduction_score: number;
  fuel_efficiency_score: number;
  mission_continuity_score: number;
  confidence_score: number;
  composite_score: number;
  recommended: boolean;
  trade_off_summary: string;
  disclaimer: string;
}

export interface NegotiationData {
  event_id: string;
  primary_object: string;
  secondary_object: string;
  current_miss_km: number;
  collision_probability: number;
  tca_utc: string;
  operational_recommendation: string;
  candidates: CandidateOption[];
  audit_hash?: string;
  disclaimer: string;
}

interface IntentNegotiatorCockpitProps {
  data: NegotiationData;
  onSignOff?: (candidate: CandidateOption, approverRole: string, notes: string) => void;
}

export const IntentNegotiatorCockpit: React.FC<IntentNegotiatorCockpitProps> = ({
  data,
  onSignOff,
}) => {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    () => data.candidates.find(c => c.recommended)?.id || data.candidates[0]?.id || ''
  );
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [approverRole, setApproverRole] = useState('Safety Analyst');
  const [approverNotes, setApproverNotes] = useState('');
  const [confirmedSafety, setConfirmedSafety] = useState(false);
  const [signOffSuccess, setSignOffSuccess] = useState(false);

  const selectedCandidate = data.candidates.find(c => c.id === selectedCandidateId) || data.candidates[0];

  const handleConfirmSignOff = () => {
    if (!confirmedSafety || !selectedCandidate) return;
    onSignOff?.(selectedCandidate, approverRole, approverNotes);
    setSignOffSuccess(true);
    setTimeout(() => {
      setShowSignOffModal(false);
      setSignOffSuccess(false);
    }, 1800);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-500';
    if (score >= 60) return 'text-cyan-400 bg-cyan-500';
    if (score >= 40) return 'text-amber-400 bg-amber-500';
    return 'text-red-400 bg-red-500';
  };

  return (
    <div className="glass rounded-2xl p-6 border border-cyan-500/30 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-headline-sm font-bold text-white text-base tracking-wide">
                Intent-to-Action Negotiator
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase font-semibold">
                Differentiated SSA Feature
              </span>
            </div>
            <p className="text-xs text-white/60 font-mono mt-0.5">
              Evaluating 6 deterministic operational trajectories for {data.primary_object} × {data.secondary_object}
            </p>
          </div>
        </div>

        {/* Mandatory Safety Notice Badge */}
        <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Decision support only — human approval required</span>
        </div>
      </div>

      {/* Operational Recommendation Banner */}
      <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-start gap-3">
        <Compass className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
            Consensus Flight Recommendation
          </div>
          <div className="text-xs text-white/90 font-mono leading-relaxed">
            {data.operational_recommendation}
          </div>
        </div>
      </div>

      {/* 6 Candidates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.candidates.map((cand) => {
          const isSelected = cand.id === selectedCandidateId;
          const scoreClass = getScoreColor(cand.composite_score);
          const textColor = scoreClass.split(' ')[0];
          const bgColor = scoreClass.split(' ')[1];

          return (
            <motion.button
              key={cand.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setSelectedCandidateId(cand.id)}
              className={`text-left p-4 rounded-xl border transition-all relative flex flex-col justify-between ${
                isSelected
                  ? 'bg-cyan-950/50 border-cyan-400 shadow-[0_0_20px_rgba(0,174,239,0.25)]'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              {cand.recommended && (
                <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-black font-bold font-mono text-[9px] uppercase tracking-wider flex items-center gap-1 shadow-md">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Recommended
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[10px] text-white/50 uppercase">
                    {cand.action_type.replace('_', ' ')}
                  </span>
                  <span className={`font-mono font-bold text-xs ${textColor}`}>
                    Score: {cand.composite_score.toFixed(1)}/100
                  </span>
                </div>

                <h4 className="font-semibold text-sm text-white line-clamp-1">
                  {cand.title}
                </h4>

                <p className="text-[11px] text-white/70 line-clamp-2 leading-snug">
                  {cand.trade_off_summary}
                </p>
              </div>

              {/* Metric Mini-Bars */}
              <div className="space-y-1.5 pt-3 mt-3 border-t border-white/10 text-[10px] font-mono">
                <div className="flex justify-between text-white/60">
                  <span>Delta-V / Fuel:</span>
                  <span className="text-white">
                    {cand.delta_v_m_s > 0 ? `${cand.delta_v_m_s.toFixed(2)} m/s (${cand.fuel_cost_kg.toFixed(2)} kg)` : 'None'}
                  </span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Expected Miss:</span>
                  <span className="text-emerald-400">+{cand.expected_miss_km.toFixed(1)} km</span>
                </div>

                {/* Score Progress Bar */}
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full ${bgColor}`}
                    style={{ width: `${Math.min(cand.composite_score, 100)}%` }}
                  />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Selected Candidate Detailed Trade-off Breakdown & Sign-Off */}
      {selectedCandidate && (
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono uppercase text-cyan-400 tracking-wider font-semibold">
                Selected Trajectory Plan
              </span>
              <h4 className="text-base font-bold text-white">
                {selectedCandidate.title}
              </h4>
            </div>

            <button
              onClick={() => setShowSignOffModal(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
            >
              <UserCheck className="w-4 h-4" />
              Sign-Off Operational Intent (2-Person Rule)
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-black/40 border border-white/10 space-y-1">
              <div className="text-white/40 text-[10px] uppercase">Risk Reduction</div>
              <div className="text-lg font-bold text-emerald-400">
                {selectedCandidate.risk_reduction_score.toFixed(0)}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/10 space-y-1">
              <div className="text-white/40 text-[10px] uppercase">Fuel Efficiency</div>
              <div className="text-lg font-bold text-cyan-400">
                {selectedCandidate.fuel_efficiency_score.toFixed(0)}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/10 space-y-1">
              <div className="text-white/40 text-[10px] uppercase">Mission Continuity</div>
              <div className="text-lg font-bold text-purple-400">
                {selectedCandidate.mission_continuity_score.toFixed(0)}%
              </div>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/10 space-y-1">
              <div className="text-white/40 text-[10px] uppercase">Tracking Confidence</div>
              <div className="text-lg font-bold text-amber-400">
                {selectedCandidate.confidence_score.toFixed(0)}%
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-black/30 border border-white/10 text-xs text-white/80 font-mono leading-relaxed">
            <span className="text-cyan-400 font-bold mr-1">OPERATIONAL RATIONALE:</span>
            {selectedCandidate.trade_off_summary}
          </div>
        </div>
      )}

      {/* Two-Person Rule Sign-Off Modal */}
      <AnimatePresence>
        {showSignOffModal && selectedCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-[#0b1021] border border-cyan-500/40 rounded-2xl p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-base text-white">
                    Two-Person Operational Sign-Off
                  </h3>
                </div>
                <button
                  onClick={() => setShowSignOffModal(false)}
                  className="text-white/50 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {signOffSuccess ? (
                <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <h4 className="text-base font-bold text-emerald-300">
                    Operational Intent Signed & Recorded
                  </h4>
                  <p className="text-xs font-mono text-white/70">
                    Logged to immutable mission audit trail. Ready for ground station briefing.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1 text-xs font-mono">
                    <div className="text-white/50 uppercase text-[10px]">Candidate Selected</div>
                    <div className="text-white font-bold">{selectedCandidate.title}</div>
                    <div className="text-cyan-400">Expected Miss: +{selectedCandidate.expected_miss_km.toFixed(1)} km · Delta-V: {selectedCandidate.delta_v_m_s.toFixed(2)} m/s</div>
                  </div>

                  <div className="space-y-3 text-xs font-mono">
                    <div>
                      <label className="text-white/70 block mb-1">Approving Officer Role</label>
                      <select
                        value={approverRole}
                        onChange={(e) => setApproverRole(e.target.value)}
                        className="w-full bg-black/50 border border-white/20 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                      >
                        <option value="Safety Analyst">Safety Analyst (Sarah Jenkins)</option>
                        <option value="Mission Operations Lead">Mission Operations Lead (Anish)</option>
                        <option value="Flight Dynamics Lead">Flight Dynamics Lead (Marcus)</option>
                        <option value="Mission Manager">Mission Manager (Dr. Chen)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-white/70 block mb-1">Operational Sign-off Notes</label>
                      <textarea
                        value={approverNotes}
                        onChange={(e) => setApproverNotes(e.target.value)}
                        placeholder="e.g. Reviewed conjunction covariance; radar metric updates confirmed trajectory deviation."
                        rows={3}
                        className="w-full bg-black/50 border border-white/20 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400 resize-none"
                      />
                    </div>

                    <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <input
                        type="checkbox"
                        checked={confirmedSafety}
                        onChange={(e) => setConfirmedSafety(e.target.checked)}
                        className="mt-0.5 rounded text-cyan-500 focus:ring-0"
                      />
                      <span className="text-[11px] text-amber-200 leading-tight">
                        I acknowledge this action plan is for <strong>decision support only</strong>.
                        It does NOT transmit flight commands to spacecraft systems. Final command uplink requires authorized satellite control center confirmation.
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      onClick={() => setShowSignOffModal(false)}
                      className="px-4 py-2 rounded-xl text-white/60 hover:text-white font-mono text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!confirmedSafety}
                      onClick={handleConfirmSignOff}
                      className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold font-mono text-xs flex items-center gap-1.5 transition-all"
                    >
                      <span>Authorize Decision Support Plan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default IntentNegotiatorCockpit;
