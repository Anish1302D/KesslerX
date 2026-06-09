import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Send, Sparkles, Satellite, AlertTriangle, BarChart3, CloudSun, FileText, Shield } from 'lucide-react';
import { aiSuggestedPrompts, aiMockResponses } from '../data/mockData';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const capabilityCards = [
  { icon: Satellite, title: 'Object Analysis', desc: 'Query satellite catalog, orbital parameters, and status', color: '#00AEEF' },
  { icon: AlertTriangle, title: 'Collision Assessment', desc: 'Evaluate conjunction events and recommend maneuvers', color: '#FF4D4D' },
  { icon: BarChart3, title: 'Orbital Analytics', desc: 'Analyze trends in congestion, debris growth, and utilization', color: '#FFC107' },
  { icon: CloudSun, title: 'Space Weather', desc: 'Interpret solar activity impacts on satellite operations', color: '#00E5FF' },
  { icon: FileText, title: 'Report Generation', desc: 'Create situation reports and risk assessments', color: '#00FF99' },
  { icon: Shield, title: 'Risk Evaluation', desc: 'Assess overall orbital safety and sustainability metrics', color: '#9B59B6' },
];

export default function AICopilot() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (text?: string) => {
    const msg = text || input.trim();
    if (!msg) return;

    setMessages((prev) => [...prev, { id: `${Date.now()}`, role: 'user', content: msg, timestamp: new Date() }]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      setMessages((prev) => [...prev, {
        id: `${Date.now()}-ai`,
        role: 'assistant',
        content: aiMockResponses.default,
        timestamp: new Date(),
      }]);
      setIsTyping(false);
    }, 2000);
  };

  return (
    <div className="h-full flex flex-col pb-16">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="text-2xl font-orbitron font-bold text-white flex items-center gap-3">
          <Bot className="w-7 h-7" style={{ color: '#00E5FF', filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.5))' }} />
          AI Copilot
          <span className="text-[10px] font-space px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,255,0.1)', color: '#00E5FF', border: '1px solid rgba(0,229,255,0.2)' }}>
            BETA
          </span>
        </h1>
        <p className="text-sm font-space mt-1" style={{ color: '#94A3B8' }}>
          AI-powered orbital intelligence assistant
        </p>
      </motion.div>

      {/* Chat Area */}
      <div className="flex-1 glass-panel overflow-hidden flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className="relative">
                <Bot className="w-16 h-16" style={{ color: 'rgba(0,229,255,0.2)' }} />
                <Sparkles className="w-6 h-6 absolute -top-1 -right-1" style={{ color: '#00E5FF', animation: 'pulse-glow 2s ease-in-out infinite' }} />
              </div>
              <div className="text-center max-w-md">
                <h3 className="text-lg font-space font-semibold text-white mb-2">How can I help you?</h3>
                <p className="text-sm font-inter" style={{ color: '#94A3B8' }}>
                  I can analyze orbital data, assess collision risks, generate reports, and provide real-time space situational awareness.
                </p>
              </div>

              {/* Capability Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl w-full">
                {capabilityCards.map((card, i) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="p-3 rounded-lg cursor-pointer transition-all duration-200 hover:scale-105"
                    style={{ background: 'rgba(11,18,32,0.6)', border: '1px solid rgba(0,174,239,0.1)' }}
                  >
                    <card.icon className="w-4 h-4 mb-2" style={{ color: card.color }} />
                    <p className="text-xs font-space font-medium text-white">{card.title}</p>
                    <p className="text-[10px] font-inter mt-0.5" style={{ color: '#64748B' }}>{card.desc}</p>
                  </motion.div>
                ))}
              </div>

              {/* Suggested Prompts */}
              <div className="flex flex-wrap gap-2 justify-center max-w-xl">
                {aiSuggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="text-[11px] font-space px-3 py-1.5 rounded-full transition-all duration-200 hover:scale-105"
                    style={{ background: 'rgba(0,174,239,0.1)', color: '#00AEEF', border: '1px solid rgba(0,174,239,0.2)' }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[70%] rounded-xl px-5 py-4"
                style={
                  msg.role === 'user'
                    ? { background: 'rgba(0,174,239,0.15)', border: '1px solid rgba(0,174,239,0.2)' }
                    : { background: 'rgba(11,18,32,0.8)', border: '1px solid rgba(0,174,239,0.1)' }
                }
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: '#00E5FF' }} />
                    <span className="text-[10px] font-space font-semibold" style={{ color: '#00E5FF' }}>AI COPILOT</span>
                  </div>
                )}
                <div className="text-sm font-inter leading-relaxed text-white whitespace-pre-wrap">{msg.content}</div>
                <p className="text-[10px] font-space mt-2" style={{ color: '#64748B' }}>
                  {msg.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="rounded-xl px-5 py-4" style={{ background: 'rgba(11,18,32,0.8)', border: '1px solid rgba(0,174,239,0.1)' }}>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{ background: '#00AEEF', animation: `blink 1.4s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4" style={{ borderTop: '1px solid rgba(0,174,239,0.1)' }}>
          <div className="flex items-center gap-3">
            <div
              className="flex-1 flex items-center rounded-xl px-4 py-3"
              style={{ background: 'rgba(11,18,32,0.6)', border: '1px solid rgba(0,174,239,0.15)' }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask anything about objects, collisions, or orbital conditions..."
                className="bg-transparent border-none outline-none text-sm font-space w-full"
                style={{ color: '#fff' }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="p-3 rounded-xl transition-all duration-200 disabled:opacity-30 hover:scale-105"
              style={{ background: 'rgba(0,174,239,0.2)', border: '1px solid rgba(0,174,239,0.3)', color: '#00AEEF' }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
