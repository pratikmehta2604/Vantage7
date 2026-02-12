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

interface FinalReportProps {
  synthesizer: EngineStatus;
  totalTokens: number;
  modelUsed?: string;
}

const FinalReport: React.FC<FinalReportProps> = ({ synthesizer, totalTokens, modelUsed }) => {
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
    // Create a styled printable version
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Convert markdown bold to HTML bold for the print version
    const htmlContent = rawText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^### (.*$)/gm, '<h3 style="color:#3b82f6;margin-top:16px;">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 style="color:#fff;border-bottom:1px solid #334155;padding-bottom:4px;margin-top:20px;">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 style="color:#fff;margin-top:8px;">$1</h1>')
      .replace(/^[-*]\s+(.*$)/gm, '<div style="display:flex;gap:8px;margin:4px 0;"><span style="color:#3b82f6;">•</span><span>$1</span></div>')
      .replace(/^\d+[.)]\s+(.*$)/gm, '<div style="margin:4px 0;padding-left:8px;">$1</div>')
      .replace(/^---$/gm, '<hr style="border-color:#334155;margin:16px 0;">')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vantage7 Investment Memo</title>
        <style>
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #cbd5e1; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; font-size: 13px; }
          h1,h2,h3 { color: #e2e8f0; }
          strong { color: #f1f5f9; }
          .header { text-align: center; padding: 24px; border-bottom: 2px solid #1e40af; margin-bottom: 24px; }
          .header h1 { color: #3b82f6; font-size: 24px; margin: 0; }
          .header p { color: #64748b; font-size: 11px; margin-top: 4px; }
          .disclaimer { margin-top: 32px; padding: 12px; background: #1e293b; border-radius: 8px; font-size: 10px; color: #64748b; text-align: justify; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 Vantage7 Investment Memo</h1>
          <p>AI-Powered Equity Research • Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        ${htmlContent}
        <div class="disclaimer">
          <strong>⚠️ AI GENERATED CONTENT. NOT FINANCIAL ADVICE.</strong> The creators are not SEBI registered research analysts. Analysis is based on public data found by AI and may be hallucinated or outdated. Please consult a SEBI registered financial advisor before making investment decisions.
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    showToast('PDF preview opened — use Save as PDF in print dialog', 'info');
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