import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle, X, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { runChatWithContext } from '../services/geminiService';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ReportChatProps {
  reportText: string;
  stockSymbol: string;
}

export const ReportChat: React.FC<ReportChatProps> = ({ reportText, stockSymbol }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build chat history for context
      const chatHistory = messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n');
      
      const response = await runChatWithContext(
        reportText,
        stockSymbol,
        userMessage.content,
        chatHistory
      );

      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: response.text,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `⚠️ Error: ${error.message || 'Failed to get response. Please try again.'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessageContent = (content: string) => {
    // Simple markdown rendering for bold and bullet points
    return content.split('\n').map((line, i) => {
      const rendered = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ');
      return (
        <p key={i} className={`${isBullet ? 'ml-3' : ''} ${i > 0 ? 'mt-1' : ''}`}>
          <span dangerouslySetInnerHTML={{ __html: rendered }} />
        </p>
      );
    });
  };

  const suggestedQuestions = [
    `What's the biggest risk for ${stockSymbol} right now?`,
    `Is the valuation justified at current levels?`,
    `How does ${stockSymbol} compare to its peers?`,
    `What would make you change the verdict?`,
    `Explain the bull case in simple terms`,
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full p-4 shadow-2xl hover:shadow-blue-500/25 hover:scale-110 transition-all duration-300 group"
        title="Ask AI about this report"
      >
        <div className="relative">
          <MessageCircle className="w-6 h-6" />
          <Sparkles className="w-3 h-3 absolute -top-1 -right-1 text-yellow-300 animate-pulse" />
        </div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] max-h-[600px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <Bot className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Ask About {stockSymbol}</h3>
            <p className="text-[10px] text-slate-500">AI has full report context</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[380px]">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 text-center mb-4">
              Ask anything about this analysis. I have the full report context.
            </p>
            <div className="space-y-2">
              {suggestedQuestions.slice(0, 3).map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); }}
                  className="w-full text-left text-xs px-3 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-blue-500/30 rounded-lg text-slate-400 hover:text-slate-300 transition-all"
                >
                  💡 {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="p-1.5 bg-blue-600/20 rounded-lg h-fit mt-0.5 flex-shrink-0">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
              </div>
            )}
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-slate-800 text-slate-300 rounded-bl-md border border-slate-700/50'
              }`}
            >
              {msg.role === 'assistant' ? renderMessageContent(msg.content) : msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="p-1.5 bg-slate-700 rounded-lg h-fit mt-0.5 flex-shrink-0">
                <User className="w-3.5 h-3.5 text-slate-400" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2.5 justify-start">
            <div className="p-1.5 bg-blue-600/20 rounded-lg h-fit mt-0.5">
              <Bot className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="bg-slate-800 border border-slate-700/50 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/80">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask a follow-up question..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
