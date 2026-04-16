import React, { useState, useEffect, useRef } from 'react';
import { StickyNote, Save, Check, Pencil, Trash2 } from 'lucide-react';

interface AnalystNotesProps {
  sessionId: string;
  stockSymbol: string;
  initialNotes?: string;
  onSave: (notes: string) => void;
}

const STORAGE_KEY = (id: string) => `v7_notes_${id}`;

const AnalystNotes: React.FC<AnalystNotesProps> = ({ sessionId, stockSymbol, initialNotes, onSave }) => {
  const [notes, setNotes] = useState(initialNotes || '');
  const [saved, setSaved] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage on mount / session change
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY(sessionId));
    if (stored !== null) setNotes(stored);
    else if (initialNotes) setNotes(initialNotes);
    setSaved(true);
  }, [sessionId, initialNotes]);

  // Auto-save on change (debounced 1.5s)
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSaved(false);
    autoSaveTimer.current = setTimeout(() => {
      handleSave(notes);
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [notes]);

  const handleSave = (text: string) => {
    localStorage.setItem(STORAGE_KEY(sessionId), text);
    onSave(text);
    setSaved(true);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const hasNotes = notes.trim().length > 0;

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-yellow-500/10 rounded-lg">
            <StickyNote className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white">Analyst Notes</p>
            <p className="text-[11px] text-slate-500">
              {hasNotes ? `${notes.trim().split(/\s+/).length} words · ` : 'Click to add '}
              {hasNotes && justSaved ? <span className="text-emerald-400">Saved ✓</span> : hasNotes && !saved ? <span className="text-yellow-400">Saving...</span> : ''}
              {!hasNotes && 'Your private notes on this analysis'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasNotes && (
            <span className="text-[10px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full font-bold">
              {notes.trim().length} chars
            </span>
          )}
          <Pencil className={`w-4 h-4 transition-colors ${isExpanded ? 'text-blue-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
        </div>
      </button>

      {/* Expandable textarea */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-slate-800">
          <div className="mt-4">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={`Your private notes on ${stockSymbol}...\n\nExample:\n• Entry price I'm considering: ₹XXX\n• Key risk I'm watching: ...\n• Catalyst to watch: Q2 FY26 results\n• What would make me sell: ...`}
              className="w-full h-40 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 text-sm p-3.5 resize-none focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 placeholder-slate-600 font-mono leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-slate-600 font-mono">
              Stored locally (private, never uploaded)
            </p>
            <div className="flex items-center gap-2">
              {hasNotes && (
                <button
                  onClick={() => { setNotes(''); handleSave(''); }}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1 hover:bg-red-500/10 rounded-lg"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
              <button
                onClick={() => handleSave(notes)}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  justSaved
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
                }`}
              >
                {justSaved ? <><Check className="w-3 h-3" /> Saved</> : <><Save className="w-3 h-3" /> Save Now</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalystNotes;
