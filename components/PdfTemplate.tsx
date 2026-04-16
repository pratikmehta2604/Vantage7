import React from 'react';
import { renderMarkdownPrint } from '../services/renderUtils';

interface PdfScores {
  business?: number;
  financials?: number;
  valuation?: number;
  forensic?: number;
  technical?: number;
  conviction?: number;
}

interface PdfTemplateProps {
  rawText: string;
  stockSymbol: string;
  translatedText?: string | null;
  exportMode?: 'english' | 'gujarati' | 'dual';
  scores?: PdfScores | null;
}

// Pure CSS Score Bar — no Recharts dependency, prints perfectly
const ScoreBar = ({ label, value, max = 10 }: { label: string; value: number; max?: number }) => {
  const pct = Math.min((value / max) * 100, 100);
  const color = value >= 7 ? '#059669' : value >= 5 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#4b5563', width: '75px', textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: '14px', backgroundColor: '#e5e7eb', borderRadius: '7px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: '7px' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 800, width: '30px', textAlign: 'right', color }}>{value}/{max}</span>
    </div>
  );
};

const PdfTemplate: React.FC<PdfTemplateProps> = ({ rawText, stockSymbol, translatedText, exportMode = 'english', scores }) => {
  const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' });
  const convictionScore = scores?.conviction || 0;
  const convictionColor = convictionScore >= 7 ? '#059669' : convictionScore >= 5 ? '#d97706' : '#dc2626';

  // Full report page for one language
  const renderReportPage = (text: string, lang: 'english' | 'gujarati') => {
    const printableText = text.replace(/\[SCORES:.*?\]/g, '');
    const isGujarati = lang === 'gujarati';

    return (
      <div className="pdf-page" style={{
        backgroundColor: '#ffffff',
        padding: '40px',
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        color: '#111827',
        width: '1100px',
        lineHeight: 1.7
      }}>

        {/* ═══ HEADER ═══ */}
        <div style={{ borderBottom: '3px solid #111827', paddingBottom: '20px', marginBottom: '30px', pageBreakInside: 'avoid' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#111827', letterSpacing: '-0.5px', margin: '0 0 4px 0' }}>
                VANTAGE7 <span style={{ color: '#2563eb' }}>ENGINE</span>
              </h1>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#4b5563', margin: 0 }}>
                {isGujarati ? 'રોકાણ મેમો' : 'Investment Memo'}: <span style={{ color: '#1d4ed8', fontWeight: 800 }}>{stockSymbol}</span>
              </h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'monospace', color: '#6b7280', fontSize: '11px', margin: '0 0 4px 0' }}>{dateStr}</p>
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#4b5563', letterSpacing: '1.5px', textTransform: 'uppercase' as const, backgroundColor: '#f3f4f6', padding: '3px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>AI Synthesized</span>
            </div>
          </div>
        </div>

        {/* ═══ SCORE DASHBOARD (English only) ═══ */}
        {!isGujarati && scores && (
          <div style={{ marginBottom: '32px', pageBreakInside: 'avoid', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Conviction Score */}
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '1.5px', margin: '0 0 12px 0' }}>Final Conviction Score</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${convictionColor}`, backgroundColor: '#fff' }}>
                <span style={{ fontSize: '32px', fontWeight: 900, color: convictionColor }}>{convictionScore}</span>
              </div>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: '8px 0 0 0' }}>out of 10</p>
            </div>

            {/* Score Breakdown */}
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '1.5px', margin: '0 0 12px 0' }}>360° Score Breakdown</p>
              <ScoreBar label="Business" value={scores.business || 0} />
              <ScoreBar label="Financials" value={scores.financials || 0} />
              <ScoreBar label="Valuation" value={scores.valuation || 0} />
              <ScoreBar label="Forensic" value={scores.forensic || 0} />
              <ScoreBar label="Technical" value={scores.technical || 0} />
            </div>
          </div>
        )}

        {/* ═══ CONTENT BODY ═══ */}
        <div className="print-content">
          {renderMarkdownPrint(printableText)}
        </div>

        {/* ═══ BRANDING + DISCLAIMER (kept together, never split) ═══ */}
        <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '2px solid #d1d5db', pageBreakInside: 'avoid' }}>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontWeight: 800, color: '#1d4ed8', fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase' as const, margin: '0 0 4px 0' }}>Powered by Pratik</p>
            <p style={{ fontSize: '11px', color: '#4b5563', fontFamily: 'monospace', margin: '0 0 2px 0' }}>Twitter/X: <strong>@pratikmehta2604</strong></p>
            <p style={{ fontSize: '11px', color: '#4b5563', fontFamily: 'monospace', margin: 0 }}>
              WhatsApp Channel: <a href="https://whatsapp.com/channel/0029VaBCe3yLY6dBX6mg5g2y" style={{ color: '#2563eb', fontWeight: 700 }}>https://whatsapp.com/channel/0029VaBCe3yLY6dBX6mg5g2y</a>
            </p>
          </div>

          <div style={{ backgroundColor: '#111827', color: '#ffffff', borderRadius: '8px', padding: '16px 20px', marginTop: '12px' }}>
            <p style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>⚠️ DISCLAIMER — IMPORTANT</p>
            <p style={{ fontSize: '11px', lineHeight: 1.6, margin: 0 }}>
              This report was generated by AI models strictly for educational purposes and pattern recognition.
              The creator is <strong><u>NOT SEBI registered</u></strong>. This is <strong><u>NOT financial advice</u></strong>.
              All data is sourced from public information and AI interpretation, which may contain errors or hallucinations.
              Always perform your own due diligence and consult a qualified financial advisor before making any investment decisions.
              Past performance is not indicative of future results. Invest at your own risk.
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id="vantage7-pdf-export-template" style={{ backgroundColor: '#ffffff' }}>
      {exportMode === 'english' && renderReportPage(rawText, 'english')}
      {exportMode === 'gujarati' && translatedText && renderReportPage(translatedText, 'gujarati')}
      {exportMode === 'dual' && (
        <>
          {renderReportPage(rawText, 'english')}
          {/* Clear page break before Gujarati section */}
          <div style={{ pageBreakBefore: 'always', borderTop: '4px solid #2563eb', padding: '8px 0', textAlign: 'center' as const, backgroundColor: '#eff6ff' }}>
            <span style={{ fontSize: '13px', letterSpacing: '4px', textTransform: 'uppercase' as const, fontWeight: 800, color: '#1d4ed8' }}>— ગુજરાતી અનુવાદ / GUJARATI TRANSLATION —</span>
          </div>
          {translatedText && renderReportPage(translatedText, 'gujarati')}
        </>
      )}
    </div>
  );
};

export default PdfTemplate;
