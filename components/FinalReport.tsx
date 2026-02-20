import React, { useState, useRef, useEffect } from 'react';
import { EngineStatus } from '../types';
import { useToast } from './Toast';
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
  BookOpen,
  Copy,
  Check,
  Download,
  MessageCircle
} from 'lucide-react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  RadialBarChart, RadialBar
} from 'recharts';
import { AdvancedRealTimeChart } from "react-ts-tradingview-widgets";

interface FinalReportProps {
  synthesizer: EngineStatus;
  totalTokens: number;
  modelUsed?: string;
  stockSymbol?: string;
}

const FinalReport: React.FC<FinalReportProps> = ({ synthesizer, totalTokens, modelUsed, stockSymbol }) => {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  if (synthesizer.status !== 'success' || !synthesizer.result) return null;

  const rawText = synthesizer.result;

  // Close share menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    if (showShareMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showShareMenu]);

  // --- Parsing Logic ---
  const extractSectionByRegex = (startRegex: RegExp, endRegex?: RegExp): string => {
    // Strip hidden scores array first so it doesn't leak into text
    const cleanText = rawText.replace(/\[SCORES:\s*(.*?)\]/i, '').trim();

    const startMatch = cleanText.match(startRegex);
    if (!startMatch || startMatch.index === undefined) return '';

    const contentStart = startMatch.index + startMatch[0].length;
    let endIdx = cleanText.length;

    if (endRegex) {
      const remainingText = cleanText.slice(contentStart);
      const endMatch = remainingText.match(endRegex);
      if (endMatch && endMatch.index !== undefined) {
        endIdx = contentStart + endMatch.index;
      }
    }

    return cleanText.slice(contentStart, endIdx).trim();
  };

  // Extract Core Sections (highly permissive to handle AI formatting quirks)
  const execSummary = extractSectionByRegex(/1\.\s*(?:\*\*)?Executive\s*Summary(?:\*\*)?:?/i, /2\.\s*(?:\*\*)?Strategic\s*Setup/i);
  const strategicSetup = extractSectionByRegex(/2\.\s*(?:\*\*)?Strategic\s*Setup.*?(:|\*\*)/i, /3\.\s*(?:\*\*)?360\s*Analysis/i);
  const analysis360 = extractSectionByRegex(/3\.\s*(?:\*\*)?360\s*Analysis.*?(:|\*\*)/i, /4\.\s*(?:\*\*)?Final\s*Verdict/i);
  const finalVerdict = extractSectionByRegex(/4\.\s*(?:\*\*)?Final\s*Verdict.*?(:|\*\*)/i);

  // Fallback if parsing missed significant chunks of data
  const isLegacy = !execSummary || !strategicSetup || !analysis360 || !finalVerdict ||
    (execSummary.length < 20 && finalVerdict.length < 20);

  // --- Extract Hidden JSON Scores ---
  const extractScores = () => {
    const scoreMatch = rawText.match(/\[SCORES:\s*(.*?)\]/i);
    if (!scoreMatch) return null;

    const parts = scoreMatch[1].split(',').map(p => p.trim());
    const scores: Record<string, number> = {};
    parts.forEach(p => {
      const [key, val] = p.split('=').map(s => s.trim());
      if (key && val) {
        scores[key.toLowerCase()] = parseInt(val, 10);
      }
    });
    return scores;
  };

  const aiScores = extractScores();

  const radarData = aiScores ? [
    { subject: 'Business', A: aiScores.business || 0, fullMark: 10 },
    { subject: 'Financials', A: aiScores.financials || 0, fullMark: 10 },
    { subject: 'Valuation', A: aiScores.valuation || 0, fullMark: 10 },
    { subject: 'Forensic', A: aiScores.forensic || 0, fullMark: 10 },
    { subject: 'Technical', A: aiScores.technical || 0, fullMark: 10 },
  ] : [];

  const convictionScore = aiScores?.conviction || 0;
  const speedometerData = [{ name: 'Conviction', value: convictionScore, fill: convictionScore >= 7 ? '#10b981' : convictionScore >= 5 ? '#f59e0b' : '#ef4444' }];

  // --- Helper Renderers ---

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j} className="text-white font-semibold">{part.slice(2, -2)}</strong>
        : part
    );
  };

  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // --- Table Detection ---
      if (line.includes('|') && line.trim().startsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        if (tableLines.length >= 2) {
          // Parse header row
          const headerCells = tableLines[0].split('|').map(c => c.trim()).filter(c => c);
          // Skip separator row (---), parse data rows
          const dataRows = tableLines.slice(2).map(row =>
            row.split('|').map(c => c.trim()).filter(c => c)
          );

          elements.push(
            <div key={`table-${i}`} className="my-4 rounded-xl overflow-hidden border border-slate-700/50">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800/80">
                      {headerCells.map((cell, j) => (
                        <th key={j} className="px-3 py-2.5 text-left text-slate-300 font-bold border-b border-slate-700/50 whitespace-nowrap">
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row, ri) => (
                      <tr key={ri} className={`${ri % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-800/30'} hover:bg-slate-800/60 transition-colors`}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-slate-300 border-b border-slate-800/50 whitespace-nowrap">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
          continue;
        }
      }

      // --- Headers ---
      const h1Match = line.match(/^#\s+(.*)/);
      if (h1Match) {
        elements.push(<h2 key={i} className="text-lg font-bold text-white mt-6 mb-3 pb-2 border-b border-slate-800">{renderInline(h1Match[1])}</h2>);
        i++;
        continue;
      }
      const h2Match = line.match(/^##\s+(.*)/);
      if (h2Match) {
        elements.push(<h3 key={i} className="text-base font-bold text-blue-300 mt-5 mb-2">{renderInline(h2Match[1])}</h3>);
        i++;
        continue;
      }
      const h3Match = line.match(/^###\s+(.*)/);
      if (h3Match) {
        elements.push(<h4 key={i} className="text-sm font-bold text-slate-200 mt-4 mb-1.5">{renderInline(h3Match[1])}</h4>);
        i++;
        continue;
      }

      // Horizontal rule
      if (line.trim() === '---' || line.trim() === '***') {
        elements.push(<hr key={i} className="border-slate-700/50 my-5" />);
        i++;
        continue;
      }
      // Empty line
      if (line.trim() === '') {
        elements.push(<div key={i} className="h-1" />);
        i++;
        continue;
      }
      // Block quote
      const quoteMatch = line.match(/^>\s*(.*)/);
      if (quoteMatch) {
        elements.push(
          <div key={i} className="border-l-2 border-blue-500/50 pl-3 my-2 text-slate-400 italic text-sm">
            {renderInline(quoteMatch[1])}
          </div>
        );
        i++;
        continue;
      }
      // Bullet points (- or *)
      const bulletMatch = line.match(/^\s*([-*])\s+(.*)/);
      if (bulletMatch) {
        const indent = line.match(/^\s*/)?.[0].length || 0;
        elements.push(
          <div key={i} className="flex items-start gap-2 mb-1.5" style={{ paddingLeft: `${Math.min(indent, 4) * 8}px` }}>
            <span className="text-blue-400 mt-1 flex-shrink-0 text-[8px]">●</span>
            <p className="text-slate-300 leading-relaxed text-sm">{renderInline(bulletMatch[2])}</p>
          </div>
        );
        i++;
        continue;
      }
      // Numbered lists
      const numMatch = line.match(/^\s*(\d+)[.)]\s+(.*)/);
      if (numMatch) {
        elements.push(
          <div key={i} className="flex items-start gap-2 mb-1.5">
            <span className="text-blue-400 font-mono text-xs mt-0.5 flex-shrink-0 w-5 text-right">{numMatch[1]}.</span>
            <p className="text-slate-300 leading-relaxed text-sm">{renderInline(numMatch[2])}</p>
          </div>
        );
        i++;
        continue;
      }
      // Regular paragraph
      elements.push(
        <p key={i} className="mb-2 text-slate-300 leading-relaxed text-sm">
          {renderInline(line)}
        </p>
      );
      i++;
    }

    return elements;
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

  // --- Share Handlers ---
  const getModelLabel = () => {
    if (!modelUsed) return null;
    if (modelUsed.includes('3-flash')) return { label: '3 Flash ✨', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    if (modelUsed.includes('2.5-flash')) return { label: '2.5 Flash', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
    return { label: modelUsed.split('-').slice(-2).join(' '), color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
  };

  const modelBadge = getModelLabel();

  const handleCopyToClipboard = async () => {
    try {
      const cleanText = rawText
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/^#{1,3}\s+/gm, '')
        .replace(/^[-*]\s+/gm, '• ');
      await navigator.clipboard.writeText(`📊 Vantage7 Investment Memo\n\n${cleanText}\n\n⚠️ Disclaimer: AI-generated analysis. Not SEBI registered. Not financial advice.`);
      showToast('Report copied to clipboard!', 'success');
      setShowShareMenu(false);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = rawText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Report copied to clipboard!', 'success');
      setShowShareMenu(false);
    }
  };

  const handleDownloadPDF = () => {
    // Rely on @media print in index.css to format the native window
    window.print();
    showToast('Print dialog opened. Select "Save as PDF".', 'info');
    setShowShareMenu(false);
  };

  const handleWhatsAppShare = () => {
    // Create a concise summary for WhatsApp (max ~1000 chars for readability)
    const summary = rawText
      .replace(/\*\*(.*?)\*\*/g, '*$1*') // Convert markdown bold to WhatsApp bold
      .replace(/^#{1,3}\s+/gm, '')
      .slice(0, 1200);

    const whatsappText = encodeURIComponent(
      `📊 *Vantage7 Investment Memo*\n\n${summary}...\n\n⚠️ _Disclaimer: AI-generated analysis. Not SEBI registered. Not financial advice. Consult a qualified advisor._`
    );
    window.open(`https://wa.me/?text=${whatsappText}`, '_blank');
    showToast('Opening WhatsApp...', 'success');
    setShowShareMenu(false);
  };

  // --- Main Render ---

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
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500 font-mono">AI Synthesized Strategy</p>
                {modelBadge && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${modelBadge.color}`}>
                    {modelBadge.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* Share Dropdown */}
            <div className="relative" ref={shareMenuRef}>
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-sm ${showShareMenu ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
                  }`}
                title="Share Report"
              >
                <Share2 className="w-4 h-4" />
              </button>

              {showShareMenu && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in-up">
                  <div className="p-1.5">
                    <button
                      onClick={handleCopyToClipboard}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700 transition-colors text-left group"
                    >
                      <Copy className="w-4 h-4 text-slate-400 group-hover:text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-200">Copy to Clipboard</p>
                        <p className="text-[10px] text-slate-500">Full report as text</p>
                      </div>
                    </button>

                    <button
                      onClick={handleDownloadPDF}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700 transition-colors text-left group"
                    >
                      <Download className="w-4 h-4 text-slate-400 group-hover:text-purple-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-200">Save as PDF</p>
                        <p className="text-[10px] text-slate-500">Styled for printing</p>
                      </div>
                    </button>

                    <div className="border-t border-slate-700 my-1"></div>

                    <button
                      onClick={handleWhatsAppShare}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700 transition-colors text-left group"
                    >
                      <MessageCircle className="w-4 h-4 text-slate-400 group-hover:text-green-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-200">Share on WhatsApp</p>
                        <p className="text-[10px] text-slate-500">Summary with disclaimer</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-3 py-1 bg-slate-800 rounded-lg text-xs font-mono text-slate-500 flex items-center gap-2">
              <Cpu className="w-3 h-3" /> {totalTokens.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Full Detailed Report (Memo Style) */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 shadow-lg">
        <div className="prose prose-invert max-w-none text-sm font-mono leading-relaxed prose-headings:text-blue-300">
          {renderMarkdown(rawText.split(/\[SCORES:/i)[0] || rawText)}
        </div>
      </div>

      {/* Visuals Section (If Data Exists) */}
      {(aiScores || stockSymbol) && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3 border-b border-slate-800 pb-4">
            <Zap className="w-5 h-5 text-yellow-500" />
            Quantitative & Technical Dashboard
          </h3>

          <div className="flex flex-col gap-6">
            {aiScores && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <div className="col-span-1 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col items-center shadow-inner">
                  <h4 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 text-center">
                    <Target className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" /> <span className="hidden sm:inline">Final</span> Conviction
                  </h4>
                  <div className="h-40 sm:h-48 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        cx="50%" cy="100%" innerRadius="70%" outerRadius="100%"
                        startAngle={180} endAngle={0}
                        data={speedometerData}
                      >
                        <RadialBar background={{ fill: '#1e293b' }} dataKey="value" cornerRadius={10} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 sm:pb-2 pointer-events-none">
                      <span className="text-xl sm:text-3xl font-bold text-white">{convictionScore}</span>
                      <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-mono mt-0.5 sm:mt-1">/ 10</span>
                    </div>
                  </div>
                </div>

                <div className="col-span-1 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col items-center shadow-inner">
                  <h4 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 text-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> 360° Profile
                  </h4>
                  <div className="h-40 sm:h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                        <Radar name="Score" dataKey="A" stroke="#3b82f6" strokeWidth={2} fill="#3b82f6" fillOpacity={0.4} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {stockSymbol && (
              <div className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col shadow-inner">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 px-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  {stockSymbol.includes(' vs ') ? 'Comparative Technical Charts (Daily)' : 'Technical Chart (Daily)'}
                </h4>

                {stockSymbol.includes(' vs ') ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stockSymbol.split(/\s*vs\.?\s*/i).map((sym, idx) => {
                      const cleanSym = sym.replace('.NS', '').replace('.BO', '').trim();
                      if (!cleanSym) return null;
                      return (
                        <div key={idx} className="h-[300px] sm:h-[400px] w-full rounded-lg overflow-hidden border border-slate-800">
                          <AdvancedRealTimeChart
                            symbol={`BSE:${cleanSym}`}
                            theme="dark"
                            interval="D"
                            autosize
                            hide_side_toolbar={true}
                            allow_symbol_change={false}
                            save_image={false}
                            toolbar_bg="#0f172a"
                          />
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px] w-full rounded-lg overflow-hidden border border-slate-800">
                    <AdvancedRealTimeChart
                      symbol={`BSE:${stockSymbol.replace('.NS', '').replace('.BO', '')}`}
                      theme="dark"
                      interval="D"
                      autosize
                      hide_side_toolbar={false}
                      allow_symbol_change={true}
                      save_image={false}
                      toolbar_bg="#0f172a"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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