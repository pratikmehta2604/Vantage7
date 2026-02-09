import React from 'react';
import { EngineStatus } from '../types';
import { Briefcase, Cpu, Link as LinkIcon, ExternalLink, Share2, AlertOctagon } from 'lucide-react';

interface FinalReportProps {
  synthesizer: EngineStatus;
  totalTokens: number;
}

const FinalReport: React.FC<FinalReportProps> = ({ synthesizer, totalTokens }) => {
  if (synthesizer.status !== 'success' || !synthesizer.result) return null;

  const getVerdictColor = (text: string) => {
    if (text.includes('STRONG BUY')) return 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]';
    if (text.includes('BUY')) return 'bg-green-500 shadow-green-500/50';
    if (text.includes('SELL') || text.includes('AVOID')) return 'bg-red-500 shadow-red-500/50';
    if (text.includes('WATCHLIST') || text.includes('HOLD')) return 'bg-yellow-500 shadow-yellow-500/50';
    return 'bg-blue-500';
  };

  const verdictColor = getVerdictColor(synthesizer.result);

  const handleShare = async () => {
    if (!synthesizer.result) return;
    
    const textToShare = `Vantage7 Investment Memo\n\n${synthesizer.result}\n\nDisclaimer: AI Generated. Not Financial Advice.`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Vantage7 Report',
          text: textToShare,
        });
      } catch (err) {
        // Ignore abort errors
        if ((err as Error).name !== 'AbortError') {
           console.error('Error sharing:', err);
        }
      }
    } else {
        // Fallback for browsers that don't support navigator.share
        navigator.clipboard.writeText(textToShare);
        alert('Report copied to clipboard!');
    }
  };

  // Markdown renderer specific for the report structure
  const renderContent = (text: string) => {
    return text.split('\n').map((line, idx) => {
      // Final Decision Box
      if (line.includes('FINAL DECISION:')) {
         const [label, value] = line.split(':');
         return (
           <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 p-6 bg-slate-900/80 rounded-xl border border-slate-700 backdrop-blur-sm shadow-xl">
             <span className="text-slate-300 font-bold uppercase tracking-widest text-lg mb-2 sm:mb-0">{label.replace(/#/g, '').trim()}</span>
             <span className={`px-6 py-2 rounded-lg text-black font-extrabold text-xl tracking-tighter text-center ${verdictColor}`}>
               {value?.trim()}
             </span>
           </div>
         );
      }
      
      // Section Headers
      if (line.includes('The "One-Line" Thesis')) {
          return <h3 key={idx} className="text-blue-400 font-bold text-xl mt-8 mb-3 pb-2 border-b border-slate-800">The Thesis</h3>;
      }
      if (line.match(/^#+\s/)) {
        // Generic headers
        const cleanLine = line.replace(/^#+\s/, '');
        return <h3 key={idx} className="text-white font-bold text-lg mt-8 mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>{cleanLine}
        </h3>;
      }
      // Specific Report Sections if headers aren't explicitly marked with #
      if (line.includes('1. The Story') || line.includes('2. The Numbers') || line.includes('3. The Watchdog') || line.includes('4. The Price') || line.includes('5. The Timing')) {
          return <h3 key={idx} className="text-white font-bold text-xl mt-8 mb-4 flex items-center gap-2">
            <span className="text-blue-500 text-lg">●</span> {line.replace(/#/g, '').trim()}
          </h3>;
      }
      
      // Bold Text
      if (line.includes('**')) {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={idx} className="text-slate-300 mb-2 leading-relaxed ml-1">
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
              }
              return part;
            })}
          </p>
        );
      }
      
      if (line.trim() === '') return <div key={idx} className="h-2" />;
      
      return <p key={idx} className="text-slate-300 ml-1 mb-1 leading-relaxed">{line}</p>;
    });
  };

  return (
    <div className="mt-8 bg-slate-950 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl relative mb-12">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500" />
      
      <div className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
          <div className="flex items-center space-x-3 mb-4 md:mb-0">
            <div className="p-3 bg-slate-800 rounded-lg">
              <Briefcase className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">CIO Investment Memo</h2>
              <p className="text-slate-400 text-sm">Synthesized Strategy Report</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button
               onClick={handleShare}
               className="flex items-center space-x-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
               title="Share Report"
             >
               <Share2 className="w-3.5 h-3.5" />
               <span className="hidden sm:inline">SHARE</span>
             </button>
             <div className="flex items-center space-x-3 text-xs font-mono text-slate-500 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
               <Cpu className="w-3 h-3" />
               <span>SESSION COST: {totalTokens.toLocaleString()} TOKENS</span>
             </div>
          </div>
        </div>

        <div className="prose prose-invert max-w-none font-mono text-sm leading-relaxed">
           {renderContent(synthesizer.result)}
        </div>

        {/* Aggregate Sources if Synthesizer used any (usually it uses context, but good to have) */}
        {synthesizer.sources && synthesizer.sources.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-800">
             <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
               <LinkIcon className="w-3 h-3" /> Primary Sources
             </h4>
             <div className="flex flex-wrap gap-3">
               {synthesizer.sources.map((source, idx) => (
                 <a 
                   key={idx} 
                   href={source.uri} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-full border border-slate-700 transition-colors group"
                 >
                   <span className="text-xs text-blue-400 max-w-[200px] truncate">{source.title}</span>
                   <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-white" />
                 </a>
               ))}
             </div>
          </div>
        )}

        {/* Detailed Regulatory Disclaimer */}
        <div className="mt-8 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
           <div className="flex items-center gap-2 mb-2 text-yellow-600">
             <AlertOctagon className="w-4 h-4" />
             <h4 className="text-xs font-bold uppercase tracking-wider">Regulatory Disclaimer</h4>
           </div>
           <p className="text-[10px] text-slate-500 font-mono leading-relaxed text-justify">
             This research report is generated by an Artificial Intelligence system for <strong>educational and informational purposes only</strong>. 
             It is NOT a recommendation to buy, sell, or hold any securities. The creators of this application are <strong>not SEBI-registered Research Analysts</strong> 
             or Investment Advisors. All data is simulated or aggregated from public sources and may be inaccurate or delayed. 
             Stock market investments are subject to market risks; please read all scheme-related documents carefully. 
             Always consult a certified financial planner before taking any investment decision.
           </p>
        </div>
      </div>
    </div>
  );
};

export default FinalReport;