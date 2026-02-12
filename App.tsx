import React, { useState, useEffect } from 'react';
import { EngineId, EngineStatus, AnalysisSession } from './types';
import { ENGINE_CONFIGS, COMPARISON_PROMPT } from './constants';
import { runEngine, runCustomPrompt } from './services/geminiService';
import { saveSession, getSessions, deleteSession, saveUser, getUserData, updateUserPreferences } from './services/storageService';
import { auth, googleProvider } from './services/firebase';
import firebase from 'firebase/compat/app';
import EngineCard from './components/EngineCard';
import FinalReport from './components/FinalReport';
import AnalysisModal from './components/AnalysisModal';
import HistorySidebar from './components/HistorySidebar';
import {
  FileText,
  RotateCw,
  Zap,
  ShieldCheck,
  Search,
  Terminal,
  Activity,
  Layers,
  BookOpen, BrainCircuit, AlertTriangle, ShieldAlert, LogIn, LogOut, User as UserIcon, Lock
} from 'lucide-react';

// Initial state builder
const buildInitialState = (): Record<EngineId, EngineStatus> => {
  const state = {} as Record<EngineId, EngineStatus>;
  (Object.keys(ENGINE_CONFIGS) as EngineId[]).forEach((id) => {
    state[id] = {
      id,
      name: ENGINE_CONFIGS[id].name,
      role: ENGINE_CONFIGS[id].role,
      status: 'idle',
      result: null,
    };
  });
  return state;
};

