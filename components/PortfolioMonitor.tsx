import React, { useState } from 'react';
import { AnalysisSession } from '../types';
import { Activity, ShieldCheck, ShieldAlert, ArrowRight, TrendingUp, RefreshCw, Calendar, Target, AlertTriangle } from 'lucide-react';

interface PortfolioMonitorProps {
  history: AnalysisSession[];
  onLoadSession: (session: AnalysisSession) => void;
  onRefreshSession: (symbol: string) => void;
}

export const PortfolioMonitor: React.FC<PortfolioMonitorProps> = ({ history, onLoadSession, onRefreshSession }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'warning' | 'broken'>('all');

  // Helper to determine thesis health from the verdict and summary
  const getThesisHealth = (session: AnalysisSession) => {
    // Basic heuristic: if verdict is STRONG BUY or BUY, it's active.
    // If HOLD or WATCHLIST, it's warning.
    // If SELL or AVOID, it's broken.
    const v = session.verdict?.toLowerCase() || '';
    if (v.includes('sell') || v.includes('avoid')) return 'broken';
    if (v.includes('hold') || v.includes('watchlist') || v.includes('neutral')) return 'warning';
    return 'active'; // Default for buys
  };

  const filteredHistory = history.filter(session => {
    if (filter === 'all') return true;
    return getThesisHealth(session) === filter;
  });

  const getHealthBadge = (health: string) => {
    switch (health) {
      case 'active':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] font-bold tracking-wider uppercase"><ShieldCheck className="w-3 h-3" /> Thesis Active</span>;
      case 'warning':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full text-[10px] font-bold tracking-wider uppercase"><AlertTriangle className="w-3 h-3" /> Needs Review</span>;
      case 'broken':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-[10px] font-bold tracking-wider uppercase"><ShieldAlert className="w-3 h-3" /> Thesis Broken</span>;
      default:
        return null;
    }
  };

  const getVerdictColor = (verdict: string) => {
    const v = verdict.toLowerCase();
    if (v.includes('strong buy')) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (v.includes('buy')) return 'text-green-400 bg-green-400/10 border-green-400/20';
    if (v.includes('sell') || v.includes('avoid')) return 'text-red-400 bg-red-400/10 border-red-400/20';
    return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
  };

  // Group by unique symbols (keep only the latest analysis per stock)
  const uniqueStocks = new Map<string, AnalysisSession>();
  filteredHistory.forEach(session => {
    const existing = uniqueStocks.get(session.symbol);
    if (!existing || existing.timestamp < session.timestamp) {
      uniqueStocks.set(session.symbol, session);
    }
  });
  
  const stocksArray = Array.from(uniqueStocks.values()).sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-500" />
            Portfolio Thesis Monitor
          </h2>
          <p className="text-slate-400 mt-2">Track the health of your past analyses and monitor thesis invalidation triggers.</p>
        </div>

        <div className="flex bg-slate-800/50 p-1.5 rounded-xl border border-slate-700/50">
          {(['all', 'active', 'warning', 'broken'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f 
                  ? 'bg-slate-700 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {stocksArray.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-xl">
          <Target className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No stocks found</h3>
          <p className="text-slate-400">Analyze some stocks to build your portfolio monitor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stocksArray.map((session) => {
            const health = getThesisHealth(session);
            const convictionScore = session.engines.synthesizer?.result?.match(/Conviction\s*Score:\s*(\\d+)/i)?.[1] || '-';
            
            return (
              <div key={session.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:border-slate-700 transition-all flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 group-hover:border-blue-500/50 transition-colors">
                      <span className="text-lg font-bold text-white">{session.symbol.substring(0, 1)}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{session.symbol}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getVerdictColor(session.verdict || '')}`}>
                          {session.verdict || 'ANALYZED'}
                        </span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                          {convictionScore}/10
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  {getHealthBadge(health)}
                </div>

                <div className="flex-1">
                  <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed">
                    {session.summary || 'No summary available for this analysis.'}
                  </p>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Last Analyzed
                    </span>
                    <span className="text-xs text-slate-300 font-mono">
                      {new Date(session.timestamp).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => onRefreshSession(session.symbol)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg transition-colors border border-slate-700 hover:border-blue-500/30"
                      title="Run quick update"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => onLoadSession(session)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      View <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
