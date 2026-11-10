import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import ProvenanceBadge from '../components/ui/ProvenanceBadge';
import { getApiUrl, API_ENDPOINTS } from '../config/api';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export default function AICopilot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: "I've completed the analysis for the Starlink-88 Debris Cloud (Cluster 402). The cloud is currently dispersing through LEO sector 4-B. High collision probability detected for two active meteorological satellites within the next 72 hours."
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [isFullscreenPath, setIsFullscreenPath] = useState(false);
  const [constellationOverlayActive, setConstellationOverlayActive] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.AI_CHAT), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: userMessage.content })
      });
      
      const data = await response.json();
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: data.response
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: "Error communicating with the Kessler-Core backend. Please check connection."
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const preview = content.slice(0, 300);
        setInput(`Analyze uploaded orbital data (${file.name}):\n${preview}...`);
        setStatusNotification(`Loaded ${file.name} for AI analysis.`);
      }
    };
    reader.readAsText(file);
  };

  const handleToggleMic = () => {
    if (isListeningMic) {
      setIsListeningMic(false);
      setStatusNotification(null);
      return;
    }
    setIsListeningMic(true);
    setStatusNotification('Voice input active: Listening for orbital command query...');
    setTimeout(() => {
      setInput('Analyze nearest orbital neighbors and evaluate collision avoidance maneuvers for Starlink-3021.');
      setIsListeningMic(false);
      setStatusNotification(null);
    }, 1500);
  };

  const handleExportSession = () => {
    const sessionData = {
      session_id: `COPILOT-LOG-${Date.now()}`,
      exported_at: new Date().toISOString(),
      disclaimer: 'Decision support only — human approval required. Not a flight command system.',
      provenance: {
        engine: 'KesslerX AI Copilot',
        model: 'Gemini 1.5 Pro (SSA Fine-tuned)',
        mode: 'derived',
      },
      messages,
    };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kesslerx-copilot-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusNotification('Copilot session transcript exported successfully.');
  };

  const handleQuickPrompt = (promptText: string) => {
    setInput(promptText);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] -m-container-margin bg-background">
      {/* Main Content Canvas */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-surface-dim">
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-container-margin py-8 space-y-10 relative z-10 scroll-smooth custom-scrollbar" id="chat-container" ref={chatContainerRef}>
          {/* Initial Welcome */}
          <div className="max-w-4xl mx-auto flex flex-col items-center text-center mt-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-6 glow-primary border-primary/30">
              <span className="material-symbols-outlined text-primary text-4xl">smart_toy</span>
            </div>
            <h1 className="font-display-lg text-display-lg text-on-surface mb-2 tracking-tight">Kessler AI Copilot</h1>
            <p className="font-body-lg text-on-surface-variant/70 max-w-lg">Advanced orbital mechanics engine. Ready for debris analysis, path prediction, and risk assessment.</p>
            <div className="flex items-center gap-2 mt-3">
              <ProvenanceBadge source="local" mode="derived" warnings={['Decision-support advisory — requires human verification before operational action']} />
            </div>
            {statusNotification && (
              <div className="mt-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded animate-fade-in">
                {statusNotification}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'ai' && (
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0 border border-primary/30 mt-1">
                    <span className="material-symbols-outlined text-primary text-sm">smart_toy</span>
                  </div>
                )}
                
                {msg.role === 'user' ? (
                  <div className="glass px-4 py-3 rounded-2xl rounded-tr-none max-w-md border-primary/20">
                    <p className="font-body-md text-on-surface whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ) : (
                  <div className="space-y-4 flex-1">
                    <div className="font-body-lg text-on-surface whitespace-pre-wrap">
                      {msg.content}
                    </div>
                    
                    {/* Render the Bento Grid only for the first specific message to keep the cool UI */}
                    {msg.id === '1' && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Risk Summary Card */}
                          <div className="glass p-inner-padding rounded-xl relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-6">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-error">warning</span>
                                <h3 className="font-headline-sm text-headline-sm">Risk Summary</h3>
                              </div>
                              <span className="font-label-mono text-label-mono bg-error-container/20 text-error px-2 py-1 rounded">CRITICAL</span>
                            </div>
                            <div className="flex flex-col items-center py-4">
                              <div className="relative w-32 h-32 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90">
                                  <circle className="text-surface-container-highest" cx="64" cy="64" fill="transparent" r="58" stroke="currentColor" strokeWidth="8"></circle>
                                  <circle className="text-error" cx="64" cy="64" fill="transparent" r="58" stroke="currentColor" strokeDasharray="364.4" strokeDashoffset="40" strokeLinecap="round" strokeWidth="8"></circle>
                                </svg>
                                <div className="absolute flex flex-col items-center">
                                  <span className="font-stat-lg text-stat-lg glow-text">89%</span>
                                  <span className="font-label-mono text-[10px] text-on-surface-variant">THREAT LEVEL</span>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-outline-variant/10">
                              <div className="text-center">
                                <div className="font-label-mono text-on-surface-variant text-[10px]">OBJECTS</div>
                                <div className="font-headline-sm">1,242</div>
                              </div>
                              <div className="text-center">
                                <div className="font-label-mono text-on-surface-variant text-[10px]">RADIUS</div>
                                <div className="font-headline-sm">12.4km</div>
                              </div>
                            </div>
                          </div>

                          {/* Predicted Path Card */}
                          <div className="glass p-inner-padding rounded-xl relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">timeline</span>
                                <h3 className="font-headline-sm text-headline-sm">Predicted Path</h3>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsFullscreenPath(prev => !prev)}
                                className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors"
                                title={isFullscreenPath ? "Exit Fullscreen" : "Fullscreen Path Visualization"}
                              >
                                {isFullscreenPath ? 'fullscreen_exit' : 'fullscreen'}
                              </button>
                            </div>
                            <div className="h-40 w-full bg-surface-container-low/50 rounded border border-outline-variant/5 relative overflow-hidden">
                              <div className="absolute bottom-2 left-2 flex gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                                <span className="font-label-mono text-[9px] text-primary/80 uppercase">Real-time simulation</span>
                              </div>
                            </div>
                            <div className="mt-4 flex justify-between items-center">
                              <div>
                                <div className="font-label-mono text-on-surface-variant text-[10px]">T-MINUS INTERSECT</div>
                                <div className="font-headline-sm text-primary">04:12:44</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowTelemetryModal(true)}
                                className="px-3 py-1 border border-primary/40 text-primary font-label-mono text-[11px] rounded hover:bg-primary/10 transition-colors"
                              >
                                VIEW TELEMETRY
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 mt-2">
                          <div className="font-body-md text-on-surface-variant/80 italic border-l-2 border-primary/30 pl-4 py-1">
                            Recommendation: Initiate altitude adjustment for NOAA-19 (+2.4km) within the next launch window.
                          </div>
                          <div className="flex items-center gap-2 p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
                            <span className="material-symbols-outlined text-sm">warning</span>
                            <span>Decision support only — human approval required. Not a flight command system.</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded bg-surface-container-high border border-outline-variant/20 flex items-center justify-center shrink-0 mt-1">
                     <span className="font-label-mono text-[10px]">MC</span>
                  </div>
                )}
              </div>
            ))}

            {/* AI Processing State */}
            {isLoading && (
              <div className="flex gap-4 mt-6">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0 border border-primary/30">
                  <span className="material-symbols-outlined text-primary text-sm">smart_toy</span>
                </div>
                <div className="flex items-center gap-1 bg-surface-container-low px-4 py-3 rounded-2xl rounded-tl-none border border-outline-variant/10">
                  <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '-0.15s' }}></div>
                  <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '-0.3s' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Wide Input Bar */}
        <div className="p-container-margin relative z-20">
          <div className="max-w-4xl mx-auto">
            <div className="glass flex items-end gap-3 p-3 rounded-2xl glow-primary border-primary/20 focus-within:border-primary/50 transition-all">
              <div className="flex flex-col flex-1 gap-2">
                <div className="flex gap-2 px-2">
                  <span className="bg-surface-container-highest/50 px-2 py-0.5 rounded font-label-mono text-[10px] text-on-surface-variant border border-outline-variant/10">Orbit: LEO</span>
                  <span className="bg-surface-container-highest/50 px-2 py-0.5 rounded font-label-mono text-[10px] text-on-surface-variant border border-outline-variant/10">Engine: K-42</span>
                </div>
                <textarea 
                  className="w-full bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/40 font-body-lg resize-none py-2 px-2 outline-none" 
                  placeholder="Ask Kessler AI about orbital events..." 
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                ></textarea>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".tle,.txt,.json,.csv"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="material-symbols-outlined text-on-surface-variant hover:text-primary p-2 transition-colors"
                  title="Upload orbital data / TLE file"
                >
                  attach_file
                </button>
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`material-symbols-outlined p-2 transition-colors ${
                    isListeningMic ? 'text-error animate-pulse' : 'text-on-surface-variant hover:text-primary'
                  }`}
                  title={isListeningMic ? "Recording voice input..." : "Voice query input"}
                >
                  {isListeningMic ? 'mic' : 'mic_none'}
                </button>
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all glow-primary disabled:opacity-50 disabled:hover:scale-100"
                >
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </div>
            
            <div className="mt-4 flex flex-wrap justify-center gap-6">
              <button
                type="button"
                onClick={() => handleQuickPrompt('Perform high-conjunction screening for nearest active LEO neighbors within 50 km over next 72 hours.')}
                className="font-label-mono text-[10px] text-on-surface-variant/70 hover:text-primary transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">bolt</span> QUICK ANALYZE NEAREST NEIGHBORS
              </button>
              <button
                type="button"
                onClick={() => {
                  setConstellationOverlayActive(prev => !prev);
                  setStatusNotification(!constellationOverlayActive ? 'Constellation orbital layer overlaid on copilot context.' : 'Constellation overlay hidden.');
                }}
                className={`font-label-mono text-[10px] transition-colors flex items-center gap-1 ${constellationOverlayActive ? 'text-primary font-bold' : 'text-on-surface-variant/70 hover:text-primary'}`}
              >
                <span className="material-symbols-outlined text-[14px]">visibility</span> {constellationOverlayActive ? 'CONSTELLATION LAYER ACTIVE' : 'TOGGLE CONSTELLATION OVERLAY'}
              </button>
              <button
                type="button"
                onClick={handleExportSession}
                className="font-label-mono text-[10px] text-on-surface-variant/70 hover:text-primary transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">save</span> EXPORT SESSION TO MISSION LOG
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Right Panel (Contextual Data) */}
      <aside className="w-80 bg-surface-container-lowest/20 border-l border-outline-variant/10 p-section-padding space-y-6 hidden lg:block overflow-y-auto custom-scrollbar shrink-0">
        <h4 className="font-label-mono text-label-mono text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">settings_input_component</span>
          LIVE TELEMETRY FEED
        </h4>
        <div className="space-y-4">
          <div className="border border-outline-variant/15 p-3 rounded bg-surface-container-low/30 group hover:border-primary/30 transition-colors">
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-mono text-[10px] text-on-surface-variant">NOAA-19</span>
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-label-mono text-on-surface-variant/50">ALTITUDE</div>
                <div className="text-body-md font-label-mono">847.2 KM</div>
              </div>
              <div>
                <div className="text-[10px] font-label-mono text-on-surface-variant/50">VELOCITY</div>
                <div className="text-body-md font-label-mono">7.42 KM/S</div>
              </div>
            </div>
            <div className="mt-2 h-1 bg-surface-container-highest rounded overflow-hidden">
              <div className="h-full bg-primary w-2/3"></div>
            </div>
          </div>

          <div className="border border-outline-variant/15 p-3 rounded bg-surface-container-low/30 group hover:border-error/30 transition-colors">
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-mono text-[10px] text-on-surface-variant">DEBRIS_ID:402_A</span>
              <span className="w-2 h-2 rounded-full bg-error"></span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-label-mono text-on-surface-variant/50">REL_DISTANCE</div>
                <div className="text-body-md font-label-mono text-error">42.1 KM</div>
              </div>
              <div>
                <div className="text-[10px] font-label-mono text-on-surface-variant/50">TRAJECTORY</div>
                <div className="text-body-md font-label-mono">STABLE</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-label-mono text-label-mono text-on-surface-variant/50 uppercase tracking-widest text-[10px]">Environment Status</h4>
          <div className="flex items-center justify-between text-body-md">
            <span>Solar Flux</span>
            <span className="text-primary font-label-mono">142.1 SFU</span>
          </div>
          <div className="flex items-center justify-between text-body-md">
            <span>Geomagnetic Kp</span>
            <span className="text-primary font-label-mono">2 (Quiet)</span>
          </div>
          <div className="flex items-center justify-between text-body-md">
            <span>Ionospheric Delay</span>
            <span className="text-secondary font-label-mono">HIGH</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-surface-container-highest/20 border border-outline-variant/10 mt-auto">
          <div className="flex items-center gap-2 text-primary mb-2">
            <span className="material-symbols-outlined text-[20px]">verified_user</span>
            <span className="font-headline-sm text-sm">Security Node</span>
          </div>
          <p className="text-[12px] text-on-surface-variant leading-relaxed">
            Copilot session is encrypted via AES-256 GCM. All recommendations verified by Kessler-Core protocols.
          </p>
        </div>
      </aside>

      {/* Telemetry Detail Modal */}
      {showTelemetryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass max-w-lg w-full rounded-2xl p-6 border border-primary/30 space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-headline-sm text-lg text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">sensors</span>
                NOAA-19 Detailed Telemetry Feed
              </h3>
              <button
                type="button"
                onClick={() => setShowTelemetryModal(false)}
                className="text-on-surface-variant hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/10">
                <div className="text-on-surface-variant/60">NORAD ID</div>
                <div className="text-white text-sm font-bold">33591</div>
              </div>
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/10">
                <div className="text-on-surface-variant/60">APOGEE / PERIGEE</div>
                <div className="text-white text-sm font-bold">850 / 844 KM</div>
              </div>
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/10">
                <div className="text-on-surface-variant/60">INCLINATION</div>
                <div className="text-white text-sm font-bold">98.7°</div>
              </div>
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/10">
                <div className="text-on-surface-variant/60">MEAN MOTION</div>
                <div className="text-white text-sm font-bold">14.12 rev/day</div>
              </div>
            </div>
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
              Decision support only — live ephemeris propagated via SGP4. Human flight director authorization required.
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowTelemetryModal(false)}
                className="px-4 py-2 bg-primary text-black font-semibold rounded hover:brightness-110"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Path Modal */}
      {isFullscreenPath && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-headline-sm text-lg text-primary flex items-center gap-2">
              <span className="material-symbols-outlined">timeline</span>
              High-Fidelity Conjunction Trajectory Intersection (LEO Sector 4-B)
            </h3>
            <button
              type="button"
              onClick={() => setIsFullscreenPath(false)}
              className="px-3 py-1 bg-surface-container-highest rounded text-sm hover:text-white"
            >
              Exit Fullscreen
            </button>
          </div>
          <div className="flex-1 bg-surface-container-lowest/80 rounded-xl border border-primary/20 p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="text-center space-y-3">
              <span className="material-symbols-outlined text-6xl text-primary animate-pulse">radar</span>
              <p className="font-mono text-sm text-on-surface">Vector Angle: 34.2° | Relative Velocity: 14.1 km/s | Time to TCA: 04:12:44</p>
              <div className="text-xs text-on-surface-variant max-w-md mx-auto">
                Deterministic SGP4 intersection geometry. Risk mitigation envelope computed according to Space-Track TLE epoch.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
