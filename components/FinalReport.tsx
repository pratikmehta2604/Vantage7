import React, { useState, useRef, useEffect } from 'react';
import { EngineStatus } from '../types';
import { useToast } from './Toast';
import AnalystNotes from './AnalystNotes';
import { translateReport } from '../services/geminiService';
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
  MessageCircle,
  TrendingDown,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ShieldAlert,
  CheckSquare,
  Square,
  XCircle,
  Languages,
  Printer
} from 'lucide-react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  RadialBarChart, RadialBar
} from 'recharts';
import { ReportChat } from './ReportChat';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { AdvancedRealTimeChart } from "react-ts-tradingview-widgets";
import PdfTemplate from './PdfTemplate';
import StoryPdfTemplate from './StoryPdfTemplate';
import { renderMarkdown, renderInline } from '../services/renderUtils';

interface FinalReportProps {
  synthesizer: EngineStatus;
  totalTokens: number;
  modelUsed?: string;
  stockSymbol?: string;
  sessionId?: string;
  sessionNotes?: string;
  onSaveNotes?: (notes: string) => void;
  storytellerEngine?: EngineStatus;
  onGenerateStory?: () => void;
}

const FinalReport: React.FC<FinalReportProps> = ({ synthesizer, totalTokens, modelUsed, stockSymbol, sessionId, sessionNotes, onSaveNotes, storytellerEngine, onGenerateStory }) => {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const reportContainerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  
  // Translation State
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [showTranslation, setShowTranslation] = useState<boolean>(false);
  const [showPdfMenu, setShowPdfMenu] = useState<boolean>(false);
  const [pdfExportMode, setPdfExportMode] = useState<'english'|'gujarati'|'dual'>('english');
  const pdfMenuRef = useRef<HTMLDivElement>(null);

  if (synthesizer.status !== 'success' || !synthesizer.result) return null;

  const originalText = synthesizer.result;
  const rawText = showTranslation && translatedText ? translatedText : originalText;

  // Close share menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target as Node)) {
        setShowPdfMenu(false);
      }
    };
    if (showShareMenu || showPdfMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showShareMenu, showPdfMenu]);

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
  // Supports both old format (4 sections) and new format (6 sections with accountability + forward thesis)
  const execSummary = extractSectionByRegex(/1\.\s*(?:\*\*)?Executive\s*Summary(?:\*\*)?:?/i, /2\.\s*(?:\*\*)?Strategic\s*Setup/i);
  const strategicSetup = extractSectionByRegex(/2\.\s*(?:\*\*)?Strategic\s*Setup.*?(:|\*\*)/i, /3\.\s*(?:\*\*)?360\s*Analysis/i);
  const analysis360 = extractSectionByRegex(/3\.\s*(?:\*\*)?360\s*Analysis.*?(:|\*\*)/i, /(?:4\.\s*(?:\*\*)?(?:📋|Final))/i);

  // New sections: Management Accountability (4) and Forward Thesis (5)
  const accountability = extractSectionByRegex(/4\.\s*(?:\*\*)?(?:📋\s*)?What\s*They\s*Said/i, /(?:5\.\s*(?:\*\*)?(?:🔮|Next))/i);
  const forwardThesis = extractSectionByRegex(/5\.\s*(?:\*\*)?(?:🔮\s*)?Next\s*18\s*Months/i, /(?:6\.\s*(?:\*\*)?(?:🎯|Final))/i);
  const moneyDecision = extractSectionByRegex(/6\.\s*(?:\*\*)?(?:🎯\s*)?The\s*Money\s*Decision/i, /(?:7\.\s*(?:\*\*)?Final\s*Verdict)/i);

  // Final Verdict — handle both old (section 4) and new (section 6) formats
  const finalVerdict = extractSectionByRegex(/(?:4|6|7)\.\s*(?:\*\*)?Final\s*Verdict.*?(:|\*\*)/i);

  // Fallback if parsing missed significant chunks: accept either old or new format
  const hasNewSections = accountability && forwardThesis;
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

  // ─── Extract Scenario Data (Bull / Base / Bear) ───────────────────────────
  const extractScenarios = () => {
    const text = rawText;
    const scenarios: { type: 'bull' | 'base' | 'bear'; label: string; prob: string; trigger: string; target: string; revenue: string; color: string }[] = [];

    const patterns = [
      { re: /🟢\s*\*?\*?Bull\s*Case.*?(?:probability)?[:\s]*([\d]+%)[^]*?(?:Target\s*Price[:\s]*([^\n]*)|(?=🟡|---|\.{3,})|$)/i, type: 'bull' as const, label: '🐂 Bull Case', color: 'emerald' },
      { re: /🟡\s*\*?\*?Base\s*Case.*?(?:probability)?[:\s]*([\d]+%)[^]*?(?:Target\s*Price[:\s]*([^\n]*)|(?=🔴|---|\.{3,})|$)/i, type: 'base' as const, label: '📊 Base Case', color: 'yellow' },
      { re: /🔴\s*\*?\*?Bear\s*Case.*?(?:probability)?[:\s]*([\d]+%)[^]*?(?:Target\s*Price[:\s]*([^\n]*)|(?=---|\.{3,})|$)/i, type: 'bear' as const, label: '🐻 Bear Case', color: 'red' },
    ];

    // Try to extract probability and target from surrounding text
    const bullSection = extractSectionByRegex(/🟢[^]*?Bull\s*Case/i, /🟡[^]*?Base\s*Case/i) || extractSectionByRegex(/Bull\s*Case\s*\(30/i, /Base\s*Case/i);
    const baseSection = extractSectionByRegex(/🟡[^]*?Base\s*Case/i, /🔴[^]*?Bear\s*Case/i) || extractSectionByRegex(/Base\s*Case\s*\(50/i, /Bear\s*Case/i);
    const bearSection = extractSectionByRegex(/🔴[^]*?Bear\s*Case/i, /Smart\s*Money|Cycle\s*Position|Kill\s*Switch|💀|📡/i) || extractSectionByRegex(/Bear\s*Case\s*\(20/i, /Smart\s*Money/i);

    const getProbability = (section: string, defaultVal: string) => {
      const m = section.match(/(\d+)%\s*probability/i) || section.match(/probability[:\s]*(\d+)%/i);
      return m ? `${m[1]}%` : defaultVal;
    };
    const getTarget = (section: string) => {
      const m = section.match(/Target\s*Price[:\s]*([₹\d,\.\s]+(?:Cr|crore|lakh|k)?)/i);
      return m ? m[1].trim().slice(0, 25) : 'See report';
    };
    const getTrigger = (section: string) => {
      const m = section.match(/Key\s*[Tt]rigger[:\s]*([^\n.]+)/i) || section.match(/[Ww]hat goes (?:right|wrong)[:\s]*([^\n.]+)/i);
      return m ? m[1].trim().slice(0, 80) : '';
    };

    if (bullSection) scenarios.push({ type: 'bull', label: '🐂 Bull Case', prob: getProbability(bullSection, '30%'), target: getTarget(bullSection), trigger: getTrigger(bullSection), revenue: '', color: 'emerald' });
    if (baseSection) scenarios.push({ type: 'base', label: '📊 Base Case', prob: getProbability(baseSection, '50%'), target: getTarget(baseSection), trigger: getTrigger(baseSection), revenue: '', color: 'yellow' });
    if (bearSection) scenarios.push({ type: 'bear', label: '🐻 Bear Case', prob: getProbability(bearSection, '20%'), target: getTarget(bearSection), trigger: getTrigger(bearSection), revenue: '', color: 'red' });

    return scenarios;
  };

  // ─── Extract Entry / Exit Framework ──────────────────────────────────────
  const extractEntryExit = () => {
    const text = rawText;
    const result = { entryZone: '', stopLoss: '', t1: '', t2: '', t3: '', conviction: '' };

    const entryM = text.match(/Entry\s*(?:Zone|Strategy|Range)?[:\s]*([₹\d,\.\s–-]+(?:(?:to|-|–)[₹\d,\.\s]+)?)/i);
    if (entryM) result.entryZone = entryM[1].trim().slice(0, 40);

    const slM = text.match(/Stop[\s-]*[Ll]oss[:\s]*([₹\d,\.\s]+)/i);
    if (slM) result.stopLoss = slM[1].trim().slice(0, 25);

    const t1M = text.match(/T1[:\s]*([₹\d,\.\s]+)/i);
    if (t1M) result.t1 = t1M[1].trim().slice(0, 20);
    const t2M = text.match(/T2[:\s]*([₹\d,\.\s]+)/i);
    if (t2M) result.t2 = t2M[1].trim().slice(0, 20);
    const t3M = text.match(/T3[:\s]*([₹\d,\.\s]+)/i);
    if (t3M) result.t3 = t3M[1].trim().slice(0, 20);

    const convM = text.match(/Conviction\s*(?:Level|Score)?[:\s]*(High|Medium|Low|\d+\/10)/i);
    if (convM) result.conviction = convM[1];

    return result;
  };

  // ─── Extract Thesis Invalidation Triggers ────────────────────────────────
  const extractInvalidationTriggers = (): string[] => {
    const section = extractSectionByRegex(/Thesis\s*Invalidation\s*Triggers?/i, /Anti[-\s]?Bias|Pattern\s*Recognition|Hidden\s*Scores|\[SCORES/i);
    if (!section) return [];

    const lines = section.split('\n').filter(l => l.trim());
    const triggers: string[] = [];
    for (const line of lines) {
      const m = line.match(/^\s*(?:\d+[.)]|[-*•]|[1-3][.)])?\s*(.{15,})/i);
      if (m && triggers.length < 4) triggers.push(m[1].trim().replace(/\*\*/g, ''));
    }
    return triggers.slice(0, 4);
  };

  // ─── Extract Red Flag Count ───────────────────────────────────────────────
  const extractRedFlags = (): { flags: string[]; score: string } => {
    const text = rawText;
    const flags: string[] = [];

    // Look for 🚩 emoji lines
    const flagLines = text.split('\n').filter(l => l.includes('🚩') || l.includes('FAIL') || l.includes('RED ALERT'));
    flagLines.forEach(line => {
      const clean = line.replace(/[🚩*#]/g, '').trim();
      if (clean.length > 10 && flags.length < 5) flags.push(clean.slice(0, 80));
    });

    // Forensic verdict
    const verdictM = text.match(/OVERALL\s*FORENSIC\s*SCORE[:\s]*(.*?)(?:\n|$)/i) ||
                     text.match(/Forensic\s*(?:Score|Safety)[:\s]*(CLEAN|CAUTION|DANGER)/i);
    const score = verdictM ? verdictM[1].trim().slice(0, 30) : '';

    return { flags, score };
  };

  const scenarios = extractScenarios();
  const entryExit = extractEntryExit();
  const invalidationTriggers = extractInvalidationTriggers();
  const { flags: redFlags, score: forensicScore } = extractRedFlags();

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

  const handleDownloadPDF = async (mode: 'english'|'gujarati'|'dual' = 'english') => {
    setPdfExportMode(mode);
    setShowPdfMenu(false);
    showToast('Preparing PDF — use "Save as PDF" in the print dialog', 'info');
    
    // Give React time to render the hidden template block with the new mode
    setTimeout(() => {
      try {
        const templateWrapper = document.querySelector('.pdf-template-wrapper') as HTMLElement;
        const targetContainer = document.getElementById('vantage7-pdf-export-template');
        if (!targetContainer || !templateWrapper) throw new Error("Template missing");
        
        // Temporarily make visible to read the rendered HTML
        templateWrapper.style.position = 'static';
        templateWrapper.style.left = '0';
        templateWrapper.style.opacity = '1';
        templateWrapper.style.pointerEvents = 'auto';
        
        const content = targetContainer.outerHTML;
        
        // Hide again
        templateWrapper.style.position = 'absolute';
        templateWrapper.style.left = '-9999px';
        templateWrapper.style.opacity = '0';
        templateWrapper.style.pointerEvents = 'none';
        
        // Collect ALL CSS from the current document (includes Tailwind + custom styles)
        let cssText = '';
        try {
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              for (const rule of Array.from(sheet.cssRules)) {
                cssText += rule.cssText + '\n';
              }
            } catch (e) { /* skip cross-origin stylesheets */ }
          }
        } catch (e) { console.warn('Could not copy some stylesheets'); }
        
        // Open print window
        const printWindow = window.open('', '_blank', 'width=1100,height=900');
        if (!printWindow) {
          showToast('Please allow popups to generate PDFs', 'error');
          return;
        }
        
        const title = stockSymbol 
          ? `Vantage7 Analysis — ${stockSymbol.replace('.NS', '').replace('.BO', '')}` 
          : 'Vantage7 Investment Memo';
        
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    ${cssText}
    
    /* ═══ PRINT-SPECIFIC OVERRIDES ═══ */
    @page {
      size: A4;
      margin: 12mm 10mm 15mm 10mm;
    }
    
    @media print {
      body {
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      
      .pdf-page {
        width: 100% !important;
        padding: 0 !important;
        min-height: auto !important;
      }
      
      /* Never break inside these elements */
      h1, h2, h3, h4 { page-break-after: avoid; }
      img, svg { page-break-inside: avoid; }
      
      /* ═══ TABLE PRINT RULES ═══ */
      table {
        width: 100% !important;
        border-collapse: collapse !important;
        font-size: 10px !important;
        page-break-inside: auto !important;
      }
      thead {
        display: table-header-group !important;  /* repeat header on every page */
      }
      tr {
        page-break-inside: avoid !important;
        page-break-after: auto !important;
      }
      th, td {
        padding: 6px 10px !important;
        border: 1px solid #d1d5db !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
        white-space: normal !important;
        min-width: 40px !important;
      }
      th {
        background-color: #f3f4f6 !important;
        font-weight: 700 !important;
        color: #111827 !important;
      }
      td {
        color: #1f2937 !important;
      }
      tr:nth-child(even) td {
        background-color: #f9fafb !important;
      }
      
      /* Keep headings with their content */
      h1 + *, h2 + *, h3 + *, h4 + * { page-break-before: avoid; }
      
      /* Gujarati section always starts on a new page */
      .gujarati-page-break { page-break-before: always; }
    }
    
    /* Screen-only styling for the print preview window */
    @media screen {
      body {
        max-width: 1100px;
        margin: 0 auto;
        padding: 20px;
        font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`);
        
        printWindow.document.close();
        
        // Wait for the document to fully render, then trigger print
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          // Close the print window after the user finishes with print dialog
          // Use a small delay so the print dialog has time to open
          printWindow.onafterprint = () => {
            setTimeout(() => printWindow.close(), 500);
          };
        }, 800);
        
      } catch (error) {
        console.error('PDF generation failed:', error);
        showToast('Failed to generate PDF.', 'error');
      }
    }, 500);
  };

  const handleWhatsAppShare = () => {
    // Create a concise summary for WhatsApp (max ~1000 chars for readability)
    const summary = rawText
      .replace(/\*\*(.*?)\*\*/g, '*$1*') // Convert markdown bold to WhatsApp bold
      .replace(/^#{1,3}\s+/gm, '')
      .slice(0, 1200);

    const whatsappText = encodeURIComponent(
      `📊 *Vantage7 Investment Memo*\n\n${summary}...\n\n🔗 *Join my WhatsApp Channel for more:* https://whatsapp.com/channel/0029VaBCe3yLY6dBX6mg5g2y\n🐦 *Twitter/X:* @pratikmehta2604\n\n⚠️ _Disclaimer: AI-generated analysis. Not SEBI registered. Not financial advice. Consult a qualified advisor._`
    );
    window.open(`https://wa.me/?text=${whatsappText}`, '_blank');
    showToast('Opening WhatsApp...', 'success');
  };

  const handleTranslateToggle = async (lang: string) => {
    // If it's already showing Gujarati, toggle back to English
    if (showTranslation && translatedText) {
      setShowTranslation(false);
      return;
    }
    // If we have downloaded Gujarati before but hid it, just reveal it
    if (!showTranslation && translatedText) {
      setShowTranslation(true);
      return;
    }
    
    // Otherwise, execute the actual translation fetch
    if (isTranslating) return;
    setIsTranslating(true);
    showToast(`Translating to ${lang}...`, 'info');
    try {
      const textToTranslate = originalText;
      const translated = await translateReport(textToTranslate, lang);
      setTranslatedText(translated);
      setShowTranslation(true);
      showToast('Translation complete!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Translation failed.', 'error');
    } finally {
      setIsTranslating(false);
    }
  };

  // --- Main Render ---

  return (
    <>
      <div id="vantage7-report-container" ref={reportContainerRef} className="mt-8 space-y-8 animate-fade-in-up pdf-target">

      {/* Header Card */}
      <div className="relative bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl group">
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
          <div className="flex gap-2 items-center flex-wrap justify-end mt-4 sm:mt-0">
            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => handleTranslateToggle('Gujarati')}
                disabled={isTranslating}
                className={`p-1.5 sm:p-2 border rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold disabled:opacity-50 ${showTranslation ? 'bg-blue-600 text-white border-blue-500' : translatedText ? 'border-emerald-600 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-blue-400'}`}
                title={showTranslation ? 'Switch to English' : translatedText ? 'Switch to Gujarati (saved)' : 'Translate to Gujarati'}
              >
                <Languages className={`w-4 h-4 ${isTranslating ? 'animate-pulse text-blue-400' : ''}`} />
                <span className="hidden sm:inline">{showTranslation ? 'EN' : translatedText ? 'આ ✓' : 'આ'}</span>
              </button>

              <div className="relative" ref={pdfMenuRef}>
                <button
                  onClick={() => {
                    if (translatedText) {
                      setShowPdfMenu(!showPdfMenu);
                    } else {
                      handleDownloadPDF('english');
                    }
                  }}
                  className={`p-1.5 sm:p-2 border rounded-lg transition-colors flex items-center gap-1 ${showPdfMenu ? 'bg-purple-600 text-white border-purple-500' : 'border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-purple-400'}`}
                  title="Save as Premium PDF"
                >
                  <Printer className="w-4 h-4" />
                </button>
                {/* Advanced PDF Menu (Shown only if translated text exists) */}
                {showPdfMenu && translatedText && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in-up">
                    <div className="p-1.5 flex flex-col">
                      <button onClick={() => handleDownloadPDF('english')} className="text-left px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 rounded-lg">📄 English PDF</button>
                      <button onClick={() => handleDownloadPDF('gujarati')} className="text-left px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 rounded-lg">📄 Gujarati PDF</button>
                      <button onClick={() => handleDownloadPDF('dual')} className="text-left px-3 py-2 text-xs font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg mt-1 border border-purple-500/20">📄 Dual-Language PDF</button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleWhatsAppShare}
                className="p-1.5 sm:p-2 border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
                title="Share via WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
              </button>

              <button
                onClick={handleCopyToClipboard}
                className="p-1.5 sm:p-2 border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Copy text"
              >
                <Copy className="w-4 h-4" />
              </button>

              {/* Story Mode Button */}
              {onGenerateStory && (
                <button
                  onClick={onGenerateStory}
                  disabled={storytellerEngine?.status === 'loading'}
                  className={`p-1.5 sm:p-2 border rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold disabled:opacity-50 ${
                    storytellerEngine?.status === 'success'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                      : storytellerEngine?.status === 'loading'
                        ? 'border-amber-500/50 bg-amber-500/5 text-amber-300 animate-pulse'
                        : 'border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-amber-400'
                  }`}
                  title={storytellerEngine?.status === 'success' ? 'Story generated! Scroll down to view' : 'Generate shareable story version'}
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {storytellerEngine?.status === 'loading' ? 'Writing...' : storytellerEngine?.status === 'success' ? 'Story ✓' : 'Story'}
                  </span>
                </button>
              )}
            </div>

            <div className="hidden sm:flex px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-mono text-slate-500 items-center gap-2">
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

      {/* ═══ ANALYTICAL INTELLIGENCE PANELS ═══ */}

      {/* Scenario Cards — Bull / Base / Bear */}
      {scenarios.length === 3 && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
          <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2 border-b border-slate-800 pb-3">
            <span className="text-lg">🔮</span> 12-18 Month Scenario Builder
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map(sc => (
              <div key={sc.type} className={`rounded-xl border p-4 flex flex-col gap-3 ${
                sc.type === 'bull' ? 'bg-emerald-500/5 border-emerald-500/30' :
                sc.type === 'base' ? 'bg-yellow-500/5 border-yellow-500/30' :
                'bg-red-500/5 border-red-500/30'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">{sc.label}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    sc.type === 'bull' ? 'bg-emerald-500/20 text-emerald-400' :
                    sc.type === 'base' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>{sc.prob}</span>
                </div>
                {sc.target && sc.target !== 'See report' && (
                  <div className="flex items-center gap-2">
                    <Target className={`w-3.5 h-3.5 flex-shrink-0 ${
                      sc.type === 'bull' ? 'text-emerald-400' : sc.type === 'base' ? 'text-yellow-400' : 'text-red-400'
                    }`} />
                    <span className="text-slate-200 text-xs font-mono">{sc.target}</span>
                  </div>
                )}
                {sc.trigger && (
                  <p className="text-slate-400 text-[11px] leading-relaxed italic">"{sc.trigger}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entry / Exit Actionable Card */}
      {(entryExit.entryZone || entryExit.stopLoss || entryExit.t1) && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-lg">
          <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
            <DollarSign className="w-4 h-4 text-emerald-400" /> Entry / Exit Framework
            {entryExit.conviction && (
              <span className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full ${
                entryExit.conviction.toLowerCase().includes('high') ? 'bg-emerald-500/20 text-emerald-400' :
                entryExit.conviction.toLowerCase().includes('medium') ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>Conviction: {entryExit.conviction}</span>
            )}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {entryExit.entryZone && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> Entry Zone</p>
                <p className="text-white font-bold text-sm font-mono">{entryExit.entryZone}</p>
              </div>
            )}
            {entryExit.stopLoss && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><ArrowDownRight className="w-3 h-3" /> Stop Loss</p>
                <p className="text-white font-bold text-sm font-mono">{entryExit.stopLoss}</p>
              </div>
            )}
            {entryExit.t1 && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Target 1</p>
                <p className="text-white font-bold text-sm font-mono">{entryExit.t1}</p>
              </div>
            )}
            {(entryExit.t2 || entryExit.t3) && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> T2 / T3</p>
                <p className="text-white font-bold text-sm font-mono">{[entryExit.t2, entryExit.t3].filter(Boolean).join(' / ')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Thesis Invalidation Checklist */}
      {invalidationTriggers.length > 0 && (
        <ThesisInvalidationChecklist triggers={invalidationTriggers} />
      )}

      {/* Red Flag Widget */}
      {(redFlags.length > 0 || forensicScore) && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-lg">
          <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
            <ShieldAlert className="w-4 h-4 text-red-400" /> Forensic Red Flag Radar
            {forensicScore && (
              <span className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full ${
                forensicScore.toLowerCase().includes('clean') ? 'bg-emerald-500/20 text-emerald-400' :
                forensicScore.toLowerCase().includes('caution') ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>{forensicScore.replace(/[✅⚠️🚩]/g, '').trim()}</span>
            )}
          </h3>
          {redFlags.length === 0 ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-300 text-sm font-medium">No material red flags detected. Accounts appear trustworthy.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {redFlags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 bg-red-500/5 rounded-lg border border-red-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-200 text-xs leading-relaxed">{flag}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analyst Notes */}
      {sessionId && onSaveNotes && (
        <AnalystNotes
          sessionId={sessionId}
          stockSymbol={stockSymbol || 'Stock'}
          initialNotes={sessionNotes}
          onSave={onSaveNotes}
        />
      )}

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

      {/* AI Chatbot */}
      <ReportChat reportText={rawText} stockSymbol={stockSymbol || 'Stock'} />

      {/* Footer / Disclaimer */}
      <div className="flex items-start gap-3 p-4 bg-slate-900/40 rounded-xl border border-slate-800/50">
        <AlertOctagon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-500 leading-relaxed text-justify">
          <strong>AI GENERATED CONTENT. NOT FINANCIAL ADVICE.</strong> The creators are not SEBI registered.
          Analysis is based on public data found by AI bots and may be hallucinated or outdated.
          Please consult a qualified financial advisor before investing.
        </p>
      </div>
      {/* Hidden Branding Footer (Only visible during PDF export) */}
      <div className="hidden pdf-only mt-12 p-6 border-t-2 border-slate-800 text-center">
        <h4 className="text-xl font-black text-slate-800 tracking-wider mb-2 uppercase">Vantage7 Engine</h4>
        <p className="text-sm text-slate-500 mb-4 font-bold">Powered by Pratik</p>
        <div className="flex flex-col items-center gap-2 text-xs font-mono text-slate-400 mb-4">
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3 text-emerald-500" /> WhatsApp: https://whatsapp.com/channel/0029VaBCe3yLY6dBX6mg5g2y</span>
          <span className="flex items-center gap-1 text-slate-500">Twitter/X: @pratikmehta2604</span>
        </div>
        <p className="text-[10px] text-slate-400 italic max-w-2xl mx-auto">
          Disclaimer: This report was generated by AI models strictly for educational purposes and pattern recognition. 
          The creator is not SEBI registered. This is not financial advice. Please perform your own due diligence before investing.
        </p>
      </div>

    </div>

      {/* ═══ STORY MODE SECTION ═══ */}
      {storytellerEngine?.status === 'success' && storytellerEngine.result && (
        <div className="mt-8 animate-fade-in-up">
          <div className="bg-gradient-to-br from-amber-500/5 via-slate-900 to-orange-500/5 rounded-2xl border border-amber-500/20 shadow-2xl overflow-hidden">
            {/* Story Header */}
            <div className="px-6 py-4 border-b border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <BookOpen className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Story Mode</h3>
                  <p className="text-xs text-slate-500 font-mono">Shareable Narrative • Podcast Ready</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Copy for NotebookLM */}
                <button
                  onClick={() => {
                    const cleanText = storytellerEngine.result!
                      .replace(/\*\*(.*?)\*\*/g, '$1')
                      .replace(/^#{1,3}\s+/gm, '')
                      .replace(/\[SCORES:.*?\]/g, '');
                    navigator.clipboard.writeText(cleanText).then(() => {
                      showToast('Story copied! Paste into NotebookLM for podcast', 'success');
                    });
                  }}
                  className="px-3 py-1.5 border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-bold"
                  title="Copy clean text for NotebookLM podcast generation"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Copy for NotebookLM</span>
                </button>
                {/* Story WhatsApp */}
                <button
                  onClick={() => {
                    const storyPreview = storytellerEngine.result!
                      .replace(/\*\*(.*?)\*\*/g, '*$1*')
                      .replace(/\[SCORES:.*?\]/g, '')
                      .slice(0, 1000);
                    const whatsappText = encodeURIComponent(
                      `📖 *${stockSymbol || 'Stock'} — The Story*\n\n${storyPreview}...\n\n🔗 *More stories:* https://whatsapp.com/channel/0029VaBCe3yLY6dBX6mg5g2y\n\n⚠️ _AI-generated. Not financial advice._`
                    );
                    window.open(`https://wa.me/?text=${whatsappText}`, '_blank');
                    showToast('Opening WhatsApp...', 'success');
                  }}
                  className="p-1.5 border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"
                  title="Share story on WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
                {/* Story PDF */}
                <button
                  onClick={() => {
                    showToast('Preparing Story PDF...', 'info');
                    setTimeout(() => {
                      try {
                        const templateWrapper = document.querySelector('.story-pdf-template-wrapper') as HTMLElement;
                        const targetContainer = document.getElementById('vantage7-story-pdf-template');
                        if (!targetContainer || !templateWrapper) throw new Error('Story template missing');

                        templateWrapper.style.position = 'static';
                        templateWrapper.style.left = '0';
                        templateWrapper.style.opacity = '1';
                        const content = targetContainer.outerHTML;
                        templateWrapper.style.position = 'absolute';
                        templateWrapper.style.left = '-9999px';
                        templateWrapper.style.opacity = '0';

                        const printWindow = window.open('', '_blank', 'width=1100,height=900');
                        if (!printWindow) { showToast('Please allow popups', 'error'); return; }

                        const title = `${(stockSymbol || 'Stock').replace('.NS','').replace('.BO','')} — Story`;
                        printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  @page { size: A4; margin: 12mm 10mm 15mm 10mm; }
  body { margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; }
  @media print {
    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .pdf-page { width: 100% !important; padding: 0 !important; }
  }
  @media screen { body { max-width: 1100px; margin: 0 auto; padding: 20px; } }
</style></head><body>${content}</body></html>`);
                        printWindow.document.close();
                        setTimeout(() => {
                          printWindow.focus();
                          printWindow.print();
                          printWindow.onafterprint = () => setTimeout(() => printWindow.close(), 500);
                        }, 800);
                      } catch (error) {
                        console.error('Story PDF failed:', error);
                        showToast('Story PDF failed', 'error');
                      }
                    }, 300);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold shadow-lg shadow-amber-900/20"
                  title="Export as 2-page Story PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Story PDF</span>
                </button>
              </div>
            </div>

            {/* Story Content */}
            <div className="p-8">
              <div className="max-w-3xl mx-auto prose prose-invert prose-lg">
                {storytellerEngine.result.replace(/\[SCORES:.*?\]/g, '').split('\n').filter((p: string) => p.trim()).map((para: string, i: number) => {
                  // Render inline bold
                  const renderStoryInline = (text: string) => {
                    const parts = text.split(/(\*\*.*?\*\*)/g);
                    return parts.map((part: string, j: number) =>
                      part.startsWith('**') && part.endsWith('**')
                        ? <strong key={j} className="text-white font-bold">{part.slice(2, -2)}</strong>
                        : part
                    );
                  };
                  return (
                    <p key={i} className={`mb-4 leading-relaxed ${
                      i === 0 ? 'text-lg text-slate-200 font-medium' : 'text-[15px] text-slate-300'
                    }`}>
                      {renderStoryInline(para)}
                    </p>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Story loading indicator */}
      {storytellerEngine?.status === 'loading' && (
        <div className="mt-8 p-6 bg-slate-900 border border-amber-500/20 rounded-2xl flex items-center gap-4 animate-pulse">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-amber-500/60 border-t-amber-400 animate-spin" />
            <BookOpen className="w-4 h-4 text-amber-400 absolute inset-0 m-auto" />
          </div>
          <div>
            <h4 className="text-white font-bold text-sm">Crafting Your Story...</h4>
            <p className="text-slate-500 text-xs font-mono">Transforming analysis into engaging narrative</p>
          </div>
        </div>
      )}

      {/* Hidden Premium PDF Template for Export capture */}
      <div className="pdf-template-wrapper absolute -left-[9999px] top-0 pointer-events-none opacity-0">
         <PdfTemplate 
           rawText={originalText} 
           stockSymbol={stockSymbol || 'Report'} 
           translatedText={translatedText}
           exportMode={pdfExportMode}
           scores={aiScores}
         />
      </div>

      {/* Hidden Story PDF Template for Export capture */}
      {storytellerEngine?.status === 'success' && storytellerEngine.result && (
        <div className="story-pdf-template-wrapper absolute -left-[9999px] top-0 pointer-events-none opacity-0">
          <StoryPdfTemplate
            storyText={storytellerEngine.result}
            stockSymbol={stockSymbol || 'Report'}
            convictionScore={aiScores?.conviction}
          />
        </div>
      )}
    </>
  );
};

export default FinalReport;

// ─── Thesis Invalidation Checklist Component ─────────────────────────────────
interface ThesisChecklistProps { triggers: string[] }

const ThesisInvalidationChecklist: React.FC<ThesisChecklistProps> = ({ triggers }) => {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const toggle = (i: number) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));
  const invalidatedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <XCircle className="w-4 h-4 text-orange-400" /> Thesis Invalidation Triggers
        </h3>
        {invalidatedCount > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 bg-red-500/20 text-red-400 rounded-full border border-red-500/30 animate-pulse">
            ⚠️ {invalidatedCount} trigger{invalidatedCount > 1 ? 's' : ''} hit!
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-3 italic">These are the "When to SELL" conditions. Check one off if it occurs — that's your exit signal.</p>
      <div className="space-y-2">
        {triggers.map((t, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
              checked[i]
                ? 'bg-red-500/15 border-red-500/40'
                : 'bg-slate-950/50 border-slate-700/50 hover:border-orange-500/30 hover:bg-orange-500/5'
            }`}
          >
            {checked[i]
              ? <CheckSquare className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              : <Square className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            }
            <p className={`text-xs leading-relaxed ${checked[i] ? 'text-red-300 line-through opacity-70' : 'text-slate-300'}`}>{t}</p>
          </button>
        ))}
      </div>
      {invalidatedCount >= 2 && (
        <div className="mt-3 flex items-center gap-2 p-3 bg-red-500/10 rounded-xl border border-red-500/30">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-xs font-bold">Critical: Multiple triggers hit. Thesis may be broken. Re-analyze immediately.</p>
        </div>
      )}
    </div>
  );
};