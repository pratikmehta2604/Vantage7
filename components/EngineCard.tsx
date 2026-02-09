import React from 'react';
import { EngineStatus } from '../types';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, BrainCircuit, Maximize2, Share2 } from 'lucide-react';

interface EngineCardProps {
  engine: EngineStatus;
  onViewDetails: (engine: EngineStatus) => void;
}

const EngineCard: React.FC<EngineCardProps> = ({ engine, onViewDetails }) => {
  const getStatusIcon = () => {
    switch (engine.status) {
      case 'idle': return <BrainCircuit className="w-5 h-5 text-slate-600" />;
      case 'loading': return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'success': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-400" />;
      default: return null;
    }
  };

  const getBorderColor = () => {
    switch (engine.status) {
      case 'loading': return 'border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]';
      case 'success': return 'border-emerald-500/30 hover:border-emerald-500/50';
      case 'error': return 'border-red-500/50';
      default: return 'border-slate-800';
    }
  };

  const formatPreview = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    return lines.slice(0, 6).map((line, i) => (
      <p key={i} className="text-slate-400 text-xs truncate opacity-80">{line.replace(/[#*]/g, '')}</p>
    ));
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!engine.result) return;
    
    const textToShare = `${engine.name} Report\n\n${engine.result}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Vantage7 Analysis',
          text: textToShare,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error(err);
      }
    } else {
      navigator.clipboard.writeText(textToShare);
      alert('Analysis copied to clipboard!');
    }
  };

  return (
    <div className={`bg-slate-900 border ${getBorderColor()} rounded-xl p-5 transition-all duration-300 flex flex-col h-64 relative group`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-slate-100 font-bold text-sm tracking-wide uppercase truncate max-w-[150px]">{engine.name}</h3>
          <p className="text-slate-500 text-[10px] uppercase">{engine.role}</p>
        </div>
        <div className="flex items-center space-x-2">
          {engine.usage && (
             <span className="text-[9px] font-mono text-slate-600 bg-slate-950 px-1.5 py-0.5 rounded hidden group-hover:inline-block">
               {engine.usage.totalTokenCount} tok
             </span>
          )}
          {getStatusIcon()}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-grow overflow-hidden relative">
        {engine.status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-slate-700">
             <span className="text-xs">Pending Strategy...</span>
          </div>
        )}
        
        {engine.status === 'loading' && (
           <div className="flex flex-col items-center justify-center h-full space-y-2 opacity-70">
             <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
               <div className="h-full bg-blue-500 animate-progress"></div>
             </div>
             <p className="text-[10px] text-blue-400 font-mono animate-pulse">Analyzing Data...</p>
           </div>
        )}

        {engine.status === 'success' && engine.result && (
          <div className="space-y-1 mask-linear-fade">
            {formatPreview(engine.result)}
          </div>
        )}

        {engine.status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full text-red-400 p-2">
            <span className="text-xs text-center">{engine.error || "Analysis Failed"}</span>
          </div>
        )}
      </div>

      {/* Footer Action */}
      <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center">
         <span className={`text-[10px] ${engine.status === 'success' ? 'text-emerald-500' : 'text-slate-600'}`}>
            {engine.status === 'success' ? 'Analysis Complete' : 'Waiting'}
         </span>
         
         {engine.status === 'success' && (
           <div className="flex items-center gap-2">
             <button 
                onClick={handleShare}
                className="text-slate-500 hover:text-white transition-colors p-1"
                title="Share"
             >
                <Share2 className="w-3.5 h-3.5" />
             </button>
             <button 
               onClick={() => onViewDetails(engine)}
               className="text-xs flex items-center space-x-1 text-blue-400 hover:text-white transition-colors"
             >
               <span>Read Report</span>
               <Maximize2 className="w-3 h-3" />
             </button>
           </div>
         )}
      </div>
    </div>
  );
};

export default EngineCard;