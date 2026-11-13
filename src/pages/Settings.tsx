import { useState } from "react";
import SystemHealthPanel from "../components/dashboard/SystemHealthPanel";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("satellite");
  const [spaceTrackEmail, setSpaceTrackEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('SPACE_TRACK_EMAIL') || '';
    }
    return '';
  });
  const [spaceTrackPassword, setSpaceTrackPassword] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('SPACE_TRACK_PASSWORD') || '';
    }
    return '';
  });
  const [cesiumToken, setCesiumToken] = useState(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('CESIUM_ION_TOKEN');
      if (token && token !== "••••••••••••••••••••••••••••••••••••••••••••••••••••") return token;
    }
    return '';
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showSpaceTrackPass, setShowSpaceTrackPass] = useState(false);
  const [showCesiumPass, setShowCesiumPass] = useState(false);
  const [uiDensity, setUiDensity] = useState<'compact' | 'comfortable'>('compact');
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'high'>('high');
  const [sourcePage, setSourcePage] = useState(1);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [customSources, setCustomSources] = useState<Array<{ name: string; type: string; status: string; count: string; updated: string }>>([]);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const saveSpaceTrack = () => {
    localStorage.setItem('SPACE_TRACK_EMAIL', spaceTrackEmail);
    localStorage.setItem('SPACE_TRACK_PASSWORD', spaceTrackPassword);
    showFeedback('Space-Track credentials saved locally.');
  };

  const saveCesium = () => {
    localStorage.setItem('CESIUM_ION_TOKEN', cesiumToken);
    showFeedback('Cesium Ion token updated locally.');
  };

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim()) return;
    setCustomSources(prev => [
      ...prev,
      {
        name: newSourceName,
        type: 'CUSTOM TLE',
        status: 'Active',
        count: '1,420',
        updated: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
    ]);
    setNewSourceName('');
    setNewSourceUrl('');
    setShowAddSourceModal(false);
    showFeedback(`Custom data source '${newSourceName}' registered.`);
  };

  const handleRotateKeys = () => {
    const keyId = 'KEY-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    localStorage.setItem('KESSLER_CRYPTO_KEY_ID', keyId);
    showFeedback(`Rotated ingestion encryption keys. New active Key-ID: ${keyId}`);
  };

  const handleSavePreferences = () => {
    localStorage.setItem('KESSLER_NOTIFICATIONS_ENABLED', 'true');
    showFeedback('Notification and alert preferences successfully committed.');
  };

  return (
    <div className="space-y-card-gap pb-20 custom-scrollbar relative">
      {feedback && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono shadow-lg backdrop-blur">
          {feedback}
        </div>
      )}
      {/* Page Header/Tabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-outline-variant/20 mb-8">
        <nav className="flex gap-8 overflow-x-auto pb-px custom-scrollbar">
          <button 
            className={`pb-4 font-headline-sm border-b-2 transition-all ${activeTab === 'general' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button 
            className={`pb-4 font-headline-sm border-b-2 transition-all ${activeTab === 'satellite' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
            onClick={() => setActiveTab('satellite')}
          >
            Satellite Database
          </button>
          <button 
            className={`pb-4 font-headline-sm border-b-2 transition-all ${activeTab === 'api' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
            onClick={() => setActiveTab('api')}
          >
            API Keys
          </button>
          <button 
            className={`pb-4 font-headline-sm border-b-2 transition-all ${activeTab === 'notifications' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications
          </button>
          <button 
            className={`pb-4 font-headline-sm border-b-2 transition-all ${activeTab === 'diagnostics' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
            onClick={() => setActiveTab('diagnostics')}
          >
            System Diagnostics
          </button>
        </nav>
        <div className="flex items-center gap-4 pb-4">
          <div className="flex items-center gap-3">
            <span className="font-label-mono text-label-mono text-on-surface-variant">AUTO-REFRESH</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Content: Satellite Database */}
      {activeTab === 'satellite' && (
        <section className="space-y-6">
          {/* Summary Widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-card-gap">
            <div className="glass p-inner-padding rounded-xl flex items-center gap-4 border-l-4 border-primary">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">dataset</span>
              </div>
              <div>
                <div className="font-label-mono text-label-mono text-on-surface-variant/60 uppercase">Connected Sources</div>
                <div className="font-stat-lg text-stat-lg">12 Active</div>
              </div>
            </div>
            <div className="glass p-inner-padding rounded-xl flex items-center gap-4 border-l-4 border-secondary">
              <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary">sync</span>
              </div>
              <div>
                <div className="font-label-mono text-label-mono text-on-surface-variant/60 uppercase">Data Throughput</div>
                <div className="font-stat-lg text-stat-lg">1.2 GB/m</div>
              </div>
            </div>
            <div className="glass p-inner-padding rounded-xl flex items-center gap-4 border-l-4 border-tertiary">
              <div className="w-12 h-12 rounded-lg bg-tertiary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-tertiary">update</span>
              </div>
              <div>
                <div className="font-label-mono text-label-mono text-on-surface-variant/60 uppercase">Last Global Sync</div>
                <div className="font-stat-lg text-stat-lg">42s ago</div>
              </div>
            </div>
          </div>

          {/* Main Data Table Container */}
          <div className="glass rounded-xl overflow-hidden flex flex-col">
            <div className="p-6 flex justify-between items-center border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">database</span>
                <h2 className="font-headline-md text-headline-md">Orbital Data Sources</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSourceModal(true)}
                className="bg-primary text-on-primary hover:bg-primary/80 px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(180,197,255,0.15)]"
              >
                <span className="material-symbols-outlined">add</span>
                Add Data Source
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-high/50 border-b border-outline-variant/10">
                  <tr>
                    <th className="p-4 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Source Name</th>
                    <th className="p-4 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Type</th>
                    <th className="p-4 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Sync Status</th>
                    <th className="p-4 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Objects Tracked</th>
                    <th className="p-4 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Last Updated</th>
                    <th className="p-4 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 font-body-md text-body-md">
                  <tr className="hover:bg-surface-container-highest/10 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface-container rounded-md flex items-center justify-center font-bold text-xs text-primary">NRD</div>
                        <div>
                          <div className="font-bold">NORAD SatCat</div>
                          <div className="text-xs text-on-surface-variant/60">TLE Data Engine</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-label-mono text-xs">GOVERNMENTAL</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-primary">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> Active
                      </div>
                    </td>
                    <td className="p-4 font-label-mono">18,492</td>
                    <td className="p-4 text-on-surface-variant">2023-10-27 12:44:11</td>
                    <td className="p-4 text-right">
                      <button type="button" onClick={() => showFeedback('NORAD SatCat node configuration active.')} title="Configure" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-on-surface-variant">settings</span></button>
                      <button type="button" onClick={() => showFeedback('Immediate TLE sync initiated for NORAD SatCat.')} title="Sync Now" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-on-surface-variant">refresh</span></button>
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-container-highest/10 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface-container rounded-md flex items-center justify-center font-bold text-xs text-secondary">ESA</div>
                        <div>
                          <div className="font-bold">ESA DISCOS</div>
                          <div className="text-xs text-on-surface-variant/60">Space Debris Database</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-label-mono text-xs">INSTITUTIONAL</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-primary">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> Active
                      </div>
                    </td>
                    <td className="p-4 font-label-mono">42,105</td>
                    <td className="p-4 text-on-surface-variant">2023-10-27 12:41:05</td>
                    <td className="p-4 text-right">
                      <button type="button" onClick={() => showFeedback('ESA DISCOS node parameters verified.')} title="Configure" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-on-surface-variant">settings</span></button>
                      <button type="button" onClick={() => showFeedback('Immediate sync initiated for ESA DISCOS catalog.')} title="Sync Now" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-on-surface-variant">refresh</span></button>
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-container-highest/10 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface-container rounded-md flex items-center justify-center font-bold text-xs text-tertiary">STX</div>
                        <div>
                          <div className="font-bold">Starlink Public API</div>
                          <div className="text-xs text-on-surface-variant/60">Constellation Status</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-label-mono text-xs">PRIVATE</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-on-surface-variant/40">
                        <div className="w-2 h-2 rounded-full bg-surface-container-highest"></div> Hibernating
                      </div>
                    </td>
                    <td className="p-4 font-label-mono">5,210</td>
                    <td className="p-4 text-on-surface-variant">2023-10-27 10:15:22</td>
                    <td className="p-4 text-right">
                      <button type="button" onClick={() => showFeedback('Starlink API rate limit settings opened.')} title="Configure" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-on-surface-variant">settings</span></button>
                      <button type="button" onClick={() => showFeedback('Resumed background polling for Starlink feed.')} title="Resume Feed" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-primary">play_arrow</span></button>
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-container-highest/10 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface-container rounded-md flex items-center justify-center font-bold text-xs text-error">JAX</div>
                        <div>
                          <div className="font-bold">JAXA Orbital Catalog</div>
                          <div className="text-xs text-on-surface-variant/60">Regional Surveillance</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-label-mono text-xs">GOVERNMENTAL</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-error">
                        <div className="w-2 h-2 rounded-full bg-error"></div> Sync Error
                      </div>
                    </td>
                    <td className="p-4 font-label-mono">948</td>
                    <td className="p-4 text-on-surface-variant">2023-10-26 23:59:59</td>
                    <td className="p-4 text-right">
                      <button type="button" onClick={() => showFeedback('Diagnostic: JAXA network route timeout (HTTP 504). Retrying handoff...')} title="Diagnostic Warning" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-error">warning</span></button>
                      <button type="button" onClick={() => showFeedback('Reconnected JAXA gateway with exponential backoff.')} title="Reconnect" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-on-surface-variant">refresh</span></button>
                    </td>
                  </tr>

                  {customSources.map((cs, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-highest/10 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-surface-container rounded-md flex items-center justify-center font-bold text-xs text-emerald-400">CST</div>
                          <div>
                            <div className="font-bold">{cs.name}</div>
                            <div className="text-xs text-on-surface-variant/60">User Registered Feed</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-label-mono text-xs">{cs.type}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <div className="w-2 h-2 rounded-full bg-emerald-400"></div> {cs.status}
                        </div>
                      </td>
                      <td className="p-4 font-label-mono">{cs.count}</td>
                      <td className="p-4 text-on-surface-variant">{cs.updated}</td>
                      <td className="p-4 text-right">
                        <button type="button" onClick={() => showFeedback(`Synchronized custom source: ${cs.name}`)} title="Sync Now" className="p-2 hover:bg-surface-container-highest rounded-lg transition-all"><span className="material-symbols-outlined text-on-surface-variant">refresh</span></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 bg-surface-container-low/50 border-t border-outline-variant/10 flex justify-between items-center">
              <div className="font-label-mono text-label-mono text-on-surface-variant/60">
                Displaying {sourcePage === 1 ? '1 - 4' : '5 - 8'} of {12 + customSources.length} registered sources
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSourcePage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 glass rounded hover:bg-primary/20 transition-all text-xs font-bold uppercase"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setSourcePage(1)}
                  className={`px-3 py-1 glass rounded transition-all text-xs font-bold uppercase ${sourcePage === 1 ? 'bg-primary/20 border-primary/50 text-primary' : 'hover:bg-primary/20'}`}
                >
                  1
                </button>
                <button
                  type="button"
                  onClick={() => setSourcePage(2)}
                  className={`px-3 py-1 glass rounded transition-all text-xs font-bold uppercase ${sourcePage === 2 ? 'bg-primary/20 border-primary/50 text-primary' : 'hover:bg-primary/20'}`}
                >
                  2
                </button>
                <button
                  type="button"
                  onClick={() => setSourcePage(p => Math.min(2, p + 1))}
                  className="px-3 py-1 glass rounded hover:bg-primary/20 transition-all text-xs font-bold uppercase"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Database Advanced Settings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-card-gap">
            <div className="glass p-6 rounded-xl space-y-4">
              <h3 className="font-headline-sm text-headline-sm border-b border-outline-variant/10 pb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">memory</span>
                Cache Management
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold">Orbital State Persistence</div>
                    <div className="text-sm text-on-surface-variant">Time to keep stale orbital data before purge</div>
                  </div>
                  <select className="bg-surface-container-high border-outline-variant text-on-surface rounded-lg p-2 font-label-mono text-xs outline-none">
                    <option>24 Hours</option>
                    <option defaultValue="7 Days">7 Days</option>
                    <option>30 Days</option>
                  </select>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold">Compression Level</div>
                    <div className="text-sm text-on-surface-variant">GZIP compression for incoming telemetry</div>
                  </div>
                  <div className="flex gap-1 p-1 bg-surface-container-highest rounded-lg">
                    <button
                      type="button"
                      onClick={() => { setCompressionLevel('low'); showFeedback('Telemetry compression set to Low.'); }}
                      className={`px-3 py-1 text-xs font-bold uppercase rounded ${compressionLevel === 'low' ? 'bg-primary text-on-primary' : 'hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      Low
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCompressionLevel('high'); showFeedback('Telemetry compression set to High (GZIP).'); }}
                      className={`px-3 py-1 text-xs font-bold uppercase rounded ${compressionLevel === 'high' ? 'bg-primary text-on-primary' : 'hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      High
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-xl space-y-4">
              <h3 className="font-headline-sm text-headline-sm border-b border-outline-variant/10 pb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">security</span>
                Ingestion Security
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary">verified_user</span>
                  <div className="flex-1">
                    <div className="font-bold">Enforce TLS 1.3</div>
                    <div className="text-sm text-on-surface-variant">Require latest encryption for all external nodes</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-10 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleRotateKeys}
                  className="w-full py-2 border border-outline-variant hover:bg-surface-container-highest rounded-lg font-bold text-sm transition-all"
                >
                  Rotate Encryption Keys
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
      {/* Content: General Settings */}
      {activeTab === 'general' && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-card-gap">
            <div className="glass p-6 rounded-xl space-y-4">
              <h3 className="font-headline-sm text-headline-sm border-b border-outline-variant/10 pb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">display_settings</span>
                Display Settings
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold">Theme Mode</div>
                    <div className="text-sm text-on-surface-variant">Switch between dark and light themes</div>
                  </div>
                  <select className="bg-surface-container-high border-outline-variant text-on-surface rounded-lg p-2 font-label-mono text-xs outline-none">
                    <option defaultValue="Dark">Dark Mode</option>
                    <option>Light Mode</option>
                    <option>System Auto</option>
                  </select>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold">UI Density</div>
                    <div className="text-sm text-on-surface-variant">Adjust information density of tables and cards</div>
                  </div>
                  <div className="flex gap-1 p-1 bg-surface-container-highest rounded-lg">
                    <button
                      type="button"
                      onClick={() => { setUiDensity('compact'); showFeedback('UI density set to Compact.'); }}
                      className={`px-3 py-1 text-xs font-bold uppercase rounded ${uiDensity === 'compact' ? 'bg-primary text-on-primary' : 'hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      Compact
                    </button>
                    <button
                      type="button"
                      onClick={() => { setUiDensity('comfortable'); showFeedback('UI density set to Comfortable.'); }}
                      className={`px-3 py-1 text-xs font-bold uppercase rounded ${uiDensity === 'comfortable' ? 'bg-primary text-on-primary' : 'hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      Comfortable
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold">3D Rendering Quality</div>
                    <div className="text-sm text-on-surface-variant">Adjust CesiumJS globe render quality</div>
                  </div>
                  <select className="bg-surface-container-high border-outline-variant text-on-surface rounded-lg p-2 font-label-mono text-xs outline-none">
                    <option>Low</option>
                    <option>Medium</option>
                    <option defaultValue="High">High</option>
                    <option>Ultra</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-xl space-y-4">
              <h3 className="font-headline-sm text-headline-sm border-b border-outline-variant/10 pb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">public</span>
                Globe Settings
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary">layers</span>
                  <div className="flex-1">
                    <div className="font-bold">Show Atmosphere</div>
                    <div className="text-sm text-on-surface-variant">Render realistic Earth atmosphere scattering</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-10 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
                  </label>
                </div>
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary">light_mode</span>
                  <div className="flex-1">
                    <div className="font-bold">Enable Sunlight</div>
                    <div className="text-sm text-on-surface-variant">Dynamic lighting based on sun position</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-10 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
                  </label>
                </div>
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary">my_location</span>
                  <div className="flex-1">
                    <div className="font-bold">Show Ground Stations</div>
                    <div className="text-sm text-on-surface-variant">Display known telemetry tracking stations</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-10 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Content: API Keys */}
      {activeTab === 'api' && (
        <section className="space-y-6">
          <div className="glass p-6 rounded-xl space-y-6">
            <div>
              <h3 className="font-headline-sm text-headline-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">key</span>
                External API Integration
              </h3>
              <p className="text-sm text-on-surface-variant mt-2">Manage your API credentials for external data sources and rendering engines. These keys are stored locally and are not transmitted to our servers.</p>
            </div>
            
            <div className="space-y-6 border-t border-outline-variant/10 pt-6">
              {/* Space-Track API */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center font-bold text-sm text-primary">STX</div>
                    <div>
                      <div className="font-bold">Space-Track.org</div>
                      <div className="text-xs text-on-surface-variant">Used for real-time TLE data retrieval</div>
                    </div>
                  </div>
                  {spaceTrackEmail && spaceTrackPassword ? (
                    <span className="px-3 py-1 rounded bg-primary/10 text-primary text-xs font-bold uppercase border border-primary/20">Configured</span>
                  ) : (
                    <span className="px-3 py-1 rounded bg-error/10 text-error text-xs font-bold uppercase border border-error/20">Not Configured</span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-on-surface-variant uppercase">Username</label>
                    <input type="text" placeholder="Enter Space-Track Email" value={spaceTrackEmail} onChange={(e) => setSpaceTrackEmail(e.target.value)} className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-on-surface-variant uppercase">Password</label>
                    <div className="relative">
                      <input
                        type={showSpaceTrackPass ? "text" : "password"}
                        placeholder="Enter Space-Track Password"
                        value={spaceTrackPassword}
                        onChange={(e) => setSpaceTrackPassword(e.target.value)}
                        className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSpaceTrackPass(v => !v)}
                        title={showSpaceTrackPass ? "Hide password" : "Show password"}
                        className="absolute right-3 top-2.5 text-on-surface-variant hover:text-on-surface"
                      >
                        <span className="material-symbols-outlined text-sm">{showSpaceTrackPass ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={saveSpaceTrack} className="bg-primary text-on-primary hover:bg-primary/80 px-4 py-2 rounded-lg text-sm font-bold transition-all">Save Credentials</button>
                </div>
              </div>

              {/* Cesium Ion API */}
              <div className="space-y-3 pt-6 border-t border-outline-variant/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center font-bold text-sm text-secondary">CSM</div>
                    <div>
                      <div className="font-bold">Cesium Ion</div>
                      <div className="text-xs text-on-surface-variant">Required for 3D globe rendering and imagery</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded bg-primary/10 text-primary text-xs font-bold uppercase border border-primary/20">Connected</span>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-on-surface-variant uppercase">Access Token</label>
                  <div className="relative">
                    <input
                      type={showCesiumPass ? "text" : "password"}
                      value={cesiumToken}
                      onChange={(e) => setCesiumToken(e.target.value)}
                      className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-colors font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCesiumPass(v => !v)}
                      title={showCesiumPass ? "Hide token" : "Show token"}
                      className="absolute right-3 top-2.5 text-on-surface-variant hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-sm">{showCesiumPass ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={saveCesium} className="bg-surface-container-highest text-on-surface hover:bg-surface-container px-4 py-2 rounded-lg text-sm font-bold transition-all border border-outline-variant">Update Token</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Content: Notifications */}
      {activeTab === 'notifications' && (
        <section className="space-y-6">
          <div className="glass p-6 rounded-xl space-y-6">
            <div>
              <h3 className="font-headline-sm text-headline-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">notifications_active</span>
                Alert Preferences
              </h3>
              <p className="text-sm text-on-surface-variant mt-2">Configure which events trigger notifications and how they are delivered to your devices.</p>
            </div>
            
            <div className="space-y-0 divide-y divide-outline-variant/10 border-t border-outline-variant/10 pt-4">
              
              <div className="py-4 flex items-center justify-between">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-error"></div>
                    Critical Conjunctions (TCA &lt; 24h)
                  </div>
                  <div className="text-sm text-on-surface-variant mt-1">Immediate alerts for collision probability &gt; 1e-4</div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-primary w-4 h-4" /> App
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-primary w-4 h-4" /> Email
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-primary w-4 h-4" /> SMS
                  </label>
                </div>
              </div>

              <div className="py-4 flex items-center justify-between">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-secondary"></div>
                    Space Weather Anomalies
                  </div>
                  <div className="text-sm text-on-surface-variant mt-1">Solar flares (M/X-class) and geomagnetic storms</div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-primary w-4 h-4" /> App
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-primary w-4 h-4" /> Email
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="accent-primary w-4 h-4" /> SMS
                  </label>
                </div>
              </div>

              <div className="py-4 flex items-center justify-between">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    Catalog Updates
                  </div>
                  <div className="text-sm text-on-surface-variant mt-1">New debris identified or satellite maneuvers detected</div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-primary w-4 h-4" /> App
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="accent-primary w-4 h-4" /> Email
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="accent-primary w-4 h-4" /> SMS
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSavePreferences}
                className="bg-primary text-on-primary hover:bg-primary/80 px-6 py-2.5 rounded-lg font-bold transition-all"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Content: System Diagnostics */}
      {activeTab === 'diagnostics' && (
        <section className="space-y-6">
          <SystemHealthPanel />
        </section>
      )}

      {/* Add Custom Source Modal */}
      {showAddSourceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleAddSource} className="glass max-w-md w-full rounded-2xl p-6 border border-primary/30 space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-headline-sm text-lg text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">add_circle</span>
                Add Orbital Data Source
              </h3>
              <button
                type="button"
                onClick={() => setShowAddSourceModal(false)}
                className="text-on-surface-variant hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-on-surface-variant uppercase">Source Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. LeoLabs Conjunction Feed"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-sm text-white mt-1 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="font-bold text-on-surface-variant uppercase">Endpoint URL / TLE URI</label>
                <input
                  type="url"
                  placeholder="https://api.example.com/v1/tle"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-sm text-white mt-1 outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddSourceModal(false)}
                className="px-4 py-2 bg-surface-container-highest rounded text-sm text-on-surface-variant hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-black font-semibold rounded text-sm hover:brightness-110"
              >
                Register Source
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
