import React from 'react';
import { EngineStatus } from '../types';
import {
  Briefcase,
  Cpu,
  Link as LinkIcon,
  ExternalLink,
  Share2,
  AlertOctagon,
  TrendingUp,
  ShieldCheck,
  Target,
  Zap,
  DollarSign,
  BookOpen
} from 'lucide-react';

interface FinalReportProps {
  synthesizer: EngineStatus;
  totalTokens: number;
}

const FinalReport: React.FC<FinalReportProps> = ({ synthesizer, totalTokens }) => {
  if (synthesizer.status !== 'success' || !synthesizer.result) return null;

  const rawText = synthesizer.result;

  // --- Parsing Logic ---
  const extractSection = (header: string, nextHeader?: string): string => {
    const startIdx = rawText.indexOf(header);
    if (startIdx === -1) return '';

    const contentStart = startIdx + header.length;
    let endIdx = rawText.length;

    if (nextHeader) {
      const nextIdx = rawText.indexOf(nextHeader, contentStart);
      if (nextIdx !== -1) endIdx = nextIdx;
    }

    return rawText.slice(contentStart, endIdx).trim();
  };

  // Extract Core Sections based on new Synthesizer Prompt
  const execSummary = extractSection('1. **Executive Summary:**', '2. **Strategic Setup');
  const strategicSetup = extractSection('2. **Strategic Setup', '3. **360 Analysis');
  const analysis360 = extractSection('3. **360 Analysis:**', '4. **Final Verdict');
  const finalVerdict = extractSection('4. **Final Verdict:**');

  // Fallback for old/legacy reports
  const isLegacy = !execSummary && !finalVerdict;

  // --- Helper Renderers ---

  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, idx) => {
      // Bold
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <p key={idx} className="mb-2 text-slate-300 leading-relaxed">
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} className="text-white font-semibold">{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      );
    });
  };

  const getVerdictColor = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('strong buy')) return 'from-emerald-600 to-green-500 shadow-emerald-500/20';
    if (lower.includes('buy')) return 'from-green-600 to-emerald-500 shadow-green-500/20';
    if (lower.includes('sell') || lower.includes('avoid')) return 'from-red-600 to-rose-500 shadow-red-500/20';
    if (lower.includes('hold') || lower.includes('watchlist')) return 'from-yellow-600 to-amber-500 shadow-yellow-500/20';
    return 'from-blue-600 to-indigo-500';
  };

  const verdictBg = getVerdictColor(finalVerdict || rawText);

  // --- Share Handler ---
  const handleShare = async () => {
    const textToShare = `Vantage7 Investment Memo\n\n${rawText.slice(0, 500)}...\n\nRead more at Vantage7.`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Vantage7 Report', text: textToShare }); } catch (e) { }
    } else {
      navigator.clipboard.writeText(rawText);
      alert('Report copied!');
    }
  };

  // --- Main Render ---

  if (isLegacy) {
    // Fallback Code (kept simple)
    return (
      <div className="mt-8 bg-slate-950 p-6 rounded-2xl border border-slate-800">
        <h3 className="text-xl text-white mb-4">Analysis Report</h3>
        <div className="prose prose-invert max-w-none text-sm font-mono">{renderMarkdown(rawText)}</div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8 animate-fade-in-up">

      {/* Header Card */}
      <div className="relative bg-slate-900 rounded-2xl p-6 border border-slate-800 overflow-hidden shadow-2xl group">
        <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${verdictBg}`} />
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg text-blue-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Investment Memo</h2>
              <p className="text-xs text-slate-500 font-mono">AI Synthesized Strategy</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleShare} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors">
              <Share2 className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 bg-slate-800 rounded-lg text-xs font-mono text-slate-500 flex items-center gap-2">
              <Cpu className="w-3 h-3" /> {totalTokens.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Executive Summary Section */}
        <div className="mt-4 p-4 bg-slate-950/50 rounded-xl border border-slate-700/50">
          <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4" /> The Elevator Pitch
          </h3>
          <div className="text-slate-300 text-sm leading-relaxed italic">
            {renderMarkdown(execSummary)}
          </div>
        </div>
      </div>

      {/* Strategic Setup Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800/60 shadow-lg">
          <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" /> Strategic Setup
          </h3>
          <div className="text-slate-300 text-sm">{renderMarkdown(strategicSetup)}</div>
        </div>

        <div className={`bg-gradient-to-br ${verdictBg} p-5 rounded-2xl shadow-lg relative overflow-hidden`}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10">
            <h3 className="text-sm font-bold text-white/90 uppercase tracking-wider mb-1 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Final Verdict
            </h3>
            <div className="text-white text-sm font-medium mt-2">{renderMarkdown(finalVerdict)}</div>
          </div>
        </div>
      </div>

      {/* 360 Analysis (The Meat) */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-800 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-bold text-white">360° Deep Dive</h3>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* We can fuzzy match subsections here or just render the whole block */}
          {/* For now, rendering the whole block but styling lists nicely */}
          <div className="md:col-span-2 text-slate-300 text-sm prose prose-invert max-w-none prose-headings:text-blue-300 prose-headings:text-sm prose-headings:font-bold prose-headings:uppercase prose-li:text-slate-300">
            {renderMarkdown(analysis360)}
          </div>
        </div>
      </div>

      {/* Footer / Disclaimer */}
      <div className="flex items-start gap-3 p-4 bg-slate-900/40 rounded-xl border border-slate-800/50">
        <AlertOctagon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-500 leading-relaxed text-justify">
          <strong>AI GENERATED CONTENT. NOT FINANCIAL ADVICE.</strong> The creators are not SEBI registered.
          Analysis is based on public data found by AI bots and may be hallucinated or outdated.
          Please consult a qualified financial advisor before investing.
        </p>
      </div>

    </div>
  );
};

export default FinalReport;