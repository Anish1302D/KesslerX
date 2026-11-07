import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ReportPreviewModal from '../components/handoff/ReportPreviewModal';
import { useEvents } from '../hooks/useHandoffAPI';
import { type HandoffEvent, DEFAULT_DEMO_USERS, DEFAULT_DEMO_EVENTS } from '../data/handoffTypes';

export default function Reports() {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'PDF' | 'JSON' | 'CSV'>('PDF');
  const [previewEvent, setPreviewEvent] = useState<HandoffEvent | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [fallbackPreviewEvent] = useState<HandoffEvent>(() => DEFAULT_DEMO_EVENTS[0]);
  const [hookStatusMessage, setHookStatusMessage] = useState<string | null>(null);
  const { events } = useEvents();

  const exportPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#050816', // Dark background
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`kesslerx_intelligence_report_${Date.now()}.pdf`);
    } catch (e) {
      console.error('Failed to export PDF', e);
    } finally {
      setIsExporting(false);
    }
  };

  const exportJSON = () => {
    const evidencePackage = {
      report_title: 'KesslerX Orbital Safety & Conjunction Intelligence Synthesis',
      software_version: '2.1.0',
      generated_at: new Date().toISOString(),
      disclaimer: 'Decision support only — human approval required. Not a flight command system.',
      provenance: {
        orbital_catalog: 'Space-Track Analytical SGP4 Ephemeris',
        space_weather: 'NOAA SWPC F10.7 Solar Flux & Planetary Kp',
        mode: 'derived',
      },
      conjunction_evidence: [
        {
          id: 'CX-9921-A',
          primary: 'STARLINK-3021 (NORAD 44238)',
          secondary: 'DEBRIS-88172 (NORAD 88172)',
          miss_distance_km: 0.12,
          collision_probability: 0.098,
          tca_utc: new Date(Date.now() + 14 * 3600000).toISOString(),
          risk_level: 'CRITICAL',
          negotiated_intent: 'Retrograde burn on STARLINK-3021, delta-v 0.45 m/s',
        },
        {
          id: 'CX-9921-B',
          primary: 'ISS (ZARYA) (NORAD 25544)',
          secondary: 'COSMOS-DEB-4421 (NORAD 44210)',
          miss_distance_km: 0.38,
          collision_probability: 0.067,
          tca_utc: new Date(Date.now() + 19 * 3600000).toISOString(),
          risk_level: 'HIGH',
          negotiated_intent: 'SSN Radar tasking requested to verify covariance',
        },
      ],
      system_telemetry: {
        tracked_objects: 34210,
        active_critical_conjunctions: 2,
        space_weather_kp: 3,
      },
    };
    const blob = new Blob([JSON.stringify(evidencePackage, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kesslerx-evidence-package-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = ['Event_ID', 'Primary_Object', 'Secondary_Object', 'Miss_Distance_km', 'P_Collision', 'TCA_UTC', 'Risk_Level', 'Disclaimer'];
    const rows = [
      ['CX-9921-A', 'STARLINK-3021', 'DEBRIS-88172', '0.12', '0.098', new Date(Date.now() + 14 * 3600000).toISOString(), 'CRITICAL', 'Decision support only — human approval required'],
      ['CX-9921-B', 'ISS (ZARYA)', 'COSMOS-DEB-4421', '0.38', '0.067', new Date(Date.now() + 19 * 3600000).toISOString(), 'HIGH', 'Decision support only — human approval required'],
      ['CX-9921-C', 'ONEWEB-0012', 'DEBRIS-72401', '0.89', '0.042', new Date(Date.now() + 21 * 3600000).toISOString(), 'HIGH', 'Decision support only — human approval required'],
    ];
    const csvContent = [headers.join(','), ...rows.map(r => r.map(f => `"${f}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kesslerx-conjunctions-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCompile = () => {
    if (selectedFormat === 'PDF') {
      exportPDF();
    } else if (selectedFormat === 'JSON') {
      exportJSON();
    } else {
      exportCSV();
    }
  };

  const handleOpenPreview = (eventItem?: HandoffEvent) => {
    const evt = eventItem || events[0] || null;
    setPreviewEvent(evt);
    setShowPreviewModal(true);
  };

  return (
    <div className="space-y-card-gap pb-20 custom-scrollbar" ref={reportRef}>
      {/* Page Hero / Dashboard Summary */}
      <div className="grid grid-cols-12 gap-card-gap">
        <div className="col-span-12 md:col-span-8 space-y-card-gap">
          {/* Section: Report Generation & Featured */}
          <div className="glass rounded-xl p-inner-padding relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50 animate-[scan_4s_linear_infinite]"></div>
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">analytics</span>
                  Intelligence Synthesis
                </h2>
                <p className="font-body-md text-body-md text-on-surface-variant/70">Aggregate multi-source orbital data into mission-ready reports.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHookStatusMessage('Template presets active: Conjunction Safety, ITU Spectrum, Debris Drift.')}
                  className="px-4 py-2 bg-surface-container-highest/50 border border-outline-variant/30 rounded font-label-mono text-label-mono hover:bg-primary/20 transition-all"
                >
                  TEMPLATES
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-inner-padding">
              {/* Featured Report 1 */}
              <div className="group cursor-pointer">
                <div className="bg-surface-container-low border border-outline-variant/20 rounded-lg p-inner-padding hover:border-primary/50 transition-all h-full relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 opacity-10">
                    <span className="material-symbols-outlined text-7xl">security</span>
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-label-mono mb-3">CRITICAL</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">Weekly Orbital Safety Summary</h3>
                  <p className="font-body-md text-xs text-on-surface-variant/60 leading-relaxed mb-4">Collision probability heatmap and conjunction assessment for active lanes.</p>
                  <div className="flex items-center text-primary gap-1 font-label-mono text-[11px] group-hover:translate-x-1 transition-transform">
                    GENERATE NOW <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </div>
                </div>
              </div>

              {/* Featured Report 2 */}
              <div className="group cursor-pointer">
                <div className="bg-surface-container-low border border-outline-variant/20 rounded-lg p-inner-padding hover:border-secondary-container/50 transition-all h-full relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 opacity-10">
                    <span className="material-symbols-outlined text-7xl">data_exploration</span>
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded bg-secondary-container/10 text-secondary-container text-[10px] font-label-mono mb-3">ANALYTICS</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">Debris Trend Analysis Q3</h3>
                  <p className="font-body-md text-xs text-on-surface-variant/60 leading-relaxed mb-4">Fragmentation event tracking and long-term population density forecasts.</p>
                  <div className="flex items-center text-secondary-container gap-1 font-label-mono text-[11px] group-hover:translate-x-1 transition-transform">
                    GENERATE NOW <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </div>
                </div>
              </div>

              {/* Featured Report 3 */}
              <div className="group cursor-pointer">
                <div className="bg-surface-container-low border border-outline-variant/20 rounded-lg p-inner-padding hover:border-on-surface/30 transition-all h-full relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 opacity-10">
                    <span className="material-symbols-outlined text-7xl">hub</span>
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant text-[10px] font-label-mono mb-3">SYSTEMS</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">Satellite Health Audit</h3>
                  <p className="font-body-md text-xs text-on-surface-variant/60 leading-relaxed mb-4">Operational status review and maneuver capability assessment per fleet.</p>
                  <div className="flex items-center text-on-surface-variant gap-1 font-label-mono text-[11px] group-hover:translate-x-1 transition-transform">
                    GENERATE NOW <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Recent Reports */}
          <div className="glass rounded-xl p-inner-padding">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Mission Archive</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 font-label-mono text-xs text-on-surface-variant/50">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span> LIVE SYNC
                </div>
                <button onClick={() => {}} className="material-symbols-outlined text-on-surface-variant hover:text-primary">filter_list</button>
              </div>
            </div>

            <div className="overflow-hidden border border-outline-variant/10 rounded-lg">
              <table className="w-full text-left font-body-md text-body-md">
                <thead className="bg-surface-container-high/50 font-label-mono text-label-mono text-on-surface-variant uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-inner-padding py-4">Report Identifier</th>
                    <th className="px-inner-padding py-4">Status</th>
                    <th className="px-inner-padding py-4">Timestamp (UTC)</th>
                    <th className="px-inner-padding py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  <tr className="hover:bg-primary/5 transition-colors group">
                    <td className="px-inner-padding py-4">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary/70">picture_as_pdf</span>
                        <div>
                          <p className="font-medium">StarLink-Conjunction-2024-W12</p>
                          <p className="text-xs text-on-surface-variant/50 font-label-mono">SAFETY | LEO-A</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-inner-padding py-4">
                      <span className="px-2 py-0.5 rounded-full bg-secondary-container/20 text-secondary-container text-[11px] font-bold">READY</span>
                    </td>
                    <td className="px-inner-padding py-4 font-label-mono text-sm">2024.05.21 09:12</td>
                    <td className="px-inner-padding py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={exportPDF}
                          className="material-symbols-outlined text-sm p-1.5 hover:bg-surface-container-highest rounded text-primary"
                          title="Download PDF"
                        >
                          download
                        </button>
                        <button
                          onClick={() => handleOpenPreview()}
                          className="material-symbols-outlined text-sm p-1.5 hover:bg-surface-container-highest rounded text-cyan-400"
                          title="Preview Interactive Report"
                        >
                          visibility
                        </button>
                        <button
                          onClick={exportJSON}
                          className="material-symbols-outlined text-sm p-1.5 hover:bg-surface-container-highest rounded text-amber-400"
                          title="Export Audit Evidence JSON"
                        >
                          data_object
                        </button>
                      </div>
                    </td>
                  </tr>

                  <tr className="hover:bg-primary/5 transition-colors group">
                    <td className="px-inner-padding py-4">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-secondary-container/70">terminal</span>
                        <div>
                          <p className="font-medium">Kessler-Drift-Modeling-PRO</p>
                          <p className="text-xs text-on-surface-variant/50 font-label-mono">ANALYTICS | GRID-09</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-inner-padding py-4">
                      <div className="flex items-center gap-2 text-primary text-[11px] font-bold">
                        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        GENERATING
                      </div>
                    </td>
                    <td className="px-inner-padding py-4 font-label-mono text-sm">2024.05.21 12:40</td>
                    <td className="px-inner-padding py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setHookStatusMessage('Generation job #402 monitored by background scheduler.')}
                        title="Job status"
                        className="material-symbols-outlined text-sm p-1.5 hover:bg-surface-container-highest rounded text-on-surface-variant/70"
                      >
                        info
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-primary/5 transition-colors group">
                    <td className="px-inner-padding py-4">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-on-surface-variant/70">inventory_2</span>
                        <div>
                          <p className="font-medium">ITU-Spectrum-Compliance-Log</p>
                          <p className="text-xs text-on-surface-variant/50 font-label-mono">COMPLIANCE | GLOBAL</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-inner-padding py-4">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase">Archived</span>
                    </td>
                    <td className="px-inner-padding py-4 font-label-mono text-sm">2024.05.18 22:01</td>
                    <td className="px-inner-padding py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setHookStatusMessage('ITU Compliance report unarchived to active repository.')}
                          title="Restore Report"
                          className="material-symbols-outlined text-sm p-1.5 hover:bg-surface-container-highest rounded text-on-surface-variant"
                        >
                          unarchive
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPreview()}
                          title="Preview Report"
                          className="material-symbols-outlined text-sm p-1.5 hover:bg-surface-container-highest rounded text-cyan-400"
                        >
                          visibility
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Builder & Automation */}
        <div className="col-span-12 md:col-span-4 space-y-card-gap">
          {/* Report Builder */}
          <div className="glass rounded-xl p-inner-padding border-l-4 border-l-primary relative overflow-hidden">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">build</span>
              Report Builder
            </h3>
            <div className="space-y-4">
              <div>
                <label className="font-label-mono text-[10px] text-on-surface-variant/70 mb-1.5 block uppercase tracking-wider">Metric Universe</label>
                <select className="w-full bg-surface-container-lowest/50 border border-outline-variant/30 rounded px-3 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary outline-none">
                  <option>Orbital Safety &amp; Conjunction</option>
                  <option>Historical Debris Drift</option>
                  <option>Compliance &amp; Spectrum</option>
                  <option>Constellation Performance</option>
                </select>
              </div>
              <div>
                <label className="font-label-mono text-[10px] text-on-surface-variant/70 mb-1.5 block uppercase tracking-wider">Temporal Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <input className="bg-surface-container-lowest/50 border border-outline-variant/30 rounded px-3 py-2 text-xs text-on-surface-variant focus:ring-1 focus:ring-primary outline-none" type="date" />
                  <input className="bg-surface-container-lowest/50 border border-outline-variant/30 rounded px-3 py-2 text-xs text-on-surface-variant focus:ring-1 focus:ring-primary outline-none" type="date" />
                </div>
              </div>
              <div>
                <label className="font-label-mono text-[10px] text-on-surface-variant/70 mb-1.5 block uppercase tracking-wider">Output Protocol</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFormat('PDF')}
                    className={`border font-label-mono text-[10px] py-2 rounded transition-all ${
                      selectedFormat === 'PDF' ? 'border-primary/50 bg-primary/20 text-primary font-bold' : 'border-outline-variant/30 text-on-surface-variant/60 hover:bg-surface-container-high'
                    }`}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFormat('JSON')}
                    className={`border font-label-mono text-[10px] py-2 rounded transition-all ${
                      selectedFormat === 'JSON' ? 'border-primary/50 bg-primary/20 text-primary font-bold' : 'border-outline-variant/30 text-on-surface-variant/60 hover:bg-surface-container-high'
                    }`}
                  >
                    JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFormat('CSV')}
                    className={`border font-label-mono text-[10px] py-2 rounded transition-all ${
                      selectedFormat === 'CSV' ? 'border-primary/50 bg-primary/20 text-primary font-bold' : 'border-outline-variant/30 text-on-surface-variant/60 hover:bg-surface-container-high'
                    }`}
                  >
                    CSV
                  </button>
                </div>
              </div>
              <button 
                onClick={handleCompile}
                disabled={isExporting}
                className={`w-full mt-4 bg-primary text-on-primary font-headline-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-all font-bold ${isExporting ? 'opacity-50 cursor-wait' : 'hover:brightness-110 glow-primary'}`}
              >
                {isExporting ? (
                  <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div> Compiling...</>
                ) : (
                  <><span className="material-symbols-outlined">rocket_launch</span> Compile {selectedFormat} Report</>
                )}
              </button>
            </div>
          </div>

          {/* Automation */}
          <div className="glass rounded-xl p-inner-padding bg-gradient-to-br from-surface-container/30 to-surface-container-highest/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Automation Hooks</h3>
              <span className="material-symbols-outlined text-secondary-container">schedule</span>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded bg-surface-container-low border border-outline-variant/10">
                <div>
                  <p className="font-body-md text-sm font-medium">Daily Security Digest</p>
                  <p className="font-label-mono text-[10px] text-on-surface-variant/50">06:00 UTC | Stakeholder Hub</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-9 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface-variant after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-on-primary"></div>
                </label>
              </div>
              <div className="flex items-center justify-between p-3 rounded bg-surface-container-low border border-outline-variant/10">
                <div>
                  <p className="font-body-md text-sm font-medium">Weekly Compliance Audit</p>
                  <p className="font-label-mono text-[10px] text-on-surface-variant/50">Sunday 00:00 UTC | PDF</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-9 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface-variant after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <button
                type="button"
                onClick={() => setHookStatusMessage('Simulated Webhook endpoint active: Daily digest configured for 06:00 UTC dispatch.')}
                className="w-full border border-outline-variant/30 py-2.5 rounded font-label-mono text-label-mono text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                CONFIGURE NEW HOOK
              </button>
              {hookStatusMessage && (
                <p className="text-[10px] font-mono text-emerald-400 text-center animate-fade-in">{hookStatusMessage}</p>
              )}
            </div>
          </div>

          {/* System Health Visual */}
          <div className="glass rounded-xl p-inner-padding h-48 relative flex items-center justify-center">
            <div className="absolute inset-0 z-0"></div>
            <div className="relative z-10 text-center">
              <p className="font-label-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2">Live Node Status</p>
              <p className="font-stat-lg text-stat-lg text-white">99.98<span className="text-primary">%</span></p>
              <div className="mt-2 flex justify-center gap-1">
                <div className="h-1 w-4 bg-primary/80 rounded-full"></div>
                <div className="h-1 w-4 bg-primary/80 rounded-full"></div>
                <div className="h-1 w-4 bg-primary/80 rounded-full"></div>
                <div className="h-1 w-4 bg-primary/80 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPreviewModal && (
        <ReportPreviewModal
          isOpen={showPreviewModal}
          event={previewEvent || (events && events.length > 0 ? events[0] : fallbackPreviewEvent)}
          handoffs={[]}
          timeline={[]}
          currentUser={DEFAULT_DEMO_USERS[0]}
          users={DEFAULT_DEMO_USERS}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  );
}
