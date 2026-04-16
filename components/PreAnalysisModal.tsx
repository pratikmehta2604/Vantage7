import React, { useState } from 'react';
import { AnalysisContext } from '../types';
import {
  X, Clock, Target, ShieldCheck, TrendingUp, MessageSquare,
  ChevronRight, Zap, BarChart2
} from 'lucide-react';

interface PreAnalysisModalProps {
  stockSymbol: string;
  userQuery: string;
  onConfirm: (context: AnalysisContext) => void;
  onSkip: () => void;
  onClose: () => void;
}

type Step = 'horizon' | 'goal' | 'risk' | 'position' | 'hypothesis';
const STEPS: Step[] = ['horizon', 'goal', 'risk', 'position', 'hypothesis'];

const PreAnalysisModal: React.FC<PreAnalysisModalProps> = ({ stockSymbol, userQuery, onConfirm, onSkip, onClose }) => {
  const [step, setStep] = useState(0);
  const [context, setContext] = useState<Partial<AnalysisContext>>({});
  const [hypothesis, setHypothesis] = useState('');

  const current = STEPS[step];
  const totalSteps = STEPS.length;

  const handleSelect = (key: keyof AnalysisContext, value: any) => {
    const updated = { ...context, [key]: value };
    setContext(updated);
    if (step < totalSteps - 1) {
      setTimeout(() => setStep(s => s + 1), 200);
    }
  };

  const handleFinish = () => {
    const final: AnalysisContext = {
      horizon: context.horizon || 'medium',
      goal: context.goal || 'growth',
      riskTolerance: context.riskTolerance || 'moderate',
      position: context.position || 'fresh',
      hypothesis: hypothesis.trim() || undefined,
    };
    onConfirm(final);
  };

  const progressPct = ((step) / (totalSteps - 1)) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/10 rounded-lg">
                <BarChart2 className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Personalize Analysis</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-white font-bold text-lg">
            Tell us how to analyze <span className="text-blue-400">{stockSymbol}</span>
          </p>
          <p className="text-slate-500 text-xs mt-1">
            The AI will tailor its entire analysis to match your investment profile.
          </p>

          {/* Progress bar */}
          <div className="mt-4 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1 text-right font-mono">Step {step + 1} of {totalSteps}</p>
        </div>

        {/* Content */}
        <div className="px-6 py-6 min-h-[280px] flex flex-col justify-center">

          {current === 'horizon' && (
            <QuestionBlock
              icon={<Clock className="w-5 h-5 text-blue-400" />}
              question="What is your investment time horizon?"
              subtitle="This determines whether short-term catalysts or long-term compounding gets priority."
              options={[
                { value: 'short', label: 'Short-term', sub: 'Under 3 months — trading thesis', emoji: '⚡' },
                { value: 'medium', label: 'Medium-term', sub: '6-12 months — catalyst play', emoji: '📅' },
                { value: 'long', label: 'Long-term', sub: '3+ years — compounder thesis', emoji: '🌱' },
              ]}
              selected={context.horizon}
              onSelect={(v) => handleSelect('horizon', v)}
            />
          )}

          {current === 'goal' && (
            <QuestionBlock
              icon={<Target className="w-5 h-5 text-emerald-400" />}
              question="What is your primary investment goal?"
              subtitle="Sets the analytical weight between growth, income, and risk-adjusted return."
              options={[
                { value: 'growth', label: 'Capital Growth', sub: 'Maximize wealth creation', emoji: '🚀' },
                { value: 'dividend', label: 'Dividend Income', sub: 'Steady cash flow + stability', emoji: '💰' },
                { value: 'balanced', label: 'Risk-Adjusted', sub: 'Best risk/reward tradeoff', emoji: '⚖️' },
              ]}
              selected={context.goal}
              onSelect={(v) => handleSelect('goal', v)}
            />
          )}

          {current === 'risk' && (
            <QuestionBlock
              icon={<ShieldCheck className="w-5 h-5 text-yellow-400" />}
              question="How much drawdown can you handle?"
              subtitle="Frames the Bear case severity and how aggressively the AI sizes its conviction."
              options={[
                { value: 'aggressive', label: 'Aggressive', sub: 'Can hold through 40%+ drops', emoji: '🦁' },
                { value: 'moderate', label: 'Moderate', sub: 'Comfortable with 15-25% dips', emoji: '😐' },
                { value: 'conservative', label: 'Conservative', sub: 'Prefer max 15% downside', emoji: '🛡️' },
              ]}
              selected={context.riskTolerance}
              onSelect={(v) => handleSelect('riskTolerance', v)}
            />
          )}

          {current === 'position' && (
            <QuestionBlock
              icon={<TrendingUp className="w-5 h-5 text-purple-400" />}
              question="What is your current position in this stock?"
              subtitle="Changes whether the AI focuses on entry timing vs thesis validation."
              options={[
                { value: 'fresh', label: 'No Position', sub: 'First look — finding entry', emoji: '🔍' },
                { value: 'holding', label: 'Already Holding', sub: 'Validating my thesis', emoji: '✅' },
                { value: 'averaging', label: 'Averaging Down', sub: 'Stock fell — should I add?', emoji: '📉' },
                { value: 'reentry', label: 'Re-entry Check', sub: 'Exited earlier, considering return', emoji: '🔄' },
              ]}
              selected={context.position}
              onSelect={(v) => handleSelect('position', v)}
            />
          )}

          {current === 'hypothesis' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-white font-semibold text-sm">Do you have a specific hypothesis?</p>
                  <p className="text-slate-500 text-xs">Optional. The AI will directly investigate and validate/refute your theory.</p>
                </div>
              </div>

              {userQuery && (
                <div className="mb-3 flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <Zap className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Using your search query as hypothesis</p>
                    <p className="text-blue-200 text-xs">{userQuery}</p>
                  </div>
                </div>
              )}

              <textarea
                value={hypothesis}
                onChange={e => setHypothesis(e.target.value)}
                placeholder={`e.g. "I think ${stockSymbol} will benefit from the AI infrastructure boom because their order book grew 3x this year..."`}
                className="w-full h-28 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 text-sm p-3 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-600"
                maxLength={400}
              />
              <p className="text-[10px] text-slate-600 text-right mt-1">{hypothesis.length}/400</p>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleFinish}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-900/30 text-sm"
                >
                  <Zap className="w-4 h-4" />
                  Start Personalized Analysis
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          <button
            onClick={onSkip}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            Skip & use defaults <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Reusable option card group
interface QuestionBlockProps {
  icon: React.ReactNode;
  question: string;
  subtitle: string;
  options: { value: string; label: string; sub: string; emoji: string }[];
  selected?: string;
  onSelect: (value: string) => void;
}

const QuestionBlock: React.FC<QuestionBlockProps> = ({ icon, question, subtitle, options, selected, onSelect }) => (
  <div>
    <div className="flex items-start gap-2 mb-4">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div>
        <p className="text-white font-semibold text-sm">{question}</p>
        <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>
      </div>
    </div>
    <div className="grid gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all group ${
            selected === opt.value
              ? 'bg-blue-600/20 border-blue-500/60 text-white'
              : 'bg-slate-950/50 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/50 text-slate-300'
          }`}
        >
          <span className="text-xl">{opt.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${selected === opt.value ? 'text-blue-300' : 'text-slate-200'}`}>{opt.label}</p>
            <p className="text-[11px] text-slate-500 truncate">{opt.sub}</p>
          </div>
          {selected === opt.value && (
            <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          )}
        </button>
      ))}
    </div>
  </div>
);

export default PreAnalysisModal;
