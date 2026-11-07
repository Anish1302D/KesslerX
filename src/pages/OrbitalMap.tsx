import { Suspense, lazy, useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import ObjectDetailsPanel from '../components/dashboard/ObjectDetailsPanel';
import type { CesiumGlobeRef, FollowState } from '../components/dashboard/CesiumGlobe';
import CesiumErrorBoundary from '../components/dashboard/CesiumErrorBoundary';
import { SatelliteItem } from '../components/dashboard/GlobeFallbackTable';
import { useSatellites } from '../hooks/useKesslerAPI';

const CesiumGlobe = lazy(() => import('../components/dashboard/CesiumGlobe'));

const defaultFilters: Record<string, boolean> = {
  Communication: true,
  Debris: true,
  ISS: true,
  Weather: true,
  Military: true,
  GPS: true,
  Scientific: true,
};

export default function OrbitalMap() {
  const { satellites, loading } = useSatellites();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [selectedObject, setSelectedObject] = useState<SatelliteItem | null>(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [showFilters, setShowFilters] = useState(true);
  const [showOrbitLines, setShowOrbitLines] = useState(true);
  const [enableLighting, setEnableLighting] = useState(true);
  const [showSunMoon, setShowSunMoon] = useState(true);
  const [isUIHidden, setIsUIHidden] = useState(false);
  const [followState, setFollowState] = useState<FollowState>({ mode: 'FREE' });
  const [satSearch, setSatSearch] = useState('');
  const [showSatList, setShowSatList] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const globeRef = useRef<CesiumGlobeRef>(null);

  const togglePlayback = () => {
    globeRef.current?.toggleAutoRotate();
    setIsPlaying(p => !p);
  };

  const handleExportFrame = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      source: 'Space-Track & Local Ephemeris',
      mode: 'observed',
      selected_object: selectedObject,
      total_tracked: satellites.length,
      camera_follow: followState,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kesslerx-orbit-frame-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Statistics from real data
  const activePayLoads = satellites.filter(s => s.OBJECT_TYPE === 'PAYLOAD').length;
  const debrisCount = satellites.filter(s => s.OBJECT_TYPE === 'DEBRIS').length;

  const toggleFilter = (key: string) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFollowStateChange = useCallback((state: FollowState) => {
    setFollowState(state);
  }, []);

  // When a satellite is clicked, select it AND immediately fly the camera to it
  const handleSelectObject = useCallback((sat: SatelliteItem | null) => {
    setSelectedObject(sat);
    if (sat) {
      const id = String(sat.NORAD_CAT_ID || sat.id || '');
      requestAnimationFrame(() => {
        globeRef.current?.flyToSatellite(id);
      });
    }
  }, []);

  // Auto-select satellite from query param (?select=NORAD or ?select=NAME) or location state
  useEffect(() => {
    const selectTarget = searchParams.get('select') || (location.state as { selectedNoradId?: string })?.selectedNoradId;
    if (selectTarget && satellites.length > 0) {
      const targetStr = selectTarget.toString().toUpperCase().trim();
      const foundSat = satellites.find(s => {
        const norad = String(s.NORAD_CAT_ID ?? s.id ?? '');
        const name = String(s.OBJECT_NAME || s.name || '').toUpperCase();
        return norad === targetStr || name === targetStr || name.includes(targetStr);
      });

      if (foundSat && (!selectedObject || (selectedObject.NORAD_CAT_ID?.toString() !== foundSat.NORAD_CAT_ID?.toString()))) {
        const timer = setTimeout(() => {
          handleSelectObject(foundSat);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [searchParams, location.state, satellites, handleSelectObject, selectedObject]);

  const handleFollowSatellite = useCallback(() => {
    if (selectedObject) {
      globeRef.current?.flyToSatellite(String(selectedObject.NORAD_CAT_ID ?? selectedObject.id ?? ''));
    }
  }, [selectedObject]);

  const handleStopFollowing = useCallback(() => {
    globeRef.current?.stopFollowing();
  }, []);

  return (
    <div className="absolute inset-0 z-0 bg-[#060e20] overflow-hidden">
      {/* Visual Decorative Orbits (Backups in case scene is empty) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[600px] h-[600px] border border-dashed border-primary/20 rounded-full opacity-10" style={{ transform: 'rotateX(75deg)' }}></div>
        <div className="absolute w-[800px] h-[800px] border border-dashed border-primary/20 rounded-full opacity-10" style={{ transform: 'rotateX(75deg)' }}></div>
        <div className="absolute w-[1100px] h-[1100px] border border-dashed border-primary/20 rounded-full opacity-5" style={{ transform: 'rotateX(75deg)' }}></div>
      </div>

      {/* 3D Canvas Container */}
      <div className="absolute inset-0 z-0 h-full w-full">
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center bg-background">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-3 border-primary/30"
                  style={{ borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                <span className="text-sm font-label-mono text-outline uppercase tracking-widest">Loading Orbital Map...</span>
              </div>
            </div>
          }
        >
          <div className="h-full [&>div]:!h-full [&>div>div]:!h-full">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center bg-background">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-3 border-primary/30"
                    style={{ borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                  <span className="text-sm font-label-mono text-outline uppercase tracking-widest">Fetching Satellite Data...</span>
                </div>
              </div>
            ) : (
              <CesiumErrorBoundary
                satellites={satellites}
                onSelectObject={handleSelectObject}
                selectedObject={selectedObject}
                filters={filters}
              >
                <CesiumGlobe
                  ref={globeRef}
                  satellites={satellites}
                  onSelectObject={handleSelectObject}
                  selectedObject={selectedObject}
                  filters={filters}
                  showOrbitLines={showOrbitLines}
                  enableLighting={enableLighting}
                  showSunMoon={showSunMoon}
                  onFollowStateChange={handleFollowStateChange}
                />
              </CesiumErrorBoundary>
            )}
          </div>
        </Suspense>
      </div>

      <ObjectDetailsPanel
        satelliteData={selectedObject}
        onClose={() => {
          // Exit follow mode when closing panel
          if (followState.mode !== 'FREE') {
            globeRef.current?.stopFollowing();
          }
          setSelectedObject(null);
        }}
        followState={followState}
        onFollowSatellite={handleFollowSatellite}
        onStopFollowing={handleStopFollowing}
      />

      {/* ── Follow Mode HUD Indicator ────────────────── */}
      {followState.mode !== 'FREE' && !isUIHidden && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-full"
            style={{
              background: followState.mode === 'FOLLOWING'
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(0, 174, 239, 0.15)',
              border: `1px solid ${followState.mode === 'FOLLOWING'
                ? 'rgba(16, 185, 129, 0.3)'
                : 'rgba(0, 174, 239, 0.3)'}`,
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{
                background: followState.mode === 'FOLLOWING' ? '#10B981' : '#00AEEF',
                boxShadow: `0 0 6px ${followState.mode === 'FOLLOWING' ? '#10B981' : '#00AEEF'}`,
              }}
            />
            <span
              className="text-[11px] font-label-mono uppercase tracking-widest"
              style={{ color: followState.mode === 'FOLLOWING' ? '#10B981' : '#00AEEF' }}
            >
              {followState.mode === 'FOCUSING' ? 'Focusing' : 'Following'} · {followState.targetName}
            </span>
            {followState.mode === 'FOLLOWING' && (
              <button
                onClick={handleStopFollowing}
                className="ml-1 text-[10px] font-label-mono uppercase tracking-widest px-2.5 py-1 rounded-full transition-all hover:brightness-125"
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#EF4444',
                }}
              >
                Exit
              </button>
            )}
          </div>
        </div>
      )}

      {/* UI Visibility Toggle (Always Visible) */}
      <button 
        className="absolute top-6 right-6 z-50 w-12 h-12 glass rounded-full flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all active:scale-90"
        title={isUIHidden ? "Show UI" : "Hide UI"}
        onClick={() => setIsUIHidden(!isUIHidden)}
      >
        <span className="material-symbols-outlined">
          {isUIHidden ? "visibility" : "visibility_off"}
        </span>
      </button>

      {/* Map Control Sidebar */}
      <div className={`absolute left-6 top-6 z-30 w-72 flex flex-col gap-4 max-h-[calc(100vh-100px)] pointer-events-none transition-opacity duration-300 ${isUIHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        
        {/* Statistics Widget */}
        <div className="glass rounded-xl p-inner-padding border-primary/20 pointer-events-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">analytics</span>
              Live Telemetry
            </h3>
            <span className="material-symbols-outlined text-outline cursor-pointer">more_vert</span>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="font-label-mono text-[10px] text-outline uppercase">Active Satellites</p>
                <h2 className="font-stat-lg text-stat-lg text-primary">{activePayLoads.toLocaleString()}</h2>
              </div>
              <div className="text-emerald-400 text-[12px] font-label-mono flex items-center">
                <span className="material-symbols-outlined text-xs">trending_up</span> 2.35%
              </div>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="font-label-mono text-[10px] text-outline uppercase">Tracked Debris</p>
                <h2 className="font-stat-lg text-stat-lg">{debrisCount.toLocaleString()}</h2>
              </div>
              <div className="text-error text-[12px] font-label-mono flex items-center">
                <span className="material-symbols-outlined text-xs">trending_up</span> 1.89%
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Filter Sidebar */}
        <div className="glass rounded-xl flex-1 flex flex-col overflow-hidden pointer-events-auto">
          <div className="p-inner-padding border-b border-outline-variant/10 flex justify-between items-center cursor-pointer" onClick={() => setShowFilters(!showFilters)}>
            <h3 className="font-headline-sm text-headline-sm flex items-center gap-2">
              <span className="material-symbols-outlined">filter_alt</span>
              Object Filtering
            </h3>
            <span className={`material-symbols-outlined transition-transform ${showFilters ? 'rotate-180' : ''}`}>expand_more</span>
          </div>
          
          {showFilters && (
            <div className="p-inner-padding overflow-y-auto custom-scrollbar space-y-6 max-h-64">
              <div className="space-y-3">
                <p className="font-label-mono text-[10px] text-outline uppercase tracking-wider">Object Types</p>
                
                {Object.entries(filters).map(([key, enabled]) => {
                  const colors: Record<string, string> = {
                    Communication: 'text-primary', Debris: 'text-error', ISS: 'text-white', Weather: 'text-yellow-500',
                    Military: 'text-orange-500', GPS: 'text-emerald-500', Scientific: 'text-purple-500',
                  };
                  return (
                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={enabled} 
                        onChange={() => toggleFilter(key)}
                        className={`w-4 h-4 rounded bg-surface-container-highest border-outline-variant focus:ring-1 ${colors[key]} focus:ring-primary`} 
                      />
                      <span className={`font-body-md text-body-md transition-colors ${enabled ? colors[key] : 'text-on-surface-variant'}`}>
                        {key}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Display Layers / Lighting & Orbits */}
              <div className="pt-3 border-t border-outline-variant/10 space-y-2">
                <p className="font-label-mono text-[10px] text-outline uppercase tracking-wider mb-2">Display & Lighting</p>
                
                {/* Day / Night Realtime Lighting Toggle */}
                <label className="flex items-center justify-between gap-3 cursor-pointer group p-2 rounded-lg bg-surface-container-highest/20 hover:bg-surface-container-highest/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-yellow-400">wb_sunny</span>
                    <span className="text-xs font-medium text-on-surface">Day / Night Cycle</span>
                  </div>
                  <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${enableLighting ? 'bg-primary' : 'bg-outline-variant/40'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${enableLighting ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </label>

                {/* Sun & Moon Celestial Objects */}
                <label className="flex items-center justify-between gap-3 cursor-pointer group p-2 rounded-lg bg-surface-container-highest/20 hover:bg-surface-container-highest/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-blue-300">bedtime</span>
                    <span className="text-xs font-medium text-on-surface">Sun & Moon</span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={showSunMoon}
                    onChange={(e) => setShowSunMoon(e.target.checked)}
                  />
                  <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${showSunMoon ? 'bg-primary' : 'bg-outline-variant/40'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${showSunMoon ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </label>

                {/* Orbital Lines Toggle */}
                <label className="flex items-center justify-between gap-3 cursor-pointer group p-2 rounded-lg bg-surface-container-highest/20 hover:bg-surface-container-highest/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-primary">polyline</span>
                    <span className="text-xs font-medium text-on-surface">Orbital Lines</span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={showOrbitLines}
                    onChange={(e) => setShowOrbitLines(e.target.checked)}
                  />
                  <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${showOrbitLines ? 'bg-primary' : 'bg-outline-variant/40'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${showOrbitLines ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Satellite List — click to select & follow */}
        <div className="glass rounded-xl flex-1 flex flex-col overflow-hidden pointer-events-auto">
          <div className="p-inner-padding border-b border-outline-variant/10 flex justify-between items-center cursor-pointer" onClick={() => setShowSatList(!showSatList)}>
            <h3 className="font-headline-sm text-headline-sm flex items-center gap-2">
              <span className="material-symbols-outlined">satellite_alt</span>
              Satellites
            </h3>
            <span className={`material-symbols-outlined transition-transform ${showSatList ? 'rotate-180' : ''}`}>expand_more</span>
          </div>
          
          {showSatList && (
            <div className="flex flex-col overflow-hidden">
              {/* Search input */}
              <div className="px-3 py-2 border-b border-outline-variant/10">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(6, 14, 32, 0.6)', border: '1px solid rgba(180, 197, 255, 0.1)' }}>
                  <span className="material-symbols-outlined text-sm text-outline">search</span>
                  <input
                    type="text"
                    placeholder="Search name or NORAD ID..."
                    value={satSearch}
                    onChange={(e) => setSatSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const q = satSearch.toUpperCase().trim();
                        const matching = satellites.filter(s => {
                          const name = String(s.OBJECT_NAME || s.name || '').toUpperCase();
                          const norad = String(s.NORAD_CAT_ID ?? s.id ?? '');
                          const cat = String(s.CATEGORY || s.type || s.OBJECT_TYPE || '').toUpperCase();
                          if (cat === 'DEBRIS') return false;
                          if (!q) return true;
                          return name.includes(q) || norad.includes(q);
                        });
                        if (matching.length > 0) {
                          handleSelectObject(matching[0]);
                        }
                      }
                    }}
                    className="bg-transparent border-none outline-none text-xs font-label-mono text-on-surface w-full placeholder:text-outline/50"
                  />
                  {satSearch && (
                    <button onClick={() => setSatSearch('')} className="text-outline hover:text-on-surface">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Satellite list */}
              <div className="overflow-y-auto custom-scrollbar max-h-48">
                {satellites
                  .filter(s => {
                    const name = String(s.OBJECT_NAME || s.name || '').toUpperCase();
                    const norad = String(s.NORAD_CAT_ID ?? s.id ?? '');
                    const cat = String(s.CATEGORY || s.type || s.OBJECT_TYPE || '').toUpperCase();
                    if (cat === 'DEBRIS') return false; // hide debris from list
                    if (!satSearch) return true;
                    const q = satSearch.toUpperCase().trim();
                    return name.includes(q) || norad.includes(q);
                  })
                  .slice(0, 50) // cap for performance
                  .map((sat) => {
                    const name = String(sat.OBJECT_NAME || sat.name || `Unknown`);
                    const id = String(sat.NORAD_CAT_ID ?? sat.id ?? '');
                    const isSelected = selectedObject?.NORAD_CAT_ID?.toString() === id || String(selectedObject?.id ?? '') === id;
                    const catColors: Record<string, string> = {
                      Communication: '#00AEEF', ISS: '#FFFFFF', Weather: '#EAB308',
                      Military: '#F97316', GPS: '#10B981', Scientific: '#A855F7',
                    };
                    const cat = String(sat.CATEGORY || sat.type || '');
                    const dotColor = catColors[cat] || '#94A3B8';
                    return (
                      <button
                        key={id || name}
                        onClick={() => handleSelectObject(sat)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors hover:bg-primary/10 ${
                          isSelected ? 'bg-primary/15' : ''
                        }`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor, boxShadow: `0 0 4px ${dotColor}` }} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[11px] font-label-mono truncate ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                            {name}
                          </p>
                          <p className="text-[9px] font-label-mono text-outline truncate">
                            {cat} · {id}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="material-symbols-outlined text-primary text-sm shrink-0">gps_fixed</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay Controls (Bottom Right) */}
      <div className={`absolute bottom-32 right-6 z-30 flex flex-col gap-3 transition-opacity duration-300 ${isUIHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button className="w-12 h-12 glass rounded-full flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all active:scale-90" title="Auto Rotate" onClick={() => globeRef.current?.toggleAutoRotate()}>
          <span className="material-symbols-outlined">autorenew</span>
        </button>
        <button className="w-12 h-12 glass rounded-full flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all active:scale-90" title="Zenith View" onClick={() => globeRef.current?.zenithView()}>
          <span className="material-symbols-outlined">center_focus_weak</span>
        </button>
        <button
          className={`w-12 h-12 glass rounded-full flex items-center justify-center transition-all active:scale-90 ${
            enableLighting
              ? 'text-yellow-400 bg-yellow-400/20 border border-yellow-400/40 shadow-[0_0_12px_rgba(250,204,21,0.3)]'
              : 'text-outline hover:bg-surface-container-highest/40 hover:text-on-surface'
          }`}
          title={enableLighting ? "Disable Day/Night Lighting" : "Enable Real-Time Day/Night Lighting"}
          onClick={() => setEnableLighting(!enableLighting)}
        >
          <span className="material-symbols-outlined">{enableLighting ? 'wb_sunny' : 'nightlight'}</span>
        </button>
        <button
          className={`w-12 h-12 glass rounded-full flex items-center justify-center transition-all active:scale-90 ${
            showOrbitLines
              ? 'text-primary bg-primary/20 border border-primary/40 shadow-[0_0_12px_rgba(180,197,255,0.3)]'
              : 'text-outline hover:bg-surface-container-highest/40 hover:text-on-surface'
          }`}
          title={showOrbitLines ? "Hide Orbital Lines" : "Show Orbital Lines"}
          onClick={() => setShowOrbitLines(!showOrbitLines)}
        >
          <span className="material-symbols-outlined">polyline</span>
        </button>
        <div className="flex flex-col glass rounded-2xl overflow-hidden divide-y divide-outline-variant/10">
          <button className="w-12 h-12 flex items-center justify-center hover:bg-primary/20 transition-all" title="Zoom In" onClick={() => globeRef.current?.zoomIn()}>
            <span className="material-symbols-outlined">add</span>
          </button>
          <button className="w-12 h-12 flex items-center justify-center hover:bg-primary/20 transition-all" title="Zoom Out" onClick={() => globeRef.current?.zoomOut()}>
            <span className="material-symbols-outlined">remove</span>
          </button>
        </div>
        <button
          onClick={() => setShowHelpModal(prev => !prev)}
          className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 hover:brightness-110 active:scale-90 transition-all"
          title="3D Navigation Help"
          aria-label="Help"
        >
          <span className="material-symbols-outlined">help_center</span>
        </button>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="absolute top-20 right-20 z-50 p-4 rounded-xl glass border border-primary/30 text-xs font-mono text-white/90 shadow-2xl max-w-xs space-y-2">
          <div className="flex justify-between items-center pb-2 border-b border-white/10">
            <span className="font-bold text-primary">3D Globe Controls</span>
            <button onClick={() => setShowHelpModal(false)} className="text-white/40 hover:text-white">✕</button>
          </div>
          <p>• <strong>Left Click + Drag:</strong> Rotate globe</p>
          <p>• <strong>Right Click + Drag:</strong> Zoom in / out</p>
          <p>• <strong>Middle Click + Drag:</strong> Pan camera</p>
          <p>• <strong>Click Satellite:</strong> Inspect & track orbit</p>
        </div>
      )}
      
      {/* Timeline Slider (Bottom Anchor) */}
      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-5xl glass rounded-2xl p-4 flex flex-col gap-4 border border-primary/10 transition-opacity duration-300 ${isUIHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => globeRef.current?.resetView()}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-highest transition-colors"
              title="Reset View"
              aria-label="Reset View"
            >
              <span className="material-symbols-outlined">skip_previous</span>
            </button>
            <button
              onClick={togglePlayback}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                isPlaying ? 'bg-secondary/30 text-secondary' : 'bg-primary/20 text-primary hover:bg-primary/30'
              }`}
              title={isPlaying ? 'Pause Auto-Rotate' : 'Start Auto-Rotate'}
              aria-label="Play/Pause"
            >
              <span className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
            <button
              onClick={() => globeRef.current?.zoomIn()}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-highest transition-colors"
              title="Zoom Step Forward"
              aria-label="Next Step"
            >
              <span className="material-symbols-outlined">skip_next</span>
            </button>
          </div>
          <div className="flex-1 flex flex-col gap-2 relative">
            <div className="flex justify-between px-2 text-[10px] font-label-mono text-outline uppercase">
              <span>T - 24H</span>
              <span className="text-primary font-bold">Now (Live Feed)</span>
              <span>T + 72H (Predicted)</span>
            </div>
            <div className="h-2 bg-surface-container-highest rounded-full overflow-visible relative">
              <div className="absolute top-0 left-0 h-full w-[40%] bg-primary/50 rounded-l-full"></div>
              {/* Thumb */}
              <div className="absolute top-1/2 left-[40%] -translate-x-1/2 -translate-y-1/2 group cursor-pointer hover:cursor-grab">
                <div className="w-6 h-6 rounded-full bg-primary shadow-[0_0_15px_rgba(180,197,255,0.6)] flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="glass px-3 py-1 rounded text-[12px] font-label-mono whitespace-nowrap text-white">
                    Live Feed
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 glass rounded-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">speed</span>
              <span className="font-label-mono text-[12px]">1.0x</span>
            </div>
            <button
              onClick={handleExportFrame}
              className="px-4 py-1.5 bg-surface-container-highest rounded-lg font-body-md text-body-md hover:bg-surface-container-high transition-colors"
              title="Export Current Frame JSON"
            >
              Export Frame
            </button>
          </div>
        </div>
      </div>
      
    </div>
  );
}
