import { useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

type AlertSeverity = 'critical' | 'warning' | 'info';

interface Alert {
  id: string;
  target: string;
  time: string;
  title: string;
  type: string;
  severity: AlertSeverity;
  status: 'Unacknowledged' | 'Acknowledged' | 'Escalated';
  altitude: string;
  velocity: string;
}

const INITIAL_ALERTS: Alert[] = [
  { id: '1', target: 'STARLINK-3021', time: '2m ago', title: 'Proximal Collision Risk', type: 'Collision Vector', severity: 'critical', status: 'Unacknowledged', altitude: '550 km', velocity: '7.59 km/s' },
  { id: '2', target: 'GOES-16-MOD', time: '12m ago', title: 'Solar Radiation Anomaly', type: 'Space Weather', severity: 'warning', status: 'Unacknowledged', altitude: '35,786 km', velocity: '3.07 km/s' },
  { id: '3', target: 'SENTINEL-6A', time: '24m ago', title: 'Orbital Path Deviation', type: 'Navigation Sync', severity: 'info', status: 'Unacknowledged', altitude: '1,336 km', velocity: '7.48 km/s' },
  { id: '4', target: 'COSMOS-2251', time: '1h 12m ago', title: 'Debris Cloud Proximity', type: 'Environmental', severity: 'info', status: 'Unacknowledged', altitude: '790 km', velocity: '7.40 km/s' },
];

function mapBackendAlert(a: any): Alert {
  const sevMap: Record<string, AlertSeverity> = { CRITICAL: 'critical', HIGH: 'critical', MEDIUM: 'warning', LOW: 'info' };
  const ago = a.timestamp ? getTimeAgo(a.timestamp) : 'just now';
  return {
    id: 'be-' + (a.id || String(Date.now()) + Math.random().toString(36).slice(2, 6)),
    target: a.title?.split(':')[1]?.trim() || a.title || 'System',
    time: ago,
    title: a.message || a.title || '',
    type: a.type || 'system',
    severity: sevMap[a.severity] || 'info',
    status: a.acknowledged ? 'Acknowledged' : 'Unacknowledged',
    altitude: '-',
    velocity: '-',
  };
}

function getTimeAgo(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function AlertCenter() {
  const { messages, isConnected } = useWebSocket('/ws/alerts');
  const [alerts, setAlerts] = useState<Alert[]>(INITIAL_ALERTS);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [selectedAlertId, setSelectedAlertId] = useState<string>('1');

  // Fetch persistent alerts from backend on mount
  useEffect(() => {
    fetch(`${API}/api/alerts?limit=50`)
      .then(r => r.json())
      .then(data => {
        if (data.alerts && data.alerts.length > 0) {
          const backendAlerts = data.alerts.map(mapBackendAlert);
          setAlerts(prev => [...backendAlerts, ...prev]);
        }
      })
      .catch(() => {});
  }, []);

  // Append live WebSocket alerts
  useEffect(() => {
    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      if (latest.data) {
        const mapped = mapBackendAlert(typeof latest.data === 'string' ? { title: latest.data, severity: (latest as any).severity || 'LOW', type: (latest as any).type || 'live' } : latest.data);
        setAlerts(prev => [mapped, ...prev].slice(0, 100));
      }
    }
  }, [messages]);

  const filteredAlerts = alerts.filter(a => {
    if (filter === 'all') return true;
    return a.severity === filter;
  });

  // Default to first alert in filtered list if selected alert is not in list
  const selectedAlert = alerts.find(a => a.id === selectedAlertId) || filteredAlerts[0];

  const handleAcknowledge = async () => {
    if (!selectedAlert) return;
    // Call backend
    try {
      await fetch(`${API}/api/alerts/${selectedAlert.id}/acknowledge`, { method: 'POST' });
    } catch {}
    setAlerts(alerts.map(a => a.id === selectedAlert.id ? { ...a, status: 'Acknowledged' } : a));
  };

  const handleEscalate = () => {
    if (!selectedAlert) return;
    setAlerts(alerts.map(a => a.id === selectedAlert.id ? { ...a, status: 'Escalated' } : a));
  };

  const getSeverityColors = (severity: AlertSeverity, isSelected: boolean) => {
    if (severity === 'critical') return isSelected ? 'bg-error/20 border-error/50 ring-1 ring-error/30 border-l-error' : 'glass border-l-error hover:bg-surface-container-highest/40';
    if (severity === 'warning') return isSelected ? 'bg-secondary/20 border-secondary/50 ring-1 ring-secondary/30 border-l-secondary' : 'bg-surface-container-low border-l-secondary hover:bg-surface-container-highest/40';
    return isSelected ? 'bg-primary-container/20 border-primary/30 ring-1 ring-primary/20 border-l-primary' : 'bg-surface-container-low border-l-on-surface-variant/30 hover:bg-surface-container-highest/40';
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    if (severity === 'critical') return <span className="material-symbols-outlined text-error text-[14px]">error</span>;
    if (severity === 'warning') return <span className="material-symbols-outlined text-secondary text-[14px]">warning</span>;
    return <span className="material-symbols-outlined text-primary text-[14px]">info</span>;
  };

  const getSeverityTextColor = (severity: AlertSeverity) => {
    if (severity === 'critical') return 'text-error';
    if (severity === 'warning') return 'text-secondary';
    return 'text-primary';
  };

  const criticalCount = alerts.filter(a => a.severity === 'critical' && a.status === 'Unacknowledged').length;

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
            {criticalCount > 0 && (
              <span className="bg-error/20 text-error font-label-mono text-[10px] px-2 py-0.5 rounded-full border border-error/30 animate-pulse">
                {criticalCount} CRITICAL
              </span>
            )}
          </div>
          <div className="flex gap-2 mb-2">
            <button 
              onClick={() => setFilter('all')}
              className={`flex-1 py-1 rounded font-label-mono text-label-mono border transition-colors ${filter === 'all' ? 'bg-surface-container-highest text-primary border-primary/20' : 'text-on-surface-variant border-transparent hover:bg-surface-container-highest'}`}
            >
              All
            </button>
            <button 
              onClick={() => setFilter('critical')}
              className={`flex-1 py-1 rounded font-label-mono text-label-mono border transition-colors ${filter === 'critical' ? 'bg-surface-container-highest text-error border-error/20' : 'text-on-surface-variant border-transparent hover:bg-surface-container-highest'}`}
            >
              Critical
            </button>
            <button 
              onClick={() => setFilter('warning')}
              className={`flex-1 py-1 rounded font-label-mono text-label-mono border transition-colors ${filter === 'warning' ? 'bg-surface-container-highest text-secondary border-secondary/20' : 'text-on-surface-variant border-transparent hover:bg-surface-container-highest'}`}
            >
              Warning
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scroll-hide p-2 space-y-2">
          {filteredAlerts.length === 0 ? (
            <div className="p-4 text-center text-on-surface-variant font-label-mono text-sm opacity-60">
              No alerts match the selected filter.
            </div>
          ) : (
            filteredAlerts.map(alert => {
              const isSelected = selectedAlert?.id === alert.id;
              return (
                <div 
                  key={alert.id}
                  onClick={() => setSelectedAlertId(alert.id)}
                  className={`p-3 border-l-4 rounded-lg cursor-pointer transition-all ${getSeverityColors(alert.severity, isSelected)}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`font-label-mono text-label-mono font-bold ${getSeverityTextColor(alert.severity)}`}>
                      {alert.target}
                    </span>
                    <span className="font-label-mono text-[10px] text-on-surface-variant/60">{alert.time}</span>
                  </div>
                  <div className="font-headline-sm text-[16px] text-on-surface mb-1">
                    {alert.title}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getSeverityIcon(alert.severity)}
                      <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Type: {alert.type}</span>
                    </div>
                    {alert.status !== 'Unacknowledged' && (
                      <span className={`font-label-mono text-[9px] px-1.5 py-0.5 rounded border ${alert.status === 'Acknowledged' ? 'border-primary/50 text-primary bg-primary/10' : 'border-error/50 text-error bg-error/10'}`}>
                        {alert.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Right Pane: Detailed View */}
      <section className="flex-1 flex flex-col gap-card-gap">
        {selectedAlert ? (
          <>
            {/* Header Detail */}
            <div className="glass p-inner-padding rounded-xl flex justify-between items-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 pointer-events-none"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`p-1 rounded-full material-symbols-outlined ${getSeverityTextColor(selectedAlert.severity)} bg-${selectedAlert.severity === 'critical' ? 'error' : selectedAlert.severity === 'warning' ? 'secondary' : 'primary'}/20`}>
                    satellite_alt
                  </span>
                  <h3 className="font-display-lg text-display-lg text-on-surface">{selectedAlert.target}</h3>
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col">
                    <span className="font-label-mono text-[10px] text-on-surface-variant/60 uppercase">Status</span>
                    <span className={`font-body-md ${selectedAlert.status === 'Unacknowledged' ? 'text-error' : 'text-primary'}`}>
                      {selectedAlert.status === 'Unacknowledged' ? 'Monitoring Required' : selectedAlert.status}
                    </span>
                  </div>
                  <div className="flex flex-col border-l border-outline-variant/20 pl-4">
                    <span className="font-label-mono text-[10px] text-on-surface-variant/60 uppercase">Altitude</span>
                    <span className="font-body-md text-on-surface">{selectedAlert.altitude}</span>
                  </div>
                  <div className="flex flex-col border-l border-outline-variant/20 pl-4">
                    <span className="font-label-mono text-[10px] text-on-surface-variant/60 uppercase">Velocity</span>
                    <span className="font-body-md text-on-surface">{selectedAlert.velocity}</span>
                  </div>
                </div>
              </div>
              <div className="relative z-10 flex gap-3">
                <button 
                  onClick={handleAcknowledge}
                  disabled={selectedAlert.status === 'Acknowledged'}
                  className="px-6 py-2 border border-outline-variant/50 rounded-lg font-bold hover:bg-surface-container-highest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedAlert.status === 'Acknowledged' ? 'Acknowledged' : 'Acknowledge'}
                </button>
                <button 
                  onClick={handleEscalate}
                  disabled={selectedAlert.status === 'Escalated'}
                  className="px-6 py-2 bg-error text-on-error font-bold rounded-lg shadow-lg shadow-error/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedAlert.status === 'Escalated' ? 'Escalated' : 'Escalate'}
                </button>
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
                          <span className={`${getSeverityTextColor(selectedAlert.severity)} font-bold`}>
                            {selectedAlert.severity === 'critical' ? '1:4,200' : selectedAlert.severity === 'warning' ? '1:15,000' : 'Nominal'}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                          <div className={`h-full ${selectedAlert.severity === 'critical' ? 'bg-error' : selectedAlert.severity === 'warning' ? 'bg-secondary' : 'bg-primary'}`} style={{ width: selectedAlert.severity === 'critical' ? '72%' : selectedAlert.severity === 'warning' ? '45%' : '12%' }}></div>
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
                    <p><span className="text-primary">[12:21:45]</span> OBJECT IDENTIFIED: {selectedAlert.target}</p>
                    <p><span className={getSeverityTextColor(selectedAlert.severity)}>[12:22:12]</span> {selectedAlert.severity === 'critical' ? 'ANOMALY DETECTED: Path deviation > 0.05%' : 'LOG: Trajectory plotted successfully.'}</p>
                    
                    {messages.map((msg, idx) => (
                      <p key={idx}><span className="text-secondary">[{new Date().toLocaleTimeString()}]</span> LIVE EVENT: {msg.data}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center font-label-mono text-on-surface-variant opacity-50">
            No alert selected.
          </div>
        )}
      </section>
    </div>
  );
}
