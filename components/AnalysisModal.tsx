import React from 'react';
import { EngineStatus } from '../types';
import { X, FileText, Cpu, Link as LinkIcon, ExternalLink, Share2 } from 'lucide-react';

interface AnalysisModalProps {
  engine: EngineStatus | null;
  onClose: () => void;
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ engine, onClose }) => {
  if (!engine) return null;

  const handleShare = async () => {
    if (!engine.result) return;
    
    const textToShare = `${engine.name} Detailed Analysis\n\n${engine.result}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Vantage7 - ${engine.name}`,
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

  // Simple Markdown parser for bold text and headers
  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Headers
      if (line.startsWith('### ')) {
        return <h3 key={i} className="text-lg font-bold text-blue-300 mt-4 mb-2">{line.replace('### ', '')}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={i} className="text-xl font-bold text-white mt-6 mb-3 border-b border-slate-700 pb-1">{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('# ')) {
        return <h1 key={i} className="text-2xl font-bold text-white mt-2 mb-4">{line.replace('# ', '')}</h1>;
      }
      if (line.trim() === '') {
        return <div key={i} className="h-2"></div>;
      }

      // Bold text parsing (**text**)
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <p key={i} className="mb-1 text-slate-300 leading-relaxed">
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={j} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </p>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Cpu className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">{engine.name}</h2>
              <p className="text-slate-400 text-sm">{engine.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button
               onClick={handleShare}
               className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-white"
               title="Share Analysis"
             >
               <Share2 className="w-5 h-5" />
             </button>
             <button 
               onClick={onClose}
               className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-white"
             >
               <X className="w-6 h-6" />
             </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {engine.usage && (
            <div className="flex flex-wrap gap-4 mb-6 text-xs font-mono text-slate-500 bg-slate-950 p-3 rounded-lg border border-slate-800 items-center">
              <span>PROMPT: {engine.usage.promptTokenCount}</span>
              <span>OUTPUT: {engine.usage.candidatesTokenCount}</span>
              <span className="text-emerald-500 font-bold">TOTAL: {engine.usage.totalTokenCount}</span>
            </div>
          )}
          
          <div className="prose prose-invert max-w-none">
            {engine.result ? (
               <div className="font-mono text-sm">
                 {renderMarkdown(engine.result)}
               </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                <FileText className="w-12 h-12 mb-4 opacity-50" />
                <p>No analysis content available.</p>
              </div>
            )}
          </div>

          {/* Sources Section */}
          {engine.sources && engine.sources.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <LinkIcon className="w-3 h-3" /> Sources
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {engine.sources.map((source, idx) => (
                  <a 
                    key={idx} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2 bg-slate-800/50 hover:bg-slate-800 rounded border border-slate-800 transition-colors group"
                  >
                    <span className="text-xs text-blue-400 truncate max-w-[80%]">{source.title}</span>
                    <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-white" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 text-right">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisModal;