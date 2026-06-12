export default function SpaceWeather() {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
      {/* Page Header Area */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="flex items-center gap-3 text-secondary mb-2">
            <span className="material-symbols-outlined">wb_sunny</span>
            <h2 className="font-headline-md text-headline-md tracking-tight uppercase">Solar Influence Monitor</h2>
          </div>
          <p className="text-on-surface-variant font-body-lg max-w-2xl">Real-time telemetry and predictive modeling of solar activity and its specific impact on the orbital drag of Earth-stationed assets.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-6 py-2 border border-outline-variant text-body-md font-bold rounded-lg hover:bg-surface-container-highest/30 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">history</span> Archive
          </button>
          <button className="px-6 py-2 bg-secondary text-on-secondary font-bold rounded-lg hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-secondary/20">
            <span className="material-symbols-outlined text-sm">download</span> Full Report
          </button>
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
                <span className="text-secondary font-label-mono text-[10px] font-bold">LIVE STREAM</span>
              </div>
            </div>
            
            {/* 3D Sun Simulation Placeholder */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-80 h-80 rounded-full relative sun-glow">
                <img className="w-full h-full object-cover rounded-full mix-blend-screen opacity-90 animate-glow-pulse" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBGVMLaAPXiykvPx_UP53RpwbV7ON2dhZTWO7okaPoBbqS44E3scpEeNUFgjL4t3Hew7ImY5xKD8iGtYGb9PCZZJddDzMs3LIYN0xEVXGpKs7Qc66QJBgk7I803htpfTAbRQp_jp_RpWZRvwgTKY7FdOfD6IdQYDa8-6Ruxl8JTnRpRKqetVM0m3lMcTPdw5sVQia3mmc8xiDHtBt3oK3rYv0XpXMO6pxjj2hAcoBCXqov1rg-hSRGF7cEZqhQK2IG8_vVVF_iTxac" />
                <div className="absolute inset-0 rounded-full border border-secondary/20 bg-radial-gradient from-transparent to-black/40"></div>
              </div>
            </div>
            
            {/* Overlay Metrics */}
            <div className="absolute bottom-inner-padding left-inner-padding right-inner-padding grid grid-cols-2 gap-4">
              <div className="bg-surface-container-highest/40 backdrop-blur-md p-3 rounded-lg border border-outline-variant/10">
                <div className="text-on-surface-variant font-label-mono text-[10px] uppercase mb-1">Solar Activity</div>
                <div className="text-headline-sm font-bold text-secondary">MODERATE</div>
                <div className="h-1 bg-surface-container-low rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-secondary w-3/5"></div>
                </div>
              </div>
              <div className="bg-surface-container-highest/40 backdrop-blur-md p-3 rounded-lg border border-outline-variant/10">
                <div className="text-on-surface-variant font-label-mono text-[10px] uppercase mb-1">Kp Index</div>
                <div className="text-headline-sm font-bold text-emerald-400">5 <span className="text-sm font-normal text-on-surface-variant/60">(Stable)</span></div>
                <div className="h-1 bg-surface-container-low rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-emerald-400 w-2/5"></div>
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
              <div className="text-stat-lg font-stat-lg text-on-surface">450 <span className="text-sm font-medium text-on-surface-variant">km/s</span></div>
              <div className="text-[10px] text-primary mt-1 font-label-mono">↑ 12% vs last orbit</div>
            </div>
            <div className="glass rounded-xl p-inner-padding">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-tertiary text-sm">flare</span>
                <span className="text-on-surface-variant font-label-mono text-[10px] uppercase">Proton Flux</span>
              </div>
              <div className="text-stat-lg font-stat-lg text-on-surface">2.3 <span className="text-sm font-medium text-on-surface-variant">pfu</span></div>
              <div className="text-[10px] text-on-surface-variant mt-1 font-label-mono">Within nominal range</div>
            </div>
          </div>
        </div>

        {/* COLUMN 2: Impact Analysis & Forecast */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-card-gap">
          {/* 24H Storm Forecast Chart */}
          <div className="glass rounded-xl p-inner-padding flex-1 min-h-[300px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">24H Geomagnetic Forecast</h3>
                <p className="text-on-surface-variant text-[12px]">Predicted storm probability and ionospheric drag impact.</p>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1 bg-surface-container-highest rounded text-[10px] font-bold text-primary">DRAG</button>
                <button className="px-3 py-1 text-[10px] font-bold text-on-surface-variant">COMM</button>
              </div>
            </div>
            {/* Simple Vector Chart Placeholder */}
            <div className="flex-1 w-full relative flex items-end gap-1">
              {/* Mock Bars */}
              <div className="flex-1 bg-primary/10 rounded-t h-[40%] group relative cursor-pointer">
                <div className="absolute bottom-0 left-0 right-0 bg-primary h-[80%] opacity-20 group-hover:opacity-40 transition-all"></div>
                <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-high border border-outline-variant p-1 rounded text-[8px] whitespace-nowrap z-20">Drag: +2.1%</div>
              </div>
              <div className="flex-1 bg-primary/10 rounded-t h-[35%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-primary h-[70%] opacity-20 group-hover:opacity-40 transition-all"></div>
              </div>
              <div className="flex-1 bg-primary/10 rounded-t h-[30%] group relative"></div>
              <div className="flex-1 bg-secondary/10 rounded-t h-[50%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-secondary h-[90%] opacity-20 group-hover:opacity-40 transition-all"></div>
              </div>
              <div className="flex-1 bg-secondary/10 rounded-t h-[75%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-secondary h-[95%] opacity-20 group-hover:opacity-40 transition-all"></div>
              </div>
              <div className="flex-1 bg-tertiary-container/10 rounded-t h-[90%] group relative">
                <div className="absolute bottom-0 left-0 right-0 bg-tertiary-container h-[95%] opacity-40 group-hover:opacity-60 transition-all"></div>
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-error/20 border border-error p-2 rounded text-[10px] whitespace-nowrap z-20 shadow-xl text-error">MAJOR STORM PREDICTED</div>
              </div>
              <div className="flex-1 bg-primary/10 rounded-t h-[60%] group relative"></div>
              <div className="flex-1 bg-primary/10 rounded-t h-[40%] group relative"></div>
              <div className="flex-1 bg-primary/10 rounded-t h-[30%] group relative"></div>
            </div>
            <div className="flex justify-between mt-4 text-[10px] font-label-mono text-on-surface-variant/40">
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
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Atmospheric Expansion Alerts</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-error/10 border border-error/20 rounded-lg">
                <div className="flex gap-4 items-center">
                  <div className="bg-error/20 p-2 rounded-lg">
                    <span className="material-symbols-outlined text-error text-sm">rocket_launch</span>
                  </div>
                  <div>
                    <div className="text-body-md font-bold text-on-surface">ISS_EXPANSION_WARNING</div>
                    <div className="text-[10px] text-on-surface-variant">LEO drag increasing by 14.5%. Maneuver recommended.</div>
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
                    <div className="text-[10px] text-on-surface-variant">Telemetry interference likely in Southern Hemisphere.</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-secondary font-bold text-[12px]">CAUTION</div>
                  <div className="text-[10px] font-label-mono text-on-surface-variant">T+ 05:12:00</div>
                </div>
              </div>
            </div>
            <button className="mt-4 text-[11px] font-bold text-primary hover:underline self-start">VIEW ALL ACTIVE IMPACT NOTIFICATIONS →</button>
          </div>
        </div>
      </div>

      {/* Bottom Quick Metrics Strip */}
      <div className="mt-card-gap grid grid-cols-4 gap-card-gap">
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
            <div className="text-headline-sm font-bold">-2.1 nT</div>
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
      <button className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-primary text-on-primary shadow-2xl shadow-primary/40 flex items-center justify-center z-[100] group transition-all hover:scale-110 active:scale-95">
        <span className="material-symbols-outlined text-3xl">add_alert</span>
        <span className="absolute right-full mr-4 bg-surface-container-highest text-on-surface px-3 py-1 rounded text-[12px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity font-bold pointer-events-none">SET SOLAR THRESHOLD</span>
      </button>
    </div>
  );
}
