import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProvenanceBadge from '../components/ui/ProvenanceBadge';

export default function Analytics() {
  const navigate = useNavigate();
  const [selectedOrbit, setSelectedOrbit] = useState<'LEO' | 'MEO' | 'GEO'>('LEO');
  const [aiQuery, setAiQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const orbitMetrics = {
    LEO: {
      satellites: '12,457',
      debris: '39,812',
      risk: '37',
      bars: [10, 15, 12, 22, 35, 48, 55, 65, 82],
      projectionYear: '2025: 42,100',
    },
    MEO: {
      satellites: '1,840',
      debris: '4,210',
      risk: '8',
      bars: [5, 8, 9, 12, 16, 20, 24, 28, 33],
      projectionYear: '2025: 4,600',
    },
    GEO: {
      satellites: '980',
      debris: '2,940',
      risk: '5',
      bars: [3, 4, 6, 8, 11, 14, 17, 19, 22],
      projectionYear: '2025: 3,100',
    },
  };

  const currentData = orbitMetrics[selectedOrbit];

  const handleAiSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiQuery.trim()) return;
    navigate('/copilot');
  };

  const handleShareView = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Analytics dashboard view URL copied to clipboard.');
    } catch {
      showToast('View URL ready for dispatch.');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      {/* Scrollable Dashboard Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar z-10 pb-24">
        <div className="space-y-card-gap">
          {/* Header & Provenance */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Orbital Congestion & Safety Analytics</h2>
              <p className="font-body-md text-on-surface-variant/70 text-xs mt-1">Multi-regime population modeling and collision frequency trends.</p>
            </div>
            <div className="flex items-center gap-2">
              <ProvenanceBadge source="space-track" mode="derived" warnings={['Analytical extrapolation based on 30-day ephemeris covariance']} />
            </div>
          </div>

          {toastMessage && (
            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs animate-fade-in flex items-center justify-between">
              <span>{toastMessage}</span>
              <button type="button" onClick={() => setToastMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
            </div>
          )}

          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-card-gap mb-8">
            <div className="glass p-inner-padding rounded-xl relative overflow-hidden group">
              <div className="scanline-effect"></div>
              <div className="flex justify-between items-start mb-2">
                <span className="material-symbols-outlined text-primary bg-primary/10 p-2 rounded-lg">rocket</span>
                <span className="text-emerald-400 font-label-mono text-[10px]">+2.35%</span>
              </div>
              <p className="text-on-surface-variant text-label-mono uppercase tracking-widest">Active Satellites ({selectedOrbit})</p>
              <p className="font-stat-lg text-stat-lg text-primary mt-1">{currentData.satellites}</p>
            </div>
            <div className="glass p-inner-padding rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="material-symbols-outlined text-secondary bg-secondary/10 p-2 rounded-lg">bubble_chart</span>
                <span className="text-emerald-400 font-label-mono text-[10px]">+1.89%</span>
              </div>
              <p className="text-on-surface-variant text-label-mono uppercase tracking-widest">Tracked Debris ({selectedOrbit})</p>
              <p className="font-stat-lg text-stat-lg text-secondary mt-1">{currentData.debris}</p>
            </div>
            <div className="glass p-inner-padding rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="material-symbols-outlined text-error bg-error/10 p-2 rounded-lg">warning</span>
                <span className="text-error font-label-mono text-[10px]">+12.1%</span>
              </div>
              <p className="text-on-surface-variant text-label-mono uppercase tracking-widest">High Risk Objects ({selectedOrbit})</p>
              <p className="font-stat-lg text-stat-lg text-error neon-text-error mt-1">{currentData.risk}</p>
            </div>
            <div className="glass p-inner-padding rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="material-symbols-outlined text-tertiary bg-tertiary/10 p-2 rounded-lg">bolt</span>
                <span className="text-yellow-400 font-label-mono text-[10px]">Moderate</span>
              </div>
              <p className="text-on-surface-variant text-label-mono uppercase tracking-widest">Space Weather</p>
              <p className="font-stat-lg text-stat-lg text-tertiary mt-1">Kp 5</p>
            </div>
          </div>

          {/* Main Analytics Grid */}
          <div className="grid grid-cols-12 gap-card-gap">
            {/* Large Chart: Debris Growth */}
            <div className="col-span-12 lg:col-span-8 glass rounded-xl p-inner-padding">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined">insights</span>
                    Debris Growth Projection ({selectedOrbit})
                  </h3>
                  <p className="text-on-surface-variant text-body-md mt-1">Cumulative object count in {selectedOrbit} (2010 - 2035 Estimated)</p>
                </div>
                <div className="flex gap-2">
                  {(['LEO', 'MEO', 'GEO'] as const).map((orbit) => (
                    <button
                      key={orbit}
                      type="button"
                      onClick={() => setSelectedOrbit(orbit)}
                      className={`px-3 py-1 rounded text-label-mono text-[10px] transition-all ${
                        selectedOrbit === orbit
                          ? 'bg-primary/20 border border-primary text-primary font-bold'
                          : 'bg-surface-container-highest/30 border border-outline-variant/30 text-on-surface-variant hover:bg-primary/10'
                      }`}
                    >
                      {orbit}
                    </button>
                  ))}
                </div>
              </div>
              {/* Chart visualization */}
              <div className="h-[300px] w-full relative">
                <div className="absolute inset-0 flex items-end gap-1 px-4">
                  {currentData.bars.map((heightPercent, idx) => (
                    <div
                      key={idx}
                      style={{ height: `${heightPercent}%` }}
                      className={`flex-1 rounded-t-sm transition-all duration-500 ${
                        idx === 5
                          ? 'bg-primary/40 border-t-2 border-primary relative group'
                          : idx > 5
                          ? 'bg-primary/20 border-t border-primary/40 border-dashed'
                          : 'bg-primary/20 border-t border-primary/40'
                      }`}
                    >
                      {idx === 5 && (
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-container-high p-2 rounded border border-primary/30 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none whitespace-nowrap">
                          <p className="text-label-mono text-[10px]">{currentData.projectionYear}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Axis Labels */}
                <div className="absolute bottom-[-24px] w-full flex justify-between text-outline text-label-mono px-4">
                  <span>2010</span><span>2015</span><span>2020</span><span>2025</span><span>2030</span><span>2035</span>
                </div>
              </div>
            </div>

            {/* Right Sidebar: Live Alerts & Heatmap */}
            <div className="col-span-12 lg:col-span-4 space-y-card-gap">
              {/* Congestion Heatmap */}
              <div className="glass rounded-xl p-inner-padding">
                <h3 className="font-headline-sm text-headline-sm text-secondary flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined">map</span>
                  Debris Density Map
                </h3>
                <div className="aspect-video relative rounded border border-outline-variant/10 overflow-hidden group">
                  <img
                    alt="Orbital density map"
                    className="w-full h-full object-cover grayscale brightness-50 group-hover:scale-110 transition-transform duration-700"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAhbECmngyPSIEEb014nOGDhhlWTiy0NvQ5-aZsFMxhFdWH-SqPl5xfttUmEV6qfc5g8a3k2khMu3hGnimyG8hQ0UIzMDYh04Gti5T4zgBX3DWl1E9Wwl3v5j2pTMFXI8jVRwWmKv44qIfAcY_vA4GKdbixwbITfBCHIkq0nmnj2TdL3L45JGblYmBC2w9XAg9N8c0DMTnPtQbE3EFvQgUEZxh1rwKhxNI36cVL_yzu3yLKRHguEYWdY3_IntkCwgjQgFtZLA1uDaU"
                  />
                  <div className="absolute inset-0 bg-secondary/5 mix-blend-overlay"></div>
                  <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/40 backdrop-blur rounded">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                    <span className="text-[10px] font-label-mono text-on-surface">LEO CORRIDOR A7</span>
                  </div>
                </div>
                <div className="mt-4 flex justify-between text-[10px] font-label-mono text-outline">
                  <span>LOW DENSITY</span>
                  <div className="w-32 h-1 bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500 mt-1.5 rounded-full"></div>
                  <span>CRITICAL</span>
                </div>
              </div>

              {/* Orbital Risk Index */}
              <div className="glass rounded-xl p-inner-padding">
                <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center justify-between mb-4">
                  Risk Index
                  <span className="material-symbols-outlined text-error">info</span>
                </h3>
                <div className="flex flex-col items-center py-4">
                  <div className="relative w-40 h-20 overflow-hidden">
                    <div className="w-40 h-40 border-[12px] border-surface-container-highest rounded-full"></div>
                    <div className="absolute top-0 w-40 h-40 border-[12px] border-transparent border-t-error border-l-error rounded-full rotate-[145deg]"></div>
                    <div className="absolute bottom-0 w-full text-center">
                      <p className="font-stat-lg text-stat-lg leading-none">72%</p>
                      <p className="text-label-mono text-error uppercase tracking-tighter mt-1">High Risk</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Multi-Metric Widgets */}
            <div className="col-span-12 lg:col-span-4 glass rounded-xl p-inner-padding">
              <h3 className="font-headline-sm text-headline-sm text-primary mb-4">Launch Trends</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant font-label-mono text-xs">COMMERCIAL</span>
                  <div className="flex-1 mx-4 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[78%]"></div>
                  </div>
                  <span className="text-primary font-label-mono text-xs">78%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant font-label-mono text-xs">GOVERNMENT</span>
                  <div className="flex-1 mx-4 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-secondary w-[15%]"></div>
                  </div>
                  <span className="text-secondary font-label-mono text-xs">15%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant font-label-mono text-xs">MILITARY</span>
                  <div className="flex-1 mx-4 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-tertiary w-[7%]"></div>
                  </div>
                  <span className="text-tertiary font-label-mono text-xs">07%</span>
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-8 glass rounded-xl p-inner-padding">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">Upcoming Close Approaches</h3>
                  <p className="text-xs text-on-surface-variant/70 font-mono">Decision support only — human flight director approval required.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/conjunction')}
                  className="text-primary text-label-mono text-xs hover:underline flex items-center gap-1"
                >
                  View Conjunction Assessment
                  <span className="material-symbols-outlined text-xs">arrow_forward</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-label-mono text-xs">
                  <thead>
                    <tr className="text-outline border-b border-outline-variant/10">
                      <th className="pb-3 font-medium uppercase">Object Name</th>
                      <th className="pb-3 font-medium uppercase">TCA Window</th>
                      <th className="pb-3 font-medium uppercase">Distance (km)</th>
                      <th className="pb-3 font-medium uppercase">Probability</th>
                      <th className="pb-3 font-medium uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    <tr className="hover:bg-primary/5 transition-colors">
                      <td className="py-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary scale-75">satellite_alt</span>
                        STARLINK-3021
                      </td>
                      <td className="py-4 font-mono text-amber-400">T + 12h 57m (UTC)</td>
                      <td className="py-4">0.14 km</td>
                      <td className="py-4 text-error font-bold">9.8e-3</td>
                      <td className="py-4">
                        <button
                          type="button"
                          onClick={() => navigate('/alerts')}
                          className="px-3 py-1 bg-error/20 text-error rounded-lg hover:brightness-125 transition-all text-xs font-bold"
                        >
                          ALERT
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-primary/5 transition-colors">
                      <td className="py-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary scale-75">category</span>
                        DEBRIS-88172
                      </td>
                      <td className="py-4 font-mono">T + 13h 12m (UTC)</td>
                      <td className="py-4">1.22 km</td>
                      <td className="py-4 text-secondary">4.6e-5</td>
                      <td className="py-4">
                        <button
                          type="button"
                          onClick={() => {
                            showToast('Tracking DEBRIS-88172 in orbital tracking pipeline.');
                            navigate('/');
                          }}
                          className="px-3 py-1 bg-surface-container-highest text-on-surface-variant rounded-lg hover:text-primary transition-all text-xs"
                        >
                          TRACK
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-primary/5 transition-colors">
                      <td className="py-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary scale-75">satellite_alt</span>
                        GPS IIF-11
                      </td>
                      <td className="py-4 font-mono">T + 15h 45m (UTC)</td>
                      <td className="py-4">4.80 km</td>
                      <td className="py-4 text-emerald-400">1.2e-7</td>
                      <td className="py-4">
                        <button
                          type="button"
                          onClick={() => {
                            showToast('Tracking GPS IIF-11 in orbital tracking pipeline.');
                            navigate('/');
                          }}
                          className="px-3 py-1 bg-surface-container-highest text-on-surface-variant rounded-lg hover:text-primary transition-all text-xs"
                        >
                          TRACK
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Copilot Quick Bar */}
      <form
        onSubmit={handleAiSubmit}
        className="absolute bottom-0 left-0 right-0 px-container-margin py-3 bg-surface-container-low/95 backdrop-blur-md border-t border-outline-variant/10 flex items-center gap-4 z-40"
      >
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary relative shrink-0">
          <span className="material-symbols-outlined">smart_toy</span>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary border-2 border-surface-container-low rounded-full"></span>
        </div>
        <div className="flex-1 relative">
          <input
            className="w-full bg-surface-container-highest/50 border-none rounded-xl px-4 py-2 text-body-md focus:ring-1 focus:ring-primary/50 placeholder:text-outline/50 outline-none text-white text-sm"
            placeholder="Ask AI Copilot about orbital congestion trends..."
            type="text"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
          />
          <button
            type="submit"
            className="absolute right-2 top-1.5 p-1 bg-primary text-black rounded transition-transform active:scale-90"
            title="Dispatch query to Kessler Copilot"
          >
            <span className="material-symbols-outlined text-body-lg">arrow_forward</span>
          </button>
        </div>
        <div className="hidden lg:flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="flex items-center gap-2 text-label-mono text-outline hover:text-primary transition-colors text-xs"
          >
            <span className="material-symbols-outlined text-body-md">description</span>
            Generate Report
          </button>
          <button
            type="button"
            onClick={handleShareView}
            className="flex items-center gap-2 text-label-mono text-outline hover:text-primary transition-colors text-xs"
          >
            <span className="material-symbols-outlined text-body-md">share</span>
            Share View
          </button>
        </div>
      </form>
    </div>
  );
}