const App: React.FC = () => {
  const [user, setUser] = useState<firebase.User | null>(null);
  const [stockSymbol, setStockSymbol] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [engines, setEngines] = useState<Record<EngineId, EngineStatus>>(buildInitialState());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [onlyNewInfo, setOnlyNewInfo] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<EngineStatus | null>(null);
  const [scanMode, setScanMode] = useState<'quick' | 'deep'>('quick');
  const [geminiModel, setGeminiModel] = useState<string>('gemini-2.5-flash');

  // History State
  const [history, setHistory] = useState<AnalysisSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Auth Listener (Compat SDK)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      // If we are currently in demo mode, ignore standard auth updates unless a real user logs in
      if (user?.uid === 'demo-mode-user' && !currentUser) {
        return;
      }

      setUser(currentUser);
      if (currentUser) {
        // Sync User Data & Load Preferences
        await saveUser(currentUser);
        const userData = await getUserData(currentUser.uid);
        if (userData && userData.preferences) {
          setOnlyNewInfo(userData.preferences.defaultIncrementalMode);
        }

        loadHistory(currentUser.uid);
      } else {
        // Load local history if not logged in
        loadHistory(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadHistory = async (userId: string | null) => {
    setIsLoadingHistory(true);
    const sessions = await getSessions(userId);
    setHistory(sessions);
    setIsLoadingHistory(false);
  };

  const handleLogin = async () => {
    setGlobalError(null);
    try {
      await auth.signInWithPopup(googleProvider);
    } catch (error: any) {
      console.error("Login failed", error);

      // Fallback for Preview/Dev environments where Firebase Auth fails
      // This allows the app to function in "Demo Mode" so you are not locked out
      if (error?.code === 'auth/operation-not-supported-in-this-environment' ||
        error?.code === 'auth/unauthorized-domain' ||
        error?.message?.includes('protocol')) {

        const demoUser = {
          uid: 'demo-mode-user',
          displayName: 'Guest Trader',
          email: 'guest@example.com',
          photoURL: null,
          emailVerified: true,
          isAnonymous: true,
          metadata: {},
          providerData: [],
        } as unknown as firebase.User;

        setUser(demoUser);
        setGlobalError("Authentication Unavailable: Switched to Offline Guest Mode. History will be saved locally.");
        loadHistory(null); // Force local storage usage
        return;
      }

      let errorMessage = "Login failed. Please try again.";
      if (error?.code === 'auth/popup-closed-by-user') {
        errorMessage = "Login cancelled by user.";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      setGlobalError(errorMessage);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    setUser(null);
    setEngines(buildInitialState());
    setStockSymbol('');
    setCurrentSessionId(undefined);
    loadHistory(null);
  };

  const updateEngineStatus = (
    id: EngineId,
    status: EngineStatus['status'],
    result: string | null = null,
    error?: string,
    usage?: any,
    sources?: any
  ) => {
    setEngines((prev) => {
      const newState = {
        ...prev,
        [id]: { ...prev[id], status, result, error, usage, sources },
      };
      return newState;
    });
  };

  const calculateTotalTokens = () => {
    return Object.values(engines).reduce((acc, engine) => acc + (engine.usage?.totalTokenCount || 0), 0);
  };

  const handleLoadSession = (session: AnalysisSession) => {
    setStockSymbol(session.symbol);
    // Merge loaded engines with initial state to ensure new engines (like linkedin) exist
    const mergedEngines = { ...buildInitialState(), ...session.engines };
    setEngines(mergedEngines);
    setCurrentSessionId(session.id);
    setGlobalError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSession = async (id: string) => {
    const originalHistory = [...history];

    // Optimistic update
    setHistory(prev => prev.filter(s => s.id !== id));

    try {
      await deleteSession(user?.uid || null, id);
      if (currentSessionId === id) {
        setCurrentSessionId(undefined);
        setEngines(buildInitialState());
        setStockSymbol('');
      }
    } catch (e) {
      setHistory(originalHistory); // Revert on fail
      setGlobalError("Failed to delete session.");
    }
  };

  const handleUpdateReport = async () => {
    if (!currentSessionId || isUpdating) return;
    if (!user) {
      setGlobalError("Please login to update reports.");
      return;
    }

    setIsUpdating(true);
    setGlobalError(null);

    try {
      const oldReportDate = new Date(engines.synthesizer.usage ? history.find(h => h.id === currentSessionId)?.timestamp || Date.now() : Date.now()).toLocaleDateString();
      const previousSummary = engines.synthesizer.result;

      const scopeInstruction = onlyNewInfo
        ? `STRICT CONSTRAINT: You are in 'Incremental Mode'. Search for and report ONLY on events, news, and filings released AFTER ${oldReportDate}. Do NOT re-analyze old data.`
        : `BROAD SCOPE: Re-evaluate the company's status. While searching for news since ${oldReportDate}, you may also verify if the core thesis still holds against broader market changes found in recent search results.`;

      updateEngineStatus('updater', 'loading');
      const updatePrompt = `LAST ANALYSIS DATE: ${oldReportDate}\nPREVIOUS SUMMARY:\n${previousSummary}\n\nINSTRUCTION: ${scopeInstruction}`;

      const updaterRes = await runEngine('updater', stockSymbol, undefined, updatePrompt, geminiModel);
      updateEngineStatus('updater', 'success', updaterRes.text, undefined, updaterRes.usage, updaterRes.sources);

      updateEngineStatus('synthesizer', 'loading');
      const synthesisContext = `
         --- PREVIOUS REPORT (${oldReportDate}) ---
         ${previousSummary}
         
         --- UPDATER ENGINE FINDINGS (Mode: ${onlyNewInfo ? 'Incremental' : 'Full Scan'}) ---
         ${updaterRes.text}
       `;

      const finalRes = await runEngine('synthesizer', stockSymbol, undefined, synthesisContext, geminiModel);
      updateEngineStatus('synthesizer', 'success', finalRes.text, undefined, finalRes.usage, finalRes.sources);

      // Save Updated Session — compute final state then persist outside setter
      const finalEngines = {
        ...engines,
        updater: { ...engines.updater, status: 'success' as const, result: updaterRes.text, usage: updaterRes.usage, sources: updaterRes.sources },
        synthesizer: { ...engines.synthesizer, status: 'success' as const, result: finalRes.text, usage: finalRes.usage, sources: finalRes.sources }
      };
      setEngines(finalEngines);

      const updatedSession = await saveSession(user.uid, stockSymbol, finalEngines, currentSessionId);
      if (updatedSession) {
        setHistory(prev => {
          const idx = prev.findIndex(s => s.symbol === updatedSession.symbol);
          if (idx >= 0) {
            const newHist = [...prev];
            newHist[idx] = updatedSession;
            return newHist;
          }
          return [updatedSession, ...prev];
        });
      }

    } catch (e) {
      console.error(e);
      setGlobalError("Failed to update report: " + (e as Error).message);
      updateEngineStatus('updater', 'error', null, (e as Error).message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setGlobalError("Authentication required. Please log in to start the analysis.");
      handleLogin();
      return;
    }

    if (!stockSymbol.trim()) return;

    setIsAnalyzing(true);
    setGlobalError(null);
    setCurrentSessionId(undefined);
    setEngines(buildInitialState());

    try {
      // --- Comparison Mode Detection ---
      const vsMatch = stockSymbol.match(/^(.+?)\s+vs\.?\s+(.+)$/i);

      if (vsMatch && scanMode === 'quick') {
        const stockA = vsMatch[1].trim().toUpperCase();
        const stockB = vsMatch[2].trim().toUpperCase();

        // Step 1: Analyze Stock A
        updateEngineStatus('planner', 'loading');
        const resA = await runEngine('comprehensive', stockA, undefined, undefined, geminiModel);
        updateEngineStatus('planner', 'success', `Analysis of ${stockA} complete`, undefined, resA.usage, resA.sources);

        // 15s delay for rate limiting
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Step 2: Analyze Stock B
        updateEngineStatus('librarian', 'loading');
        const resB = await runEngine('comprehensive', stockB, undefined, undefined, geminiModel);
        updateEngineStatus('librarian', 'success', `Analysis of ${stockB} complete`, undefined, resB.usage, resB.sources);

        // 15s delay
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Step 3: Run Comparison
        updateEngineStatus('synthesizer', 'loading');
        const comparisonContext = `${COMPARISON_PROMPT}\n\n--- STOCK A: ${stockA} ---\n${resA.text}\n\n--- STOCK B: ${stockB} ---\n${resB.text}`;
        const compResult = await runCustomPrompt(comparisonContext, geminiModel);

        updateEngineStatus('comprehensive', 'success', `${stockA} vs ${stockB} Head-to-Head`, undefined, compResult.usage, compResult.sources);
        updateEngineStatus('synthesizer', 'success', compResult.text, undefined, compResult.usage, compResult.sources);

        const finalEngines = {
          ...engines,
          planner: { ...engines.planner, status: 'success' as const, result: `Analysis of ${stockA} complete` },
          librarian: { ...engines.librarian, status: 'success' as const, result: `Analysis of ${stockB} complete` },
          comprehensive: { ...engines.comprehensive, status: 'success' as const, result: `${stockA} vs ${stockB} Head-to-Head`, usage: compResult.usage, sources: compResult.sources },
          synthesizer: { ...engines.synthesizer, status: 'success' as const, result: compResult.text, usage: compResult.usage, sources: compResult.sources }
        };
        setEngines(finalEngines);

        const newSession = await saveSession(user.uid, `${stockA} vs ${stockB}`, finalEngines, currentSessionId);
        if (newSession) {
          setHistory(prev => {
            const filtered = prev.filter(s => s.id !== newSession.id && s.symbol !== newSession.symbol);
            return [newSession, ...filtered];
          });
          setCurrentSessionId(newSession.id);
        }

      } else if (scanMode === 'quick') {
        // SINGLE-SHOT MODE (Super-Prompt)
        // Solves Rate Limit (15 RPM) and Quota (20 RPD) issues permanently.
        updateEngineStatus('comprehensive', 'loading');

        const result = await runEngine('comprehensive', stockSymbol, userQuery, undefined, geminiModel);

        updateEngineStatus('comprehensive', 'success', result.text, undefined, result.usage, result.sources);

        // Utilize result for both comprehensive and synthesizer slots for UI consistency
        updateEngineStatus('synthesizer', 'success', result.text, undefined, result.usage, result.sources);

        // Build final state and save outside setEngines to avoid side-effects in state setter
        const finalEngines = {
          ...engines,
          comprehensive: { ...engines.comprehensive, status: 'success' as const, result: result.text, usage: result.usage, sources: result.sources },
          synthesizer: { ...engines.synthesizer, status: 'success' as const, result: result.text, usage: result.usage, sources: result.sources }
        };
        setEngines(finalEngines);

        // Auto-save
        const newSession = await saveSession(user.uid, stockSymbol, finalEngines, currentSessionId);
        if (newSession) {
          setHistory(prev => {
            // Deduplicate by both ID and symbol
            const filtered = prev.filter(s => s.id !== newSession.id && s.symbol !== newSession.symbol);
            return [newSession, ...filtered];
          });
          setCurrentSessionId(newSession.id);
        }

      } else {
        // DEEP DIVE MODE (Multi-Agent Loop)
        // Heavy Quota Usage (~12 Requests). Use sparingly (1 Stock/Day).

        // 1. Planner
        updateEngineStatus('planner', 'loading');
        const plannerRes = await runEngine('planner', stockSymbol, undefined, undefined, geminiModel);
        updateEngineStatus('planner', 'success', plannerRes.text, undefined, plannerRes.usage, plannerRes.sources);
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15s Delay for 5 RPM cap

        // 2. Librarian (Search)
        updateEngineStatus('librarian', 'loading');
        const librarianRes = await runEngine('librarian', stockSymbol, undefined, `PLANNER STRATEGY:\n${plannerRes.text}`, geminiModel);
        updateEngineStatus('librarian', 'success', librarianRes.text, undefined, librarianRes.usage, librarianRes.sources);
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15s Delay

        const sharedContext = `PLANNER STRATEGY:\n${plannerRes.text}\n\nLIBRARIAN DATA DOSSIER:\n${librarianRes.text}`;

        // 3. Specialists Loop
        const workerIds: EngineId[] = ['business', 'quant', 'forensic', 'valuation', 'technical', 'custom'];
        const workerResults: { id: EngineId; result: string }[] = [];

        for (const id of workerIds) {
          updateEngineStatus(id, 'loading');
          try {
            const query = id === 'custom' ? userQuery : undefined;
            const result = await runEngine(id, stockSymbol, query, sharedContext, geminiModel);
            updateEngineStatus(id, 'success', result.text, undefined, result.usage, result.sources);
            workerResults.push({ id, result: result.text });
          } catch (err) {
            updateEngineStatus(id, 'error', null, (err as Error).message);
            workerResults.push({ id, result: `[Analysis Failed: ${(err as Error).message}]` });
          }
          await new Promise(resolve => setTimeout(resolve, 15000)); // 15s Delay per specialist
        }

        // 4. Synthesizer
        const synthesisContext = workerResults
          .filter(r => !r.result.includes('[Analysis Failed'))
          .map(r => `--- REPORT FROM ${ENGINE_CONFIGS[r.id].name} ---\n${r.result}\n`)
          .join('\n');

        updateEngineStatus('synthesizer', 'loading');
        const finalRes = await runEngine('synthesizer', stockSymbol, undefined, synthesisContext, geminiModel);
        updateEngineStatus('synthesizer', 'success', finalRes.text, undefined, finalRes.usage, finalRes.sources);

        // Save — build final state and persist outside setEngines
        const finalEngines = { ...engines };
        finalEngines.synthesizer = { ...engines.synthesizer, status: 'success' as const, result: finalRes.text, usage: finalRes.usage, sources: finalRes.sources };
        setEngines(finalEngines);

        const newSession = await saveSession(user.uid, stockSymbol, finalEngines, currentSessionId);
        if (newSession) {
          setHistory(prev => {
            // Deduplicate by both ID and symbol
            const filtered = prev.filter(s => s.id !== newSession.id && s.symbol !== newSession.symbol);
            return [newSession, ...filtered];
          });
          setCurrentSessionId(newSession.id);
        }
      }

    } catch (error) {
      console.error("Workflow failed", error);
      setGlobalError((error as Error).message);
      updateEngineStatus('comprehensive', 'error', null, (error as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClearSession = () => {
    setCurrentSessionId(undefined);
    setEngines(buildInitialState());
    setStockSymbol('');
    setGlobalError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLinkedInGen = async () => {
    if (!engines.synthesizer.result) return;

    try {
      updateEngineStatus('linkedin', 'loading');
      const linkedInRes = await runEngine('linkedin', stockSymbol, undefined, engines.synthesizer.result, geminiModel);
      updateEngineStatus('linkedin', 'success', linkedInRes.text, undefined, linkedInRes.usage, linkedInRes.sources);
    } catch (e) {
      updateEngineStatus('linkedin', 'error', null, (e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col">
      <div className="flex-grow p-4 md:p-8 pb-20">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6">
            <div className="mb-4 md:mb-0">
              <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center gap-3">
                <Activity className="text-blue-500" />
                Vantage7
              </h1>
              <p className="text-slate-500 mt-2 font-mono text-sm">Indian Market Focus • Gemini 2.5/3.0 Powered</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Auth & Status Section */}
              <div className="flex items-center space-x-2 bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
                <div className={`w-2 h-2 rounded-full ${isAnalyzing || isUpdating ? 'bg-yellow-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                <span className="text-xs text-slate-400 font-mono">{isAnalyzing || isUpdating ? 'AGENTS ACTIVE' : 'SYSTEM READY'}</span>
              </div>

              {user ? (
                <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
                  <div className="flex items-center gap-2">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-slate-700" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="hidden sm:block">
                      <p className="text-xs text-white font-medium truncate max-w-[100px]">{user.displayName}</p>
                      <p className="text-[10px] text-slate-500">
                        {user.uid === 'demo-mode-user' ? 'Guest Access' : 'Pro Plan'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-900/20"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
              )}
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Main Content Area */}
            <div className="lg:col-span-9 space-y-8">
              {/* Input Section */}
              <section>
                <form onSubmit={handleAnalyze} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10">
                    <div className="md:col-span-4">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Indian Stock Symbol</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-3.5 text-slate-500 w-5 h-5" />
                        <input
                          type="text"
                          value={stockSymbol}
                          onChange={(e) => setStockSymbol(e.target.value)}
                          placeholder="e.g. RELIANCE or HDFCBANK vs ICICIBANK"
                          className="w-full bg-slate-950 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono uppercase"
                          disabled={isAnalyzing || isUpdating}
                        />
                      </div>
                      {stockSymbol.toLowerCase().includes(' vs ') && (
                        <p className="text-[10px] text-emerald-400 mt-1 font-mono flex items-center gap-1">
                          ⚔️ Comparison Mode — will analyze both stocks and pick a winner (3 credits)
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-6">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Specific Hypothesis</label>
                      <div className="relative">
                        <Terminal className="absolute left-3 top-3.5 text-slate-500 w-5 h-5" />
                        <input
                          type="text"
                          value={userQuery}
                          onChange={(e) => setUserQuery(e.target.value)}
                          placeholder="e.g. Impact of new PLI scheme..."
                          className="w-full bg-slate-950 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                          disabled={isAnalyzing || isUpdating}
                        />
                      </div>
                    </div>

                    <div className="md:col-span-12 flex flex-col md:flex-row items-center justify-between gap-4 mt-2">
                      {/* Mode Toggle */}
                      <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                        <div className="flex items-center bg-slate-800/80 rounded-xl p-1.5 border border-slate-700 flex-1 md:flex-none">
                          <button
                            type="button"
                            onClick={() => setScanMode('quick')}
                            disabled={isAnalyzing}
                            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${scanMode === 'quick' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                          >
                            ⚡ Quick Scan
                          </button>
                          <button
                            type="button"
                            onClick={() => setScanMode('deep')}
                            disabled={isAnalyzing}
                            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${scanMode === 'deep' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                            title="Comprehensive Multi-Agent Analysis (Uses 12 Credits)"
                          >
                            🕵️ Deep Dive
                          </button>
                        </div>

                        {/* Model Toggle */}
                        <div className="flex items-center bg-slate-800/80 rounded-xl p-1.5 border border-slate-700 flex-1 md:flex-none">
                          <button
                            type="button"
                            onClick={() => setGeminiModel('gemini-2.5-flash')}
                            disabled={isAnalyzing}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${geminiModel === 'gemini-2.5-flash' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                          >
                            2.5 Flash
                          </button>
                          <button
                            type="button"
                            onClick={() => setGeminiModel('gemini-3-flash-preview')}
                            disabled={isAnalyzing}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${geminiModel === 'gemini-3-flash-preview' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                            title="Latest model — superior search & grounding (limited quota)"
                          >
                            3 Flash ✨
                          </button>
                        </div>
                      </div>

                      <div className="w-full md:w-auto">
                        {user ? (
                          <button
                            type="submit"
                            disabled={isAnalyzing || isUpdating || !stockSymbol}
                            className={`w-full md:w-auto min-w-[120px] bg-gradient-to-r ${scanMode === 'quick' ? 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500' : 'from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'} text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {isAnalyzing ? <Layers className="animate-bounce" /> : <Activity />}
                            {isAnalyzing ? 'Analyzing...' : 'Start Analysis'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleLogin}
                            className="w-full md:w-auto bg-slate-800 hover:bg-slate-700 text-blue-400 font-bold py-3 px-8 rounded-xl transition-all shadow-lg border border-slate-700 flex items-center justify-center gap-2"
                          >
                            <Lock className="w-4 h-4" />
                            Login to Start
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              </section>

              {/* Empty State Hero */}
              {!isAnalyzing && !engines.synthesizer.result && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
                  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative z-10">
                      <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-blue-400" />
                        Institutional Grade
                      </h3>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        Generates a comprehensive investment memo covering <strong>Business, Financials, Governance, and Valuation</strong> in under 60 seconds.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative z-10">
                      <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-purple-400" />
                        Double Check
                      </h3>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        Uses <strong>Google Search Grounding</strong> to verify latest quarterly results, promoter pledging, and management commentary.
                      </p>
                    </div>
                  </div>

                  <div className="md:col-span-2 bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-white font-bold text-sm mb-1">New: Comparison Mode ⚔️</h4>
                      <p className="text-slate-500 text-xs">Try typing <code className="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300">HDFCBANK vs ICICIBANK</code> to see a head-to-head winner.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {['RELIANCE', 'TATAELXSI', 'ZOMATO', 'HDFCBANK'].map(s => (
                        <button
                          key={s}
                          onClick={() => { setStockSymbol(s); document.querySelector('form')?.requestSubmit(); }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono rounded-lg transition-colors border border-slate-700"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {/* Error Message */}
              {globalError && (
                <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-400">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-mono">{globalError}</p>
                </div>
              )}

              {/* Quick Scan Progress Indicator */}
              {isAnalyzing && scanMode === 'quick' && engines.synthesizer.status !== 'success' && (() => {
                const isComparison = stockSymbol.toLowerCase().includes(' vs ');
                const steps = isComparison
                  ? [
                    { label: `Analyzing ${stockSymbol.split(/\s+vs\.?\s+/i)[0]?.trim().toUpperCase()}...`, done: engines.planner.status === 'success' },
                    { label: `Analyzing ${stockSymbol.split(/\s+vs\.?\s+/i)[1]?.trim().toUpperCase()}...`, done: engines.librarian.status === 'success' },
                    { label: 'Head-to-head comparison...', done: (engines.synthesizer.status as string) === 'success' },
                  ]
                  : [
                    { label: 'Researching company fundamentals...', done: false },
                    { label: 'Analyzing financial data & ratios...', done: false },
                    { label: 'Checking governance & red flags...', done: false },
                    { label: 'Computing valuation & technicals...', done: false },
                    { label: 'Generating investment memo...', done: false },
                  ];

                const completedSteps = steps.filter(s => s.done).length;
                const activeIdx = isComparison ? completedSteps : 0;
                const modelLabel = geminiModel.includes('3-flash') ? 'Gemini 3 Flash ✨' : 'Gemini 2.5 Flash';

                return (
                  <div className="p-6 bg-slate-900 border border-blue-500/20 rounded-2xl shadow-2xl animate-fade-in-up relative overflow-hidden">
                    {/* Shimmer overlay */}
                    <div className="absolute inset-0 animate-shimmer pointer-events-none" />

                    <div className="flex items-center gap-3 mb-5 relative z-10">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full border-2 border-blue-500/60 border-t-blue-400 animate-spin" />
                        <BrainCircuit className="w-5 h-5 text-blue-400 absolute inset-0 m-auto animate-glow" />
                      </div>
                      <div>
                        <h3 className="text-white font-bold">
                          {isComparison ? '⚔️ Comparison Mode' : 'Deep Analysis in Progress'}
                        </h3>
                        <p className="text-slate-500 text-xs font-mono">{modelLabel} • Google Search Grounded</p>
                      </div>
                    </div>

                    <div className="space-y-2.5 relative z-10">
                      {steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-500 ${step.done ? 'bg-emerald-400 scale-110' :
                            i === activeIdx ? 'bg-blue-400 animate-pulse scale-110' :
                              'bg-slate-700'
                            }`} />
                          <span className={`text-xs font-mono transition-colors duration-300 ${step.done ? 'text-emerald-400' :
                            i === activeIdx ? 'text-blue-300' :
                              'text-slate-600'
                            }`}>
                            {step.done ? '✓ ' : ''}{step.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative z-10">
                      {isComparison ? (
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${Math.max(5, (completedSteps / steps.length) * 100)}%` }}
                        />
                      ) : (
                        <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-progress" />
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Synthesis Result */}
              {engines.synthesizer.status === 'success' && (
                <div className="animate-fade-in-up relative">
                  {currentSessionId && user && (
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-4">
                      {/* Close / New Analysis Button */}
                      <button
                        onClick={handleClearSession}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 transition-all flex items-center gap-2"
                        title="Close and Start New Analysis"
                      >
                        x Close
                      </button>

                      <button
                        onClick={handleLinkedInGen}
                        disabled={engines.linkedin.status === 'loading'}
                        className="bg-[#0077b5] hover:bg-[#006396] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {engines.linkedin.status === 'loading' ? 'Writing...' : 'Post to LinkedIn'}
                      </button>

                      {/* Incremental Toggle */}
                      <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-700/50">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={onlyNewInfo}
                            onChange={() => {
                              const newValue = !onlyNewInfo;
                              setOnlyNewInfo(newValue);
                              if (user) {
                                updateUserPreferences(user.uid, { defaultIncrementalMode: newValue });
                              }
                            }}
                            disabled={isUpdating}
                          />
                          <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                          <span className="ml-2 text-xs font-mono text-slate-300">
                            {onlyNewInfo ? 'Incremental' : 'Deep Scan'}
                          </span>
                        </label>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Mode Toggle */}
                        <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                          <button
                            type="button"
                            onClick={() => setScanMode('quick')}
                            disabled={isAnalyzing}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${scanMode === 'quick' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                          >
                            ⚡ Quick Scan (1 Credit)
                          </button>
                          <button
                            type="button"
                            onClick={() => setScanMode('deep')}
                            disabled={isAnalyzing}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${scanMode === 'deep' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                          >
                            🕵️ Deep Dive (12 Credits)
                          </button>
                        </div>

                        <button
                          onClick={handleUpdateReport}
                          disabled={isUpdating}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RotateCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                          {isUpdating ? 'Checking...' : 'Update'}
                        </button>
                      </div>
                    </div>
                  )}
                  <FinalReport synthesizer={engines.synthesizer} totalTokens={calculateTotalTokens()} modelUsed={geminiModel} />
                </div>
              )}

              {/* Status Bar */}
              {(engines.planner.status === 'loading' || engines.librarian.status === 'loading' || engines.updater.status === 'loading') && (
                <div className="p-4 bg-slate-900/50 border border-blue-500/30 rounded-xl flex items-center justify-center space-x-4 animate-pulse">
                  <BookOpen className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-blue-300 font-mono">
                    {engines.updater.status === 'loading'
                      ? `Monitoring Portfolio: ${onlyNewInfo ? 'Scanning strictly for new events...' : 'Performing deep re-evaluation...'}`
                      : engines.planner.status === 'loading'
                        ? 'Planning Research Strategy...'
                        : 'Librarian Gathering Master Data...'}
                  </span>
                </div>
              )}

              {/* Grid of Agents */}
              <h3 className="text-lg font-bold text-slate-400 mb-4 flex items-center gap-2">
                <BrainCircuit className="w-5 h-5" /> Active Agents
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <EngineCard engine={engines.planner} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.librarian} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.business} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.quant} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.forensic} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.valuation} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.technical} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.updater} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.linkedin} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.custom} onViewDetails={setSelectedEngine} />
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-3 space-y-4">
              {isLoadingHistory ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-4 h-4 bg-slate-800 rounded animate-pulse" />
                    <div className="w-28 h-3 bg-slate-800 rounded animate-pulse" />
                  </div>
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="p-3 rounded-lg border border-slate-800 bg-slate-950">
                        <div className="flex justify-between mb-2">
                          <div className="w-20 h-5 bg-slate-800 rounded animate-pulse" />
                          <div className="w-6 h-4 bg-slate-800 rounded animate-pulse" />
                        </div>
                        <div className="w-24 h-3 bg-slate-800/50 rounded animate-pulse mb-2" />
                        <div className="w-16 h-3 bg-slate-800/50 rounded animate-pulse mb-2" />
                        <div className="space-y-1">
                          <div className="w-full h-2 bg-slate-800/30 rounded animate-pulse" />
                          <div className="w-3/4 h-2 bg-slate-800/30 rounded animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <HistorySidebar
                  sessions={history}
                  onSelectSession={handleLoadSession}
                  onDeleteSession={handleDeleteSession}
                  currentSessionId={currentSessionId}
                />
              )
              }

              {!user && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
                  <LogIn className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-slate-300 font-bold mb-2">Sync Your Analysis</h3>
                  <p className="text-slate-500 text-xs mb-4">Login to back up your research and access it from any device.</p>
                  <button onClick={handleLogin} className="text-blue-400 text-xs hover:text-white hover:underline">
                    Login with Google
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        <AnalysisModal engine={selectedEngine} onClose={() => setSelectedEngine(null)} />
      </div>

      <footer className="border-t border-slate-900 bg-slate-950 py-8 px-4 mt-12">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 text-yellow-600 mb-2">
            <ShieldAlert className="w-5 h-5" />
            <h4 className="text-sm font-bold uppercase tracking-wider">Regulatory Disclaimer</h4>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
            This application is an AI-powered simulation. Not SEBI registered. Consult a financial advisor.
          </p>
        </div>
      </footer>
    </div >
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-white bg-slate-900 min-h-screen">
          <h1 className="text-2xl text-red-500 mb-4">Something went wrong.</h1>
          <pre className="bg-black p-4 rounded text-sm overflow-auto text-red-300">
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}