import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, Sparkles, X, ChevronUp } from 'lucide-react';
import { aiSuggestedPrompts, aiMockResponses } from '../../data/mockData';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AICopilotBar() {
  const [expanded, setExpanded] = useState(false);
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

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    if (!expanded) setExpanded(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: aiMockResponses.default,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="fixed bottom-0 left-[280px] right-0 z-40">
      {/* Expanded Chat Panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 400, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
            style={{
              background: 'rgba(5, 8, 22, 0.95)',
              backdropFilter: 'blur(30px)',
              borderTop: '1px solid rgba(0, 174, 239, 0.2)',
            }}
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(0,174,239,0.1)' }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: '#00E5FF' }} />
                <span className="text-sm font-space font-semibold text-white">KesslerX AI Copilot</span>
                <span className="text-[10px] font-space px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,255,0.1)', color: '#00E5FF', border: '1px solid rgba(0,229,255,0.2)' }}>
                  BETA
                </span>
              </div>
              <button onClick={() => setExpanded(false)} className="p-1 rounded hover:bg-[rgba(0,174,239,0.1)] transition-colors">
                <X className="w-4 h-4" style={{ color: '#94A3B8' }} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="h-[310px] overflow-y-auto px-5 py-3 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <Bot className="w-10 h-10" style={{ color: 'rgba(0,174,239,0.3)' }} />
                  <p className="text-sm font-space" style={{ color: '#64748B' }}>
                    Ask anything about orbital objects, collisions, or space conditions
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {aiSuggestedPrompts.slice(0, 4).map((prompt) => (
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
                    className="max-w-[70%] rounded-xl px-4 py-3"
                    style={
                      msg.role === 'user'
                        ? { background: 'rgba(0, 174, 239, 0.15)', border: '1px solid rgba(0,174,239,0.2)' }
                        : { background: 'rgba(11, 18, 32, 0.8)', border: '1px solid rgba(0,174,239,0.1)' }
                    }
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="w-3 h-3" style={{ color: '#00E5FF' }} />
                        <span className="text-[10px] font-space font-semibold" style={{ color: '#00E5FF' }}>AI COPILOT</span>
                      </div>
                    )}
                    <div className="text-xs font-inter leading-relaxed text-white whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(11,18,32,0.8)', border: '1px solid rgba(0,174,239,0.1)' }}>
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: '#00AEEF',
                            animation: `blink 1.4s ease-in-out ${i * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Bar */}
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{
          background: 'rgba(5, 8, 22, 0.95)',
          backdropFilter: 'blur(30px)',
          borderTop: '1px solid rgba(0, 174, 239, 0.15)',
        }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-2 rounded-lg transition-all duration-200 hover:bg-[rgba(0,174,239,0.1)]"
        >
          <ChevronUp
            className="w-4 h-4 transition-transform duration-200"
            style={{ color: '#00AEEF', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>

        <Bot className="w-5 h-5 flex-shrink-0" style={{ color: '#00E5FF', filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.5))' }} />

        <div
          className="flex-1 flex items-center rounded-xl px-4 py-2 transition-all duration-200"
          style={{
            background: 'rgba(11, 18, 32, 0.6)',
            border: '1px solid rgba(0, 174, 239, 0.15)',
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            onFocus={() => !expanded && setExpanded(true)}
            placeholder="Ask anything about objects, collisions, or orbital conditions..."
            className="bg-transparent border-none outline-none text-xs font-space w-full"
            style={{ color: '#fff' }}
          />
        </div>

        <button
          onClick={() => handleSend()}
          disabled={!input.trim()}
          className="p-2.5 rounded-xl transition-all duration-200 disabled:opacity-30"
          style={{
            background: input.trim() ? 'rgba(0, 174, 239, 0.2)' : 'transparent',
            border: '1px solid rgba(0, 174, 239, 0.2)',
          }}
        >
          <Send className="w-4 h-4" style={{ color: '#00AEEF' }} />
        </button>
      </div>
    </div>
  );
}
