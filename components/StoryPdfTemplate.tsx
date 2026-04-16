import React from 'react';

interface StoryPdfTemplateProps {
  storyText: string;
  stockSymbol: string;
  convictionScore?: number;
}

const StoryPdfTemplate: React.FC<StoryPdfTemplateProps> = ({ storyText, stockSymbol, convictionScore }) => {
  const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' });
  const cleanSymbol = stockSymbol.replace('.NS', '').replace('.BO', '');
  const score = convictionScore || 0;
  const scoreColor = score >= 7 ? '#059669' : score >= 5 ? '#d97706' : '#dc2626';

  // Split story into paragraphs for clean rendering
  const paragraphs = storyText
    .replace(/\[SCORES:.*?\]/g, '')
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Render inline bold (**text**)
  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j} style={{ fontWeight: 800, color: '#111827' }}>{part.slice(2, -2)}</strong>
        : part
    );
  };

  return (
    <div id="vantage7-story-pdf-template" style={{
      backgroundColor: '#ffffff',
      padding: '48px 52px',
      fontFamily: "'Georgia', 'Times New Roman', 'Noto Serif', serif",
      color: '#1f2937',
      width: '1100px',
      lineHeight: 1.85,
    }}>

      {/* ═══ MASTHEAD ═══ */}
      <div style={{
        borderBottom: '3px solid #111827',
        paddingBottom: '16px',
        marginBottom: '28px',
        pageBreakInside: 'avoid',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{
              fontSize: '14px',
              fontWeight: 900,
              color: '#6b7280',
              letterSpacing: '4px',
              textTransform: 'uppercase' as const,
              fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
              margin: '0 0 6px 0',
            }}>
              VANTAGE7 <span style={{ color: '#2563eb' }}>STORIES</span>
            </h1>
            <h2 style={{
              fontSize: '32px',
              fontWeight: 900,
              color: '#111827',
              letterSpacing: '-0.5px',
              margin: '0',
              lineHeight: 1.1,
              fontFamily: "'Georgia', 'Times New Roman', serif",
            }}>
              {cleanSymbol}
            </h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{
              fontFamily: "'Inter', monospace",
              color: '#9ca3af',
              fontSize: '11px',
              margin: '0 0 8px 0',
            }}>
              {dateStr}
            </p>
            {score > 0 && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#f9fafb',
                border: `2px solid ${scoreColor}`,
                borderRadius: '12px',
                padding: '6px 16px',
              }}>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#6b7280',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '1px',
                  fontFamily: "'Inter', sans-serif",
                }}>Conviction</span>
                <span style={{
                  fontSize: '24px',
                  fontWeight: 900,
                  color: scoreColor,
                  fontFamily: "'Inter', sans-serif",
                }}>{score}</span>
                <span style={{
                  fontSize: '10px',
                  color: '#9ca3af',
                  fontFamily: "'Inter', sans-serif",
                }}>/10</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ STORY BODY ═══ */}
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        {paragraphs.map((para, i) => {
          // First paragraph gets drop-cap styling
          if (i === 0) {
            return (
              <p key={i} style={{
                fontSize: '17px',
                color: '#111827',
                marginBottom: '18px',
                lineHeight: 1.85,
                fontWeight: 500,
              }}>
                {renderInline(para)}
              </p>
            );
          }

          // Regular paragraphs
          return (
            <p key={i} style={{
              fontSize: '15px',
              color: '#374151',
              marginBottom: '14px',
              lineHeight: 1.85,
            }}>
              {renderInline(para)}
            </p>
          );
        })}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{
        marginTop: '36px',
        paddingTop: '20px',
        borderTop: '2px solid #e5e7eb',
        pageBreakInside: 'avoid',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <p style={{
              fontWeight: 800,
              color: '#1d4ed8',
              fontSize: '12px',
              letterSpacing: '3px',
              textTransform: 'uppercase' as const,
              margin: '0 0 4px 0',
              fontFamily: "'Inter', sans-serif",
            }}>
              Powered by Vantage7 Engine
            </p>
            <p style={{
              fontSize: '11px',
              color: '#6b7280',
              fontFamily: 'monospace',
              margin: '0 0 2px 0',
            }}>
              Twitter/X: <strong>@pratikmehta2604</strong>
            </p>
            <p style={{
              fontSize: '11px',
              color: '#6b7280',
              fontFamily: 'monospace',
              margin: 0,
            }}>
              WhatsApp: <a href="https://whatsapp.com/channel/0029VaBCe3yLY6dBX6mg5g2y" style={{ color: '#2563eb', fontWeight: 700 }}>
                Join Channel
              </a>
            </p>
          </div>
        </div>

        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          padding: '12px 16px',
          marginTop: '12px',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{
            fontSize: '10px',
            color: '#6b7280',
            lineHeight: 1.5,
            margin: 0,
            fontFamily: "'Inter', sans-serif",
          }}>
            <strong>⚠️ Disclaimer:</strong> This story is AI-generated for educational purposes. The author is <strong><u>NOT SEBI registered</u></strong>.
            This is <strong><u>NOT financial advice</u></strong>. All data is from public sources and may contain errors. Always consult a qualified financial advisor before investing.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StoryPdfTemplate;
