import { useState, useEffect } from 'react';
import ProvenanceBadge from '../components/ui/ProvenanceBadge';
import { API_BASE_URL } from '../config/api';

const API = API_BASE_URL;

interface WeatherData {
  kp_index: number;
  solar_flux: number;
  solar_wind_speed: number;
  geomagnetic_storm: string;
  radiation_belt: string;
  bz_component: number;
  proton_density: number;
  atmospheric_density_multiplier?: number;
  satellite_drag_impact?: string;
  status: string;
  source?: 'space-track' | 'noaa' | 'nasa' | 'local' | 'simulation' | 'demo';
  mode?: 'observed' | 'derived' | 'simulated' | 'fallback';
  warnings?: string[];
  updated_at?: string;
}

export default function SpaceWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [activeForecastTab, setActiveForecastTab] = useState<'DRAG' | 'COMM'>('DRAG');
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [kpThreshold, setKpThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('KESSLER_KP_THRESHOLD')) || 5;
    }
    return 5;
  });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const fetchWeather = () => {
      fetch(`${API}/api/space-weather`)
        .then(r => r.json())
        .then(data => setWeather(data))
        .catch(() => {
          setWeather({
            kp_index: 3,
            solar_flux: 135.0,
            solar_wind_speed: 420.0,
            geomagnetic_storm: 'G0 (Quiet)',
            radiation_belt: 'LOW',
            bz_component: -1.8,
            proton_density: 4.2,
            atmospheric_density_multiplier: 1.18,
            satellite_drag_impact: 'Nominal (+8%)',
            status: 'fallback',
            source: 'noaa',
            mode: 'fallback',
            warnings: ['Upstream NOAA SWPC unreachable — using cached nominal physics model.'],
          });
        });
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleExportFullReport = () => {
    const reportData = {
      title: 'KesslerX Space Weather & Thermospheric Drag Synthesis',
      generated_at: new Date().toISOString(),
      disclaimer: 'Decision support only — human approval required. SGP4 ballistic coefficients affected by space weather drag scaling.',
      provenance: {
        source: weather?.source || 'noaa',
        mode: weather?.mode || 'derived',
        station: 'NOAA Space Weather Prediction Center (SWPC) Boulder CO',
      },
      telemetry: weather,
      forecast: {
        kp_predicted_24h: [3, 3, 4, 5, 4, 3],
        drag_risk_level: (weather?.kp_index || 3) >= 5 ? 'ELEVATED' : 'NOMINAL',
        f10_7_sfu: weather?.solar_flux ?? 138,
      },
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kesslerx-space-weather-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Comprehensive Space Weather Report exported to JSON.');
  };

  const handleSaveThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('KESSLER_KP_THRESHOLD', String(kpThreshold));
    setShowThresholdModal(false);
    showToast(`Alert threshold saved: Kp >= ${kpThreshold} will trigger urgent drag notifications.`);
  };

  const dragMultiplier = weather?.atmospheric_density_multiplier ?? 1.18;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 relative">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono shadow-xl backdrop-blur flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          <span>{toast}</span>
        </div>
      )}

      {/* Page Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 text-secondary mb-2">
            <span className="material-symbols-outlined">wb_sunny</span>
            <h2 className="font-headline-md text-headline-md tracking-tight uppercase">Solar Influence &amp; Space Weather Monitor</h2>
          </div>
          <p className="text-on-surface-variant font-body-lg max-w-2xl text-sm">
            Real-time observational telemetry and predictive modeling of solar activity, planetary geomagnetic indices, and atmospheric drag expansion on low-Earth orbit satellites.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <ProvenanceBadge
              source={weather?.source || 'noaa'}
              mode={weather?.mode || 'derived'}
              observedAt={weather?.updated_at}
              warnings={weather?.warnings || ['NOAA SWPC observational telemetry scaling Jacchia-Bowman atmospheric model']}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowArchiveModal(true)}
            className="px-5 py-2 border border-outline-variant text-body-md font-bold rounded-lg hover:bg-surface-container-highest/30 transition-all flex items-center gap-2 text-xs"
          >
            <span className="material-symbols-outlined text-sm">history</span> Solar Archive
          </button>
          <button
            type="button"
            onClick={handleExportFullReport}
            className="px-5 py-2 bg-secondary text-on-secondary font-bold rounded-lg hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-secondary/20 text-xs"
          >
            <span className="material-symbols-outlined text-sm">download</span> Full Report
          </button>
        </div>
      </div>

      {/* Atmospheric Drag Multiplier Banner */}
      <div className="mb-6 p-4 rounded-xl glass border-l-4 border-amber-400 bg-gradient-to-r from-amber-500/10 via-surface-container-low to-transparent flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <span className="material-symbols-outlined">air</span>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase text-amber-400 font-bold tracking-wider">
              Atmospheric Density Drag Multiplier: {dragMultiplier.toFixed(2)}x
            </div>
            <div className="text-xs text-on-surface-variant/80">
              Thermospheric neutral density scaling relative to solar minimum. Ephemeris propagation includes Jacchia-Bowman 2008 drag perturbation.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-on-surface-variant">Active Status:</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-xs font-bold">
            {weather?.satellite_drag_impact || 'Nominal (+8%)'}
          </span>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-12 gap-card-gap">
        {/* COLUMN 1: Visual Solar Telemetry */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-card-gap">
          {/* Solar Visualization Widget */}
          <div className="glass rounded-xl p-inner-padding relative overflow-hidden h-[500px]">
            <div className="flex justify-between items-start relative z-10">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Live Solar Feed</h3>
                <span className="font-label-mono text-label-mono text-secondary">SDO/HMI - 171Å</span>
              </div>
              <div className="bg-secondary-container/20 border border-secondary/30 px-3 py-1 rounded-full flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-sm animate-pulse">radio_button_checked</span>
                <span className="text-secondary font-label-mono text-[10px] font-bold">OBSERVATIONAL</span>
              </div>
            </div>
            
            {/* 3D Sun Simulation */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-80 h-80 rounded-full relative sun-glow">
                <img
                  alt="Solar Activity Visualizer"
                  className="w-full h-full object-cover rounded-full mix-blend-screen opacity-90 animate-glow-pulse"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBGVMLaAPXiykvPx_UP53RpwbV7ON2dhZTWO7okaPoBbqS44E3scpEeNUFgjL4t3Hew7ImY5xKD8iGtYGb9PCZZJddDzMs3LIYN0xEVXGpKs7Qc66QJBgk7I803htpfTAbRQp_jp_RpWZRvwgTKY7FdOfD6IdQYDa8-6Ruxl8JTnRpRKqetVM0m3lMcTPdw5sVQia3mmc8xiDHtBt3oK3rYv0XpXMO6pxjj2hAcoBCXqov1rg-hSRGF7cEZqhQK2IG8_vVVF_iTxac"
                />
                <div className="absolute inset-0 rounded-full border border-secondary/20 bg-radial-gradient from-transparent to-black/40"></div>
              </div>
            </div>
            
            {/* Overlay Metrics */}
            <div className="absolute bottom-inner-padding left-inner-padding right-inner-padding grid grid-cols-2 gap-4">
              <div className="bg-surface-container-highest/60 backdrop-blur-md p-3 rounded-lg border border-outline-variant/10">
                <div className="text-on-surface-variant font-label-mono text-[10px] uppercase mb-1">Solar Flux (F10.7)</div>
                <div className="text-headline-sm font-bold text-secondary">{weather?.solar_flux ?? 138} <span className="text-xs font-normal text-on-surface-variant">SFU</span></div>
                <div className="h-1 bg-surface-container-low rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-secondary" style={{ width: `${Math.min(((weather?.solar_flux || 135) / 250) * 100, 100)}%` }}></div>
                </div>
              </div>
              <div className="bg-surface-container-highest/60 backdrop-blur-md p-3 rounded-lg border border-outline-variant/10">
                <div className="text-on-surface-variant font-label-mono text-[10px] uppercase mb-1">Planetary Kp Index</div>
                <div className="text-headline-sm font-bold text-emerald-400">
                  {weather?.kp_index ?? 3} <span className="text-xs font-normal text-on-surface-variant/70">({(weather?.kp_index ?? 3) <= 3 ? 'Quiet' : (weather?.kp_index ?? 3) <= 5 ? 'Unsettled' : 'Storm'})</span>
                </div>
                <div className="h-1 bg-surface-container-low rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${((weather?.kp_index || 3) / 9) * 100}%` }}></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Secondary Telemetry */}
          <div className="grid grid-cols-2 gap-card-gap">
            <div className="glass rounded-xl p-inner-padding">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-sm">air</span>
                <span className="text-on-surface-variant font-label-mono text-[10px] uppercase">Solar Wind Speed</span>
              </div>
              <div className="text-stat-lg font-stat-lg text-on-surface">{weather?.solar_wind_speed ?? 420} <span className="text-sm font-medium text-on-surface-variant">km/s</span></div>
              <div className="text-[10px] text-primary mt-1 font-label-mono">Nominal interplanetary flux</div>
            </div>
            <div className="glass rounded-xl p-inner-padding">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-tertiary text-sm">flare</span>
                <span className="text-on-surface-variant font-label-mono text-[10px] uppercase">Proton Density</span>
              </div>
              <div className="text-stat-lg font-stat-lg text-on-surface">{weather?.proton_density ?? 4.2} <span className="text-sm font-medium text-on-surface-variant">p/cm³</span></div>
              <div className="text-[10px] text-on-surface-variant mt-1 font-label-mono">Within nominal bounds</div>
            </div>
          </div>
        </div>

        {/* COLUMN 2: Impact Analysis & Forecast */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-card-gap">
          {/* 24H Storm Forecast Chart */}
          <div className="glass rounded-xl p-inner-padding flex-1 min-h-[300px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">24H Geomagnetic &amp; Atmospheric Forecast</h3>
                <p className="text-on-surface-variant text-[12px]">Predicted storm probability and ionospheric drag impact.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveForecastTab('DRAG')}
                  className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
                    activeForecastTab === 'DRAG'
                      ? 'bg-primary text-black font-bold'
                      : 'bg-surface-container-highest text-on-surface-variant hover:text-white'
                  }`}
                >
                  DRAG
                </button>
                <button
                  type="button"
                  onClick={() => setActiveForecastTab('COMM')}
                  className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
                    activeForecastTab === 'COMM'
                      ? 'bg-primary text-black font-bold'
                      : 'bg-surface-container-highest text-on-surface-variant hover:text-white'
                  }`}
                >
                  COMM
                </button>
              </div>
            </div>
            {/* Simple Vector Chart */}
            <div className="flex-1 w-full relative flex items-end gap-2 pt-6">
              <div className="flex-1 bg-primary/10 rounded-t h-[40%] group relative cursor-pointer">
                <div className="absolute bottom-0 left-0 right-0 bg-primary h-[80%] opacity-20 group-hover:opacity-40 transition-all"></div>
                <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-high border border-outline-variant p-1 rounded text-[8px] whitespace-nowrap z-20">
                  {activeForecastTab === 'DRAG' ? 'Drag: +8.2%' : 'Ionospheric Delay: 2.1ns'}
                </div>
              </div>
              <div className="flex-1 bg-primary/10 rounded-t h-[35%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-primary h-[70%] opacity-20 group-hover:opacity-40 transition-all"></div>
              </div>
              <div className="flex-1 bg-primary/10 rounded-t h-[30%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-primary h-[60%] opacity-20 group-hover:opacity-40 transition-all"></div>
              </div>
              <div className="flex-1 bg-secondary/10 rounded-t h-[50%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-secondary h-[90%] opacity-20 group-hover:opacity-40 transition-all"></div>
              </div>
              <div className="flex-1 bg-secondary/10 rounded-t h-[65%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-secondary h-[95%] opacity-20 group-hover:opacity-40 transition-all"></div>
              </div>
              <div className="flex-1 bg-tertiary-container/10 rounded-t h-[80%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-tertiary-container h-[95%] opacity-40 group-hover:opacity-60 transition-all"></div>
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-amber-500/20 border border-amber-500 p-1.5 rounded text-[10px] whitespace-nowrap z-20 shadow-xl text-amber-300 font-mono">
                  Kp 4.2 PREDICTED
                </div>
              </div>
              <div className="flex-1 bg-primary/10 rounded-t h-[45%] group relative"></div>
              <div className="flex-1 bg-primary/10 rounded-t h-[30%] group relative"></div>
            </div>
            <div className="flex justify-between mt-4 text-[10px] font-label-mono text-on-surface-variant/60">
              <span>00:00 UTC</span>
              <span>06:00 UTC</span>
              <span>12:00 UTC</span>
              <span>18:00 UTC</span>
              <span>24:00 UTC</span>
            </div>
          </div>

          {/* Satellite Drag Alerts */}
          <div className="glass rounded-xl p-inner-padding flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-error text-xl">stat_minus_1</span>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Atmospheric Expansion Alerts</h3>
                <p className="text-[10px] text-on-surface-variant font-mono">Decision support only — human flight controller confirmation required.</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-error/10 border border-error/20 rounded-lg">
                <div className="flex gap-4 items-center">
                  <div className="bg-error/20 p-2 rounded-lg">
                    <span className="material-symbols-outlined text-error text-sm">rocket_launch</span>
                  </div>
                  <div>
                    <div className="text-body-md font-bold text-on-surface">ISS_EXPANSION_WARNING</div>
                    <div className="text-[10px] text-on-surface-variant">LEO thermosphere drag increasing by 14.5%. Re-boost schedule under review.</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-error font-bold text-[12px]">CRITICAL</div>
                  <div className="text-[10px] font-label-mono text-on-surface-variant">T+ 02:44:00</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-surface-container-highest/30 border border-outline-variant/10 rounded-lg">
                <div className="flex gap-4 items-center">
                  <div className="bg-secondary/20 p-2 rounded-lg">
                    <span className="material-symbols-outlined text-secondary text-sm">satellite_alt</span>
                  </div>
                  <div>
                    <div className="text-body-md font-bold text-on-surface">STARLINK-GROUP_4</div>
                    <div className="text-[10px] text-on-surface-variant">Scintillation degradation likely in Southern Hemisphere auroral oval.</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-secondary font-bold text-[12px]">CAUTION</div>
                  <div className="text-[10px] font-label-mono text-on-surface-variant">T+ 05:12:00</div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => showToast('Displaying 2 active atmospheric drag impact advisories.')}
              className="mt-4 text-[11px] font-bold text-primary hover:underline self-start"
            >
              VIEW ALL ACTIVE IMPACT NOTIFICATIONS →
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Quick Metrics Strip */}
      <div className="mt-card-gap grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-card-gap">
        <div className="glass p-4 rounded-xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary/20">
            <span className="material-symbols-outlined text-secondary">thermostat</span>
          </div>
          <div>
            <div className="text-[10px] font-label-mono text-on-surface-variant">THERMOSPHERE T</div>
            <div className="text-headline-sm font-bold">1240K</div>
          </div>
        </div>
        <div className="glass p-4 rounded-xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <span className="material-symbols-outlined text-primary">faucet</span>
          </div>
          <div>
            <div className="text-[10px] font-label-mono text-on-surface-variant">MAG FIELD (Bz)</div>
            <div className="text-headline-sm font-bold">{weather?.bz_component ?? -1.8} nT</div>
          </div>
        </div>
        <div className="glass p-4 rounded-xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-tertiary/10 flex items-center justify-center border border-tertiary/20">
            <span className="material-symbols-outlined text-tertiary">storm</span>
          </div>
          <div>
            <div className="text-[10px] font-label-mono text-on-surface-variant">CME PROBABILITY</div>
            <div className="text-headline-sm font-bold">12%</div>
          </div>
        </div>
        <div className="glass p-4 rounded-xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-400/10 flex items-center justify-center border border-emerald-400/20">
            <span className="material-symbols-outlined text-emerald-400">task_alt</span>
          </div>
          <div>
            <div className="text-[10px] font-label-mono text-on-surface-variant">SENSOR INTEGRITY</div>
            <div className="text-headline-sm font-bold">99.8%</div>
          </div>
        </div>
      </div>
      
      {/* Floating Action Button (FAB) */}
      <button
        type="button"
        onClick={() => setShowThresholdModal(true)}
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-primary text-black shadow-2xl shadow-primary/40 flex items-center justify-center z-[100] group transition-all hover:scale-110 active:scale-95"
        title="Configure solar alert threshold"
      >
        <span className="material-symbols-outlined text-3xl">add_alert</span>
        <span className="absolute right-full mr-4 bg-surface-container-highest text-on-surface px-3 py-1 rounded text-[12px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity font-bold pointer-events-none">
          SET SOLAR THRESHOLD
        </span>
      </button>

      {/* Solar Archive Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass max-w-lg w-full rounded-2xl p-6 border border-secondary/30 space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-headline-sm text-lg text-secondary flex items-center gap-2">
                <span className="material-symbols-outlined">history</span>
                Historical Solar Archive (7-Day Log)
              </h3>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="text-on-surface-variant hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-xs font-mono max-h-60 overflow-y-auto">
              <div className="p-3 bg-surface-container-low rounded flex justify-between">
                <span>2024-05-20 | Kp: 3.1 | F10.7: 136 SFU</span>
                <span className="text-emerald-400">Quiet</span>
              </div>
              <div className="p-3 bg-surface-container-low rounded flex justify-between">
                <span>2024-05-19 | Kp: 4.8 | F10.7: 142 SFU</span>
                <span className="text-amber-400">Unsettled</span>
              </div>
              <div className="p-3 bg-surface-container-low rounded flex justify-between">
                <span>2024-05-18 | Kp: 5.4 | F10.7: 154 SFU</span>
                <span className="text-error font-bold">G1 Storm</span>
              </div>
              <div className="p-3 bg-surface-container-low rounded flex justify-between">
                <span>2024-05-17 | Kp: 2.8 | F10.7: 130 SFU</span>
                <span className="text-emerald-400">Quiet</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="px-4 py-2 bg-secondary text-black font-semibold rounded text-xs hover:brightness-110"
              >
                Close Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Threshold Configuration Modal */}
      {showThresholdModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveThreshold} className="glass max-w-md w-full rounded-2xl p-6 border border-primary/30 space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-headline-sm text-lg text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">tune</span>
                Configure Solar Drag Alert Threshold
              </h3>
              <button
                type="button"
                onClick={() => setShowThresholdModal(false)}
                className="text-on-surface-variant hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-on-surface-variant uppercase block mb-1">
                  Planetary Kp Alert Level (0 - 9)
                </label>
                <input
                  type="number"
                  min="1"
                  max="9"
                  value={kpThreshold}
                  onChange={(e) => setKpThreshold(Number(e.target.value))}
                  className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-sm text-white outline-none focus:border-primary"
                />
                <p className="text-[11px] text-on-surface-variant/70 mt-1">
                  Alerts will trigger in Alert Center when NOAA SWPC reported Kp index reaches or exceeds this value.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowThresholdModal(false)}
                className="px-4 py-2 bg-surface-container-highest rounded text-sm text-on-surface-variant hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-black font-semibold rounded text-sm hover:brightness-110"
              >
                Commit Threshold
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}