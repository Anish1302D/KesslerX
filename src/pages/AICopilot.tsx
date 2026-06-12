import { useState, useRef, useEffect, KeyboardEvent } from 'react';

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
  const chatContainerRef = useRef<HTMLDivElement>(null);

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
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/ai/chat`, {
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
                              <button className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors">fullscreen</button>
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
                              <button className="px-3 py-1 border border-primary/40 text-primary font-label-mono text-[11px] rounded hover:bg-primary/10 transition-colors">
                                VIEW TELEMETRY
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="font-body-md text-on-surface-variant/80 italic border-l-2 border-primary/30 pl-4 py-1">
                          Recommendation: Initiate altitude adjustment for NOAA-19 (+2.4km) within the next launch window.
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
                <button className="material-symbols-outlined text-on-surface-variant hover:text-primary p-2 transition-colors">attach_file</button>
                <button className="material-symbols-outlined text-on-surface-variant hover:text-primary p-2 transition-colors">mic</button>
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all glow-primary disabled:opacity-50 disabled:hover:scale-100"
                >
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </div>
            
            <div className="mt-4 flex justify-center gap-6">
              <button className="font-label-mono text-[10px] text-on-surface-variant/50 hover:text-primary transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">bolt</span> QUICK ANALYZE NEAREST NEIGHBORS
              </button>
              <button className="font-label-mono text-[10px] text-on-surface-variant/50 hover:text-primary transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">visibility</span> TOGGLE CONSTELLATION OVERLAY
              </button>
              <button className="font-label-mono text-[10px] text-on-surface-variant/50 hover:text-primary transition-colors flex items-center gap-1">
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
    </div>
  );
}
