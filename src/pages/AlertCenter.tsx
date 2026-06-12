import { useWebSocket } from '../hooks/useWebSocket';

export default function AlertCenter() {
  const { messages, isConnected } = useWebSocket('/ws/alerts');
  return (
    <div className="flex flex-col md:flex-row gap-card-gap h-full min-h-[800px]">
      {/* Left Pane: Alert List */}
      <section className="w-full md:w-[400px] flex flex-col glass rounded-xl overflow-hidden shadow-2xl shadow-black/40">
        <div className="p-inner-padding border-b border-outline-variant/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2">
              <span className="material-symbols-outlined">format_list_bulleted</span>
              Active Alerts
            </h2>
            <span className="bg-error/20 text-error font-label-mono text-[10px] px-2 py-0.5 rounded-full border border-error/30 animate-pulse">4 CRITICAL</span>
          </div>
          <div className="flex gap-2 mb-2">
            <button className="flex-1 py-1 rounded bg-surface-container-highest text-primary font-label-mono text-label-mono border border-primary/20">All</button>
            <button className="flex-1 py-1 rounded hover:bg-surface-container-highest text-on-surface-variant font-label-mono text-label-mono transition-colors">Critical</button>
            <button className="flex-1 py-1 rounded hover:bg-surface-container-highest text-on-surface-variant font-label-mono text-label-mono transition-colors">Warning</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scroll-hide p-2 space-y-2">
          {/* Alert Item (Critical) */}
          <div className="p-3 glass border-l-4 border-l-error rounded-lg cursor-pointer hover:bg-surface-container-highest/40 transition-all group">
            <div className="flex justify-between items-start mb-1">
              <span className="font-label-mono text-label-mono text-error font-bold">STARLINK-3021</span>
              <span className="font-label-mono text-[10px] text-on-surface-variant/60">2m ago</span>
            </div>
            <div className="font-headline-sm text-[16px] text-on-surface mb-1">Proximal Collision Risk</div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-error text-[14px]">error</span>
              <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Type: Collision Vector</span>
            </div>
          </div>
          {/* Alert Item (Warning) */}
          <div className="p-3 bg-surface-container-low border-l-4 border-l-secondary rounded-lg cursor-pointer hover:bg-surface-container-highest/40 transition-all">
            <div className="flex justify-between items-start mb-1">
              <span className="font-label-mono text-label-mono text-secondary font-bold">GOES-16-MOD</span>
              <span className="font-label-mono text-[10px] text-on-surface-variant/60">12m ago</span>
            </div>
            <div className="font-headline-sm text-[16px] text-on-surface mb-1">Solar Radiation Anomaly</div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[14px]">warning</span>
              <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Type: Space Weather</span>
            </div>
          </div>
          {/* Alert Item (Critical - Selected State) */}
          <div className="p-3 bg-primary-container/20 border-l-4 border-l-primary rounded-lg cursor-pointer border border-primary/30 ring-1 ring-primary/20">
            <div className="flex justify-between items-start mb-1">
              <span className="font-label-mono text-label-mono text-primary font-bold">SENTINEL-6A</span>
              <span className="font-label-mono text-[10px] text-on-surface-variant/60">24m ago</span>
            </div>
            <div className="font-headline-sm text-[16px] text-on-surface mb-1">Orbital Path Deviation</div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[14px]">info</span>
              <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Type: Navigation Sync</span>
            </div>
          </div>
          {/* More Items */}
          <div className="p-3 bg-surface-container-low border-l-4 border-l-on-surface-variant/30 rounded-lg cursor-pointer hover:bg-surface-container-highest/40 transition-all">
            <div className="flex justify-between items-start mb-1">
              <span className="font-label-mono text-label-mono text-on-surface-variant font-bold">COSMOS-2251</span>
              <span className="font-label-mono text-[10px] text-on-surface-variant/60">1h 12m ago</span>
            </div>
            <div className="font-headline-sm text-[16px] text-on-surface mb-1">Debris Cloud Proximity</div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-[14px]">cloud</span>
              <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Type: Environmental</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right Pane: Detailed View */}
      <section className="flex-1 flex flex-col gap-card-gap">
        {/* Header Detail */}
        <div className="glass p-inner-padding rounded-xl flex justify-between items-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-1">
              <span className="bg-primary/20 text-primary p-1 rounded-full material-symbols-outlined">satellite_alt</span>
              <h3 className="font-display-lg text-display-lg text-on-surface">SENTINEL-6A</h3>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col">
                <span className="font-label-mono text-[10px] text-on-surface-variant/60 uppercase">Status</span>
                <span className="font-body-md text-primary">Operational / Monitoring</span>
              </div>
              <div className="flex flex-col border-l border-outline-variant/20 pl-4">
                <span className="font-label-mono text-[10px] text-on-surface-variant/60 uppercase">Altitude</span>
                <span className="font-body-md text-on-surface">1,336 km</span>
              </div>
              <div className="flex flex-col border-l border-outline-variant/20 pl-4">
                <span className="font-label-mono text-[10px] text-on-surface-variant/60 uppercase">Velocity</span>
                <span className="font-body-md text-on-surface">7.48 km/s</span>
              </div>
            </div>
          </div>
          <div className="relative z-10 flex gap-3">
            <button className="px-6 py-2 border border-outline-variant/50 rounded-lg font-bold hover:bg-surface-container-highest transition-all">Acknowledge</button>
            <button className="px-6 py-2 bg-error text-on-error font-bold rounded-lg shadow-lg shadow-error/20 hover:brightness-110 active:scale-95 transition-all">Escalate</button>
          </div>
        </div>

        {/* Content Grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-card-gap overflow-hidden min-h-[400px]">
          {/* Mini-Map View */}
          <div className="glass rounded-xl flex flex-col relative overflow-hidden group">
            <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface/50 relative z-20">
              <h4 className="font-headline-sm text-[16px] text-primary flex items-center gap-2 uppercase tracking-wider">
                <span className="material-symbols-outlined">location_on</span>
                Incident Area Map
              </h4>
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span className="font-label-mono text-[10px] text-on-surface-variant">LIVE_SAT_FEED</span>
              </div>
            </div>
            <div className="flex-1 relative bg-black/40">
              <img className="w-full h-full object-cover opacity-60" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDO2V3669GhHilVugQwM6Sh46OuXq7fxigGoZTNRSomtoGjDh56QRTr1SzswL7tXQlDeyvHe1kuhuQCDttycfL6LCbAz6WlQVIIitvR1relwQZOACZUbhCsi71QUI-EAL4G_rysY6YTfctmq401CwOzaT8dkfjHVgmJs4Te--fnsSD6oHrDMDukErOaW87Cm7McABikxGCvPAcHlQMzRSQOF5OBkdeU8VxSIvKaJ1f8KMkCfn_O3BJw6ojPvq8UEwYJ7pWnlksctIw" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 border-2 border-primary/40 rounded-full animate-ping opacity-20"></div>
                <div className="w-16 h-16 border border-primary/60 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_15px_#b4c5ff]"></div>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 p-3 glass rounded-lg text-on-surface">
                <div className="font-label-mono text-[10px] text-on-surface-variant mb-1 uppercase">Target Lat/Long</div>
                <div className="font-label-mono text-label-mono">42.3601° N, 71.0589° W</div>
              </div>
            </div>
          </div>

          {/* Probability & Stats */}
          <div className="flex flex-col gap-card-gap overflow-hidden">
            {/* Probability Chart */}
            <div className="glass rounded-xl p-inner-padding flex-1 flex flex-col">
              <h4 className="font-headline-sm text-[16px] text-primary flex items-center gap-2 uppercase tracking-wider mb-4">
                <span className="material-symbols-outlined">legend_toggle</span>
                Collision Probability
              </h4>
              <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between font-label-mono text-[11px] text-on-surface-variant">
                      <span>Current Risk Profile</span>
                      <span className="text-error font-bold">1:4,200</span>
                    </div>
                    <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                      <div className="h-full bg-error" style={{ width: '72%' }}></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between font-label-mono text-[11px] text-on-surface-variant">
                      <span>Mean Uncertainty</span>
                      <span className="text-primary">0.02%</span>
                    </div>
                    <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: '15%' }}></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between font-label-mono text-[11px] text-on-surface-variant">
                      <span>Sync Confidence</span>
                      <span className="text-secondary">98.4%</span>
                    </div>
                    <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                      <div className="h-full bg-secondary" style={{ width: '98%' }}></div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-outline-variant/10">
                  <div className="font-label-mono text-[10px] text-on-surface-variant/60 uppercase mb-2">Trend Analysis (T-24h)</div>
                  <div className="h-16 flex items-end gap-1">
                    <div className="flex-1 bg-primary/20 h-[30%] hover:bg-primary/40 transition-all rounded-t-sm"></div>
                    <div className="flex-1 bg-primary/20 h-[45%] hover:bg-primary/40 transition-all rounded-t-sm"></div>
                    <div className="flex-1 bg-primary/20 h-[40%] hover:bg-primary/40 transition-all rounded-t-sm"></div>
                    <div className="flex-1 bg-error/20 h-[80%] hover:bg-error/40 transition-all rounded-t-sm"></div>
                    <div className="flex-1 bg-error/30 h-[90%] hover:bg-error/50 transition-all rounded-t-sm"></div>
                    <div className="flex-1 bg-error/40 h-[100%] hover:bg-error/60 transition-all rounded-t-sm"></div>
                    <div className="flex-1 bg-error/30 h-[85%] hover:bg-error/50 transition-all rounded-t-sm"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* System Logs */}
            <div className="glass rounded-xl p-inner-padding h-[180px] flex flex-col overflow-hidden">
              <h4 className="font-headline-sm text-[16px] text-primary flex items-center gap-2 uppercase tracking-wider mb-2">
                <span className="material-symbols-outlined">terminal</span>
                Event Narrative {isConnected ? <span className="text-secondary text-[10px] ml-2 animate-pulse">(LIVE)</span> : <span className="text-error text-[10px] ml-2">(OFFLINE)</span>}
              </h4>
              <div className="flex-1 overflow-y-auto font-label-mono text-[11px] text-on-surface-variant/80 space-y-1 scroll-hide custom-scrollbar">
                <p><span className="text-primary">[12:21:04]</span> INITIATING SCAN: Sector 7G-Alpha</p>
                <p><span className="text-primary">[12:21:45]</span> OBJECT IDENTIFIED: Sentinel-6A (NORAD ID: 46984)</p>
                <p><span className="text-error">[12:22:12]</span> ANOMALY DETECTED: Path deviation &gt; 0.05%</p>
                
                {messages.map((msg, idx) => (
                  <p key={idx}><span className="text-secondary">[{new Date().toLocaleTimeString()}]</span> LIVE EVENT: {msg.data}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
