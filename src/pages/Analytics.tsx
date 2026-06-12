export default function Analytics() {
  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      {/* Scrollable Dashboard Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar z-10 pb-20">
        <div className="space-y-card-gap">
          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-card-gap mb-8">
            <div className="glass p-inner-padding rounded-xl relative overflow-hidden group">
              <div className="scanline-effect"></div>
              <div className="flex justify-between items-start mb-2">
                <span className="material-symbols-outlined text-primary bg-primary/10 p-2 rounded-lg">rocket</span>
                <span className="text-emerald-400 font-label-mono text-[10px]">+2.35%</span>
              </div>
              <p className="text-on-surface-variant text-label-mono uppercase tracking-widest">Active Satellites</p>
              <p className="font-stat-lg text-stat-lg text-primary mt-1">12,457</p>
            </div>
            <div className="glass p-inner-padding rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="material-symbols-outlined text-secondary bg-secondary/10 p-2 rounded-lg">bubble_chart</span>
                <span className="text-emerald-400 font-label-mono text-[10px]">+1.89%</span>
              </div>
              <p className="text-on-surface-variant text-label-mono uppercase tracking-widest">Tracked Debris</p>
              <p className="font-stat-lg text-stat-lg text-secondary mt-1">39,812</p>
            </div>
            <div className="glass p-inner-padding rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="material-symbols-outlined text-error bg-error/10 p-2 rounded-lg">warning</span>
                <span className="text-error font-label-mono text-[10px]">+12.1%</span>
              </div>
              <p className="text-on-surface-variant text-label-mono uppercase tracking-widest">High Risk Objects</p>
              <p className="font-stat-lg text-stat-lg text-error neon-text-error mt-1">37</p>
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
                    Debris Growth Projection
                  </h3>
                  <p className="text-on-surface-variant text-body-md mt-1">Cumulative object count in LEO (2010 - 2035 Estimated)</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 bg-surface-container-highest/50 border border-outline-variant/30 rounded text-label-mono text-[10px] hover:bg-primary/20 transition-all">LEO</button>
                  <button className="px-3 py-1 bg-transparent border border-outline-variant/30 rounded text-label-mono text-[10px] hover:bg-primary/20 transition-all">MEO</button>
                  <button className="px-3 py-1 bg-transparent border border-outline-variant/30 rounded text-label-mono text-[10px] hover:bg-primary/20 transition-all">GEO</button>
                </div>
              </div>
              {/* Placeholder for Chart */}
              <div className="h-[300px] w-full relative">
                <div className="absolute inset-0 flex items-end gap-1 px-4">
                  {/* Simulated Chart Bars */}
                  <div className="flex-1 bg-primary/20 border-t border-primary/40 h-[10%] rounded-t-sm"></div>
                  <div className="flex-1 bg-primary/20 border-t border-primary/40 h-[15%] rounded-t-sm"></div>
                  <div className="flex-1 bg-primary/20 border-t border-primary/40 h-[12%] rounded-t-sm"></div>
                  <div className="flex-1 bg-primary/20 border-t border-primary/40 h-[22%] rounded-t-sm"></div>
                  <div className="flex-1 bg-primary/20 border-t border-primary/40 h-[35%] rounded-t-sm"></div>
                  <div className="flex-1 bg-primary/40 border-t-2 border-primary h-[48%] rounded-t-sm relative group">
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-container-high p-2 rounded border border-primary/30 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                      <p className="text-label-mono text-[10px]">2024: 39,812</p>
                    </div>
                  </div>
                  <div className="flex-1 bg-primary/30 border-t border-primary/50 h-[55%] rounded-t-sm border-dashed"></div>
                  <div className="flex-1 bg-primary/20 border-t border-primary/30 h-[65%] rounded-t-sm border-dashed"></div>
                  <div className="flex-1 bg-primary/10 border-t border-primary/20 h-[82%] rounded-t-sm border-dashed"></div>
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
                  <img className="w-full h-full object-cover grayscale brightness-50 group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAhbECmngyPSIEEb014nOGDhhlWTiy0NvQ5-aZsFMxhFdWH-SqPl5xfttUmEV6qfc5g8a3k2khMu3hGnimyG8hQ0UIzMDYh04Gti5T4zgBX3DWl1E9Wwl3v5j2pTMFXI8jVRwWmKv44qIfAcY_vA4GKdbixwbITfBCHIkq0nmnj2TdL3L45JGblYmBC2w9XAg9N8c0DMTnPtQbE3EFvQgUEZxh1rwKhxNI36cVL_yzu3yLKRHguEYWdY3_IntkCwgjQgFtZLA1uDaU" />
                  <div className="absolute inset-0 bg-secondary/5 mix-blend-overlay"></div>
                  <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/40 backdrop-blur rounded">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                    <span className="text-[10px] font-label-mono text-on-surface">LEO CORRIDOR A7</span>
                  </div>
                </div>
                <div className="mt-4 flex justify-between text-[10px] font-label-mono text-outline">
                  <span>LOW DENSITY</span>
                  <div className="w-32 h-1 bg-gradient-to-right from-blue-500 via-yellow-500 to-red-500 mt-1.5 rounded-full"></div>
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
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Upcoming Close Approaches</h3>
                <button className="text-primary text-label-mono hover:underline">View All Catalog</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-label-mono text-xs">
                  <thead>
                    <tr className="text-outline border-b border-outline-variant/10">
                      <th className="pb-3 font-medium uppercase">Object Name</th>
                      <th className="pb-3 font-medium uppercase">TCA</th>
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
                      <td className="py-4">12:57:44 UTC</td>
                      <td className="py-4">0.14 km</td>
                      <td className="py-4 text-error font-bold">9.8e-3</td>
                      <td className="py-4">
                        <button className="px-3 py-1 bg-error/20 text-error rounded-lg hover:brightness-125">ALERT</button>
                      </td>
                    </tr>
                    <tr className="hover:bg-primary/5 transition-colors">
                      <td className="py-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary scale-75">category</span>
                        DEBRIS-88172
                      </td>
                      <td className="py-4">13:12:05 UTC</td>
                      <td className="py-4">1.22 km</td>
                      <td className="py-4 text-secondary">4.6e-5</td>
                      <td className="py-4">
                        <button className="px-3 py-1 bg-surface-container-highest text-on-surface-variant rounded-lg hover:text-primary">TRACK</button>
                      </td>
                    </tr>
                    <tr className="hover:bg-primary/5 transition-colors">
                      <td className="py-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary scale-75">satellite_alt</span>
                        GPS IIF-11
                      </td>
                      <td className="py-4">15:45:30 UTC</td>
                      <td className="py-4">4.80 km</td>
                      <td className="py-4 text-emerald-400">1.2e-7</td>
                      <td className="py-4">
                        <button className="px-3 py-1 bg-surface-container-highest text-on-surface-variant rounded-lg hover:text-primary">TRACK</button>
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
      <div className="absolute bottom-0 left-0 right-0 px-container-margin py-3 bg-surface-container-low/80 backdrop-blur-md border-t border-outline-variant/10 flex items-center gap-4 z-40">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary relative">
          <span className="material-symbols-outlined">smart_toy</span>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary border-2 border-surface-container-low rounded-full"></span>
        </div>
        <div className="flex-1 relative">
          <input className="w-full bg-surface-container-highest/50 border-none rounded-xl px-4 py-2 text-body-md focus:ring-1 focus:ring-primary/50 placeholder:text-outline/50" placeholder="Ask AI Copilot about orbital congestion trends..." type="text" />
          <button className="absolute right-2 top-1.5 p-1 bg-primary text-on-primary rounded transition-transform active:scale-90">
            <span className="material-symbols-outlined text-body-lg">arrow_forward</span>
          </button>
        </div>
        <div className="hidden lg:flex items-center gap-4">
          <button className="flex items-center gap-2 text-label-mono text-outline hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-body-md">description</span>
            Generate Report
          </button>
          <button className="flex items-center gap-2 text-label-mono text-outline hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-body-md">share</span>
            Share View
          </button>
        </div>
      </div>
    </div>
  );
}
