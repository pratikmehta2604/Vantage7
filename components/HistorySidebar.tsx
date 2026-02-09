import React from 'react';
import { AnalysisSession } from '../types';
import { History, Calendar, Trash2, ArrowRight, BarChart3 } from 'lucide-react';

interface HistorySidebarProps {
  sessions: AnalysisSession[];
  onSelectSession: (session: AnalysisSession) => void;
  onDeleteSession: (id: string) => void;
  currentSessionId?: string;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({ sessions, onSelectSession, onDeleteSession, currentSessionId }) => {
  if (sessions.length === 0) return null;

  const getVerdictColor = (verdict?: string) => {
    if (!verdict) return 'text-slate-400';
    const v = verdict.toUpperCase();
    if (v.includes('BUY')) return 'text-emerald-400';
    if (v.includes('SELL') || v.includes('AVOID')) return 'text-red-400';
    if (v.includes('HOLD') || v.includes('WATCHLIST')) return 'text-yellow-400';
    return 'text-blue-400';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-fit sticky top-6">
      <div className="flex items-center gap-2 mb-4 text-slate-400">
        <History className="w-4 h-4" />
        <h3 className="text-sm font-bold uppercase tracking-wider">Portfolio History</h3>
      </div>
      
      <div className="space-y-3 max-h-[70vh] overflow-y-auto scrollbar-hide pr-1">
        {sessions.map((session) => (
          <div 
            key={session.id}
            className={`group p-3 rounded-lg border transition-all cursor-pointer relative ${
              currentSessionId === session.id 
                ? 'bg-blue-900/10 border-blue-500/50 shadow-lg shadow-blue-900/20' 
                : 'bg-slate-950 border-slate-800 hover:border-slate-600 hover:shadow-md'
            }`}
            onClick={() => onSelectSession(session)}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-bold text-slate-100 text-lg tracking-tight">{session.symbol}</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-slate-900"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mb-2">
              <Calendar className="w-3 h-3" />
              {new Date(session.timestamp).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </div>

            <div className="flex flex-col gap-1">
              <div className={`text-xs font-bold ${getVerdictColor(session.verdict)} flex items-center gap-1.5`}>
                 <BarChart3 className="w-3 h-3" />
                 {session.verdict || 'ANALYZED'}
              </div>
              
              {session.summary && (
                <div className="text-[10px] text-slate-400 leading-tight line-clamp-2 border-l-2 border-slate-800 pl-2 mt-1">
                   {session.summary}
                </div>
              )}
            </div>
            
            {currentSessionId === session.id && (
                <div className="absolute right-3 bottom-3 animate-pulse">
                    <ArrowRight className="w-4 h-4 text-blue-500" />
                </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistorySidebar;
