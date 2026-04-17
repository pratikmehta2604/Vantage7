import React from 'react';

export const renderInline = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, j) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={j} className="text-white font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
};

export const renderMarkdown = (text: string) => {
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
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/80">
                    {headerCells.map((cell, j) => (
                      <th key={j} className="px-3 py-2.5 text-left text-slate-300 font-bold border-b border-slate-700/50 whitespace-normal break-words">
                        {renderInline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, ri) => (
                    <tr key={ri} className={`${ri % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-800/30'} hover:bg-slate-800/60 transition-colors`}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-slate-300 border-b border-slate-800/50 whitespace-normal break-words">
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

// ─────────────────────────────────────────────────────────────────────────────
// PRINT-OPTIMIZED RENDERERS (White background, dark text for PDF export)
// ─────────────────────────────────────────────────────────────────────────────

export const renderInlinePrint = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, j) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={j} className="text-black font-bold">{part.slice(2, -2)}</strong>
      : part
  );
};

export const renderMarkdownPrint = (text: string) => {
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
      // Filter out separator rows (---|---|---) 
      const isSeparator = (row: string) => /^\|[\s\-:]+(\|[\s\-:]+)*\|?\s*$/.test(row.trim());
      if (tableLines.length >= 2) {
        const headerCells = tableLines[0].split('|').map(c => c.trim()).filter(c => c);
        const dataRows = tableLines.slice(1)
          .filter(row => !isSeparator(row))
          .map(row => row.split('|').map(c => c.trim()).filter(c => c));

        elements.push(
          <div key={`table-${i}`} style={{
            margin: '16px 0',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid #d1d5db',
            pageBreakInside: 'auto',
          }}>
            <table style={{
              width: '100%',
              fontSize: '11px',
              borderCollapse: 'collapse',
              tableLayout: 'auto',
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  {headerCells.map((cell, j) => (
                    <th key={j} style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      color: '#111827',
                      fontWeight: 700,
                      borderBottom: '2px solid #d1d5db',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      fontSize: '11px',
                      lineHeight: '1.4',
                    }}>
                      {renderInlinePrint(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri} style={{
                    backgroundColor: ri % 2 === 0 ? '#ffffff' : '#f9fafb',
                    pageBreakInside: 'avoid',
                  }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{
                        padding: '6px 12px',
                        color: '#1f2937',
                        borderBottom: '1px solid #e5e7eb',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        fontSize: '11px',
                        lineHeight: '1.5',
                      }}>
                        {renderInlinePrint(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // --- Headers ---
    const h1Match = line.match(/^#\s+(.*)/);
    if (h1Match) {
      elements.push(<h2 key={i} className="text-xl font-extrabold text-black mt-8 mb-3 pb-2 border-b-2 border-gray-300">{renderInlinePrint(h1Match[1])}</h2>);
      i++;
      continue;
    }
    const h2Match = line.match(/^##\s+(.*)/);
    if (h2Match) {
      elements.push(<h3 key={i} className="text-lg font-bold text-gray-900 mt-6 mb-2">{renderInlinePrint(h2Match[1])}</h3>);
      i++;
      continue;
    }
    const h3Match = line.match(/^###\s+(.*)/);
    if (h3Match) {
      elements.push(<h4 key={i} className="text-base font-bold text-gray-800 mt-4 mb-1.5">{renderInlinePrint(h3Match[1])}</h4>);
      i++;
      continue;
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***') {
      elements.push(<hr key={i} className="border-gray-300 my-5" />);
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
        <div key={i} className="border-l-3 border-blue-600 pl-3 my-2 text-gray-600 italic text-sm">
          {renderInlinePrint(quoteMatch[1])}
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
        <div key={i} className="flex items-start gap-2 mb-1" style={{ paddingLeft: `${Math.min(indent, 4) * 8}px` }}>
          <span className="text-gray-500 mt-1.5 flex-shrink-0 text-[6px]">●</span>
          <p className="text-gray-800 leading-relaxed text-sm">{renderInlinePrint(bulletMatch[2])}</p>
        </div>
      );
      i++;
      continue;
    }
    // Numbered lists
    const numMatch = line.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (numMatch) {
      elements.push(
        <div key={i} className="flex items-start gap-2 mb-1">
          <span className="text-gray-500 font-mono text-xs mt-0.5 flex-shrink-0 w-5 text-right">{numMatch[1]}.</span>
          <p className="text-gray-800 leading-relaxed text-sm">{renderInlinePrint(numMatch[2])}</p>
        </div>
      );
      i++;
      continue;
    }
    // Regular paragraph
    elements.push(
      <p key={i} className="mb-2 text-gray-800 leading-relaxed text-sm">
        {renderInlinePrint(line)}
      </p>
    );
    i++;
  }

  return elements;
};
