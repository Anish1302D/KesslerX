import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, ReferenceLine
} from 'recharts';

interface Preset {
  id: string;
  name: string;
  description: string;
  object_a: { name: string; tle_line1: string; tle_line2: string };
  object_b: { name: string; tle_line1: string; tle_line2: string };
}

interface ManeuverPlan {
  risk: string;
  delta_v_m_s: number;
  burn_direction: string;
  burn_duration_seconds: number;
  burn_time_utc: string;
  expected_miss_distance_km: number;
  fuel_cost_kg: number;
  confidence_pct: number;
  explanation: string;
}

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const RISK_COLORS: Record<string, string> = {
  SAFE: '#22c55e',
  LOW: '#3b82f6',
  MEDIUM: '#eab308',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

const RISK_BG: Record<string, string> = {
  SAFE: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  LOW: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  MEDIUM: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  HIGH: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  CRITICAL: 'bg-red-500/10 border-red-500/30 text-red-400',
};

export default function ConjunctionAnalysis() {
  // Form state
  const [tle1Line1, setTle1Line1] = useState('');
  const [tle1Line2, setTle1Line2] = useState('');
  const [tle2Line1, setTle2Line1] = useState('');
  const [tle2Line2, setTle2Line2] = useState('');
  const [nameA, setNameA] = useState('Object A');
  const [nameB, setNameB] = useState('Object B');

  // Analysis state
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Maneuver state
  const [maneuverPlan, setManeuverPlan] = useState<ManeuverPlan | null>(null);
  const [maneuverLoading, setManeuverLoading] = useState(false);

  // Load presets
  useEffect(() => {
    fetch(`${API}/api/conjunction/presets`)
      .then(r => r.json())
      .then(data => setPresets(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadPreset = (preset: Preset) => {
    setTle1Line1(preset.object_a.tle_line1);
    setTle1Line2(preset.object_a.tle_line2);
    setTle2Line1(preset.object_b.tle_line1);
    setTle2Line2(preset.object_b.tle_line2);
    setNameA(preset.object_a.name);
    setNameB(preset.object_b.name);
    setResult(null);
    setManeuverPlan(null);
    setError(null);
  };

  const runAnalysis = async () => {
    if (!tle1Line1 || !tle1Line2 || !tle2Line1 || !tle2Line2) {
      setError('Please fill in all TLE fields');
      return;
    }
    setLoading(true);
    setProgress(0);
    setResult(null);
    setManeuverPlan(null);
    setError(null);

    // Simulate progress bar
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 15, 90));
    }, 300);

    try {
      const response = await fetch(`${API}/api/conjunction/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tle1_line1: tle1Line1.trim(),
          tle1_line2: tle1Line2.trim(),
          tle2_line1: tle2Line1.trim(),
          tle2_line2: tle2Line2.trim(),
          name_a: nameA,
          name_b: nameB,
          duration_hours: 24,
          step_seconds: 10,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(`Analysis failed: ${e.message}`);
    } finally {
      clearInterval(progressInterval);
      setProgress(100);
      setTimeout(() => setLoading(false), 500);
    }
  };

  const generateManeuver = async () => {
    if (!result) return;
    setManeuverLoading(true);
    try {
      const response = await fetch(`${API}/api/ai/maneuver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conjunction_data: result }),
      });
      const plan = await response.json();
      setManeuverPlan(plan);
    } catch (e: any) {
      setError(`Maneuver planning failed: ${e.message}`);
    } finally {
      setManeuverLoading(false);
    }
  };

  const riskLevel = result?.risk_level || 'SAFE';

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 text-primary mb-2">
            <span className="material-symbols-outlined">track_changes</span>
            <h2 className="font-headline-md text-headline-md tracking-tight uppercase">Conjunction Analysis</h2>
          </div>
          <p className="text-on-surface-variant font-body-lg max-w-2xl">
            SGP4-powered orbital propagation engine. Analyze close approaches between any two TLE-defined objects.
          </p>
        </div>
      </div>

      {/* Input Section */}
      <div className="grid grid-cols-12 gap-card-gap">
        {/* Presets */}
        <div className="col-span-12 lg:col-span-3 space-y-3">
          <div className="glass rounded-xl p-4">
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">bookmark</span>
              Quick Presets
            </h3>
            <div className="space-y-2">
              {presets.map(p => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/10 border border-outline-variant/10 hover:border-primary/30 transition-all group"
                >
                  <div className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{p.name}</div>
                  <div className="text-[11px] text-on-surface-variant/70">{p.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TLE Inputs */}
        <div className="col-span-12 lg:col-span-9">
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Object A */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <h4 className="text-sm font-bold text-on-surface uppercase tracking-wider">Object A (Primary)</h4>
                </div>
                <input
                  value={nameA}
                  onChange={e => setNameA(e.target.value)}
                  className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-sm font-label-mono focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="Object name..."
                />
                <input
                  value={tle1Line1}
                  onChange={e => setTle1Line1(e.target.value)}
                  className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs font-label-mono focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="TLE Line 1: 1 25544U 98067A ..."
                />
                <input
                  value={tle1Line2}
                  onChange={e => setTle1Line2(e.target.value)}
                  className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs font-label-mono focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="TLE Line 2: 2 25544  51.6416 ..."
                />
              </div>

              {/* Object B */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <h4 className="text-sm font-bold text-on-surface uppercase tracking-wider">Object B (Secondary)</h4>
                </div>
                <input
                  value={nameB}
                  onChange={e => setNameB(e.target.value)}
                  className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-sm font-label-mono focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="Object name..."
                />
                <input
                  value={tle2Line1}
                  onChange={e => setTle2Line1(e.target.value)}
                  className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs font-label-mono focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="TLE Line 1: 1 44713U 19074A ..."
                />
                <input
                  value={tle2Line2}
                  onChange={e => setTle2Line2(e.target.value)}
                  className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs font-label-mono focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="TLE Line 2: 2 44713  53.0500 ..."
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="px-6 py-3 bg-primary-container text-white rounded-lg flex items-center gap-2 font-bold hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Propagating...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">rocket_launch</span>
                    Start Analysis
                  </>
                )}
              </button>
              {error && (
                <div className="text-error text-sm flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {error}
                </div>
              )}
            </div>

            {/* Progress bar */}
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <div className="flex justify-between text-xs text-on-surface-variant">
                    <span className="font-label-mono">SGP4 PROPAGATION</span>
                    <span className="font-label-mono">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 bg-surface-container-low rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                      style={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="text-[11px] text-on-surface-variant/60 font-label-mono">
                    Propagating {nameA} and {nameB} over 24-hour window at 10-second intervals (8,640 steps)...
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* KPI Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-card-gap">
              {/* Risk Level */}
              <div className={`glass rounded-xl p-4 border ${RISK_BG[riskLevel]}`}>
                <div className="text-[10px] uppercase tracking-widest mb-1 opacity-70">Risk Level</div>
                <div className="text-2xl font-bold">{riskLevel}</div>
              </div>
              {/* Min Distance */}
              <div className="glass rounded-xl p-4">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Min Distance</div>
                <div className="text-xl font-bold text-on-surface">{result.min_distance_km?.toFixed(2)} <span className="text-sm font-normal text-on-surface-variant">km</span></div>
              </div>
              {/* Relative Velocity */}
              <div className="glass rounded-xl p-4">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Rel. Velocity</div>
                <div className="text-xl font-bold text-on-surface">{result.relative_velocity_km_s?.toFixed(2)} <span className="text-sm font-normal text-on-surface-variant">km/s</span></div>
              </div>
              {/* TCA */}
              <div className="glass rounded-xl p-4">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">TCA</div>
                <div className="text-sm font-label-mono text-primary">{result.tca ? new Date(result.tca).toUTCString().slice(0, -4) : 'N/A'}</div>
              </div>
              {/* Collision Probability */}
              <div className="glass rounded-xl p-4">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">P(Collision)</div>
                <div className="text-xl font-bold" style={{ color: RISK_COLORS[riskLevel] }}>{result.collision_probability?.toExponential(2)}</div>
              </div>
              {/* Total Steps */}
              <div className="glass rounded-xl p-4">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Analysis Steps</div>
                <div className="text-xl font-bold text-on-surface">{result.total_steps?.toLocaleString()}</div>
              </div>
            </div>

            {/* Recommended Action */}
            <div className={`glass rounded-xl p-5 border ${RISK_BG[riskLevel]}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined">shield</span>
                <h3 className="text-sm font-bold uppercase tracking-wider">Recommended Action</h3>
              </div>
              <p className="text-sm leading-relaxed opacity-90">{result.recommended_action}</p>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-12 gap-card-gap">
              {/* Separation Timeline */}
              <div className="col-span-12 lg:col-span-8 glass rounded-xl p-5">
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-primary">timeline</span>
                  Separation Distance Over 24 Hours
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.separation_timeline?.slice(0, 200)}>
                      <defs>
                        <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={RISK_COLORS[riskLevel]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={RISK_COLORS[riskLevel]} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="minutes"
                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        label={{ value: 'Time (min)', position: 'insideBottom', offset: -5, fill: '#9ca3af', fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        label={{ value: 'Distance (km)', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} km`, 'Distance']}
                        labelFormatter={(label: any) => `T+${Number(label).toFixed(0)} min`}
                      />
                      <Area type="monotone" dataKey="distance_km" stroke={RISK_COLORS[riskLevel]} fill="url(#distGrad)" strokeWidth={2} dot={false} />
                      <ReferenceLine y={result.min_distance_km} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'TCA', fill: '#ef4444', fontSize: 10 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Object Details */}
              <div className="col-span-12 lg:col-span-4 space-y-card-gap">
                {/* Object A at TCA */}
                {result.events?.[0]?.object_a_state && (
                  <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface">{result.object_a_name} at TCA</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-on-surface-variant">Altitude:</span> <span className="font-label-mono text-primary">{result.events[0].object_a_state.altitude_km?.toFixed(1)} km</span></div>
                      <div><span className="text-on-surface-variant">Speed:</span> <span className="font-label-mono text-primary">{result.events[0].object_a_state.speed_km_s?.toFixed(3)} km/s</span></div>
                      <div><span className="text-on-surface-variant">X:</span> <span className="font-label-mono">{result.events[0].object_a_state.x?.toFixed(1)}</span></div>
                      <div><span className="text-on-surface-variant">Y:</span> <span className="font-label-mono">{result.events[0].object_a_state.y?.toFixed(1)}</span></div>
                    </div>
                  </div>
                )}
                {/* Object B at TCA */}
                {result.events?.[0]?.object_b_state && (
                  <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface">{result.object_b_name} at TCA</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-on-surface-variant">Altitude:</span> <span className="font-label-mono text-red-400">{result.events[0].object_b_state.altitude_km?.toFixed(1)} km</span></div>
                      <div><span className="text-on-surface-variant">Speed:</span> <span className="font-label-mono text-red-400">{result.events[0].object_b_state.speed_km_s?.toFixed(3)} km/s</span></div>
                      <div><span className="text-on-surface-variant">X:</span> <span className="font-label-mono">{result.events[0].object_b_state.x?.toFixed(1)}</span></div>
                      <div><span className="text-on-surface-variant">Y:</span> <span className="font-label-mono">{result.events[0].object_b_state.y?.toFixed(1)}</span></div>
                    </div>
                  </div>
                )}

                {/* Generate Maneuver Button */}
                <button
                  onClick={generateManeuver}
                  disabled={maneuverLoading}
                  className="w-full px-4 py-3 bg-secondary/20 border border-secondary/30 text-secondary rounded-xl flex items-center justify-center gap-2 font-bold hover:bg-secondary/30 active:scale-95 transition-all disabled:opacity-50"
                >
                  {maneuverLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin"></div>
                      Generating Plan...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">smart_toy</span>
                      AI Maneuver Plan
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Relative Velocity Chart */}
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-secondary">speed</span>
                Relative Velocity Over Time
              </h3>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.separation_timeline?.slice(0, 200)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="minutes" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <Tooltip
                      contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: any) => [`${Number(value).toFixed(4)} km/s`, 'Rel. Velocity']}
                    />
                    <Line type="monotone" dataKey="relative_velocity_km_s" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Maneuver Plan Card */}
            <AnimatePresence>
              {maneuverPlan && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-6 border border-secondary/30"
                >
                  <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined">smart_toy</span>
                    AI Collision Avoidance Maneuver Plan
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    <div className="bg-surface-container-low/50 p-3 rounded-lg">
                      <div className="text-[10px] text-on-surface-variant uppercase mb-1">Burn Direction</div>
                      <div className="text-lg font-bold text-secondary">{maneuverPlan.burn_direction}</div>
                    </div>
                    <div className="bg-surface-container-low/50 p-3 rounded-lg">
                      <div className="text-[10px] text-on-surface-variant uppercase mb-1">Delta-V</div>
                      <div className="text-lg font-bold text-on-surface">{maneuverPlan.delta_v_m_s?.toFixed(3)} <span className="text-xs font-normal">m/s</span></div>
                    </div>
                    <div className="bg-surface-container-low/50 p-3 rounded-lg">
                      <div className="text-[10px] text-on-surface-variant uppercase mb-1">Burn Duration</div>
                      <div className="text-lg font-bold text-on-surface">{maneuverPlan.burn_duration_seconds?.toFixed(1)} <span className="text-xs font-normal">sec</span></div>
                    </div>
                    <div className="bg-surface-container-low/50 p-3 rounded-lg">
                      <div className="text-[10px] text-on-surface-variant uppercase mb-1">Fuel Cost</div>
                      <div className="text-lg font-bold text-on-surface">{maneuverPlan.fuel_cost_kg?.toFixed(3)} <span className="text-xs font-normal">kg</span></div>
                    </div>
                    <div className="bg-surface-container-low/50 p-3 rounded-lg">
                      <div className="text-[10px] text-on-surface-variant uppercase mb-1">Burn Time (UTC)</div>
                      <div className="text-xs font-label-mono text-primary">{maneuverPlan.burn_time_utc ? new Date(maneuverPlan.burn_time_utc).toUTCString().slice(0, -4) : 'N/A'}</div>
                    </div>
                    <div className="bg-surface-container-low/50 p-3 rounded-lg">
                      <div className="text-[10px] text-on-surface-variant uppercase mb-1">Expected Miss</div>
                      <div className="text-lg font-bold text-emerald-400">{maneuverPlan.expected_miss_distance_km?.toFixed(1)} <span className="text-xs font-normal">km</span></div>
                    </div>
                    <div className="bg-surface-container-low/50 p-3 rounded-lg">
                      <div className="text-[10px] text-on-surface-variant uppercase mb-1">Confidence</div>
                      <div className="text-lg font-bold text-emerald-400">{maneuverPlan.confidence_pct?.toFixed(1)}%</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${RISK_BG[maneuverPlan.risk || riskLevel]}`}>
                      <div className="text-[10px] uppercase mb-1 opacity-70">Risk After</div>
                      <div className="text-lg font-bold">{maneuverPlan.risk || riskLevel}</div>
                    </div>
                  </div>
                  {/* Explanation */}
                  <div className="bg-surface-container-low/30 p-4 rounded-lg border border-outline-variant/10">
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-secondary">info</span>
                      AI Analysis
                    </div>
                    <p className="text-sm text-on-surface/90 leading-relaxed">{maneuverPlan.explanation}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
