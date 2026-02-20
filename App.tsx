import React, { useState, useEffect } from 'react';
import { EngineId, EngineStatus, AnalysisSession } from './types';
import { ENGINE_CONFIGS, COMPARISON_PROMPT } from './constants';
import { runEngine, runCustomPrompt } from './services/geminiService';
import { saveSession, getSessions, deleteSession, saveUser, getUserData, updateUserPreferences, getCustomWatchlist, addToCustomWatchlist, removeFromCustomWatchlist } from './services/storageService';
import { auth, googleProvider } from './services/firebase';
import firebase from 'firebase/compat/app';
import EngineCard from './components/EngineCard';
import FinalReport from './components/FinalReport';
import AnalysisModal from './components/AnalysisModal';
import HistorySidebar from './components/HistorySidebar';
import { MiniChart } from "react-ts-tradingview-widgets";
import {
  FileText,
  RotateCw,
  Zap,
  ShieldCheck,
  Search,
  Terminal,
  Activity,
  Layers,
  BookOpen, BrainCircuit, AlertTriangle, ShieldAlert, LogIn, LogOut, User as UserIcon, Lock, History as HistoryIcon, Trash2, TrendingUp
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
  const [currentView, setCurrentView] = useState<'home' | 'history' | 'markets'>('home');
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // History State
  const [history, setHistory] = useState<AnalysisSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [customWatchlist, setCustomWatchlist] = useState<string[]>([]);
  const [newWatchlistSymbol, setNewWatchlistSymbol] = useState('');

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
    const watchlist = await getCustomWatchlist(userId);
    setCustomWatchlist(watchlist);
    setIsLoadingHistory(false);
  };

  const handleAddToWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWatchlistSymbol.trim()) return;
    const clean = newWatchlistSymbol.trim().toUpperCase();

    // Optimistic UI updates
    if (!customWatchlist.includes(clean)) {
      setCustomWatchlist(prev => [clean, ...prev]);
    }

    setNewWatchlistSymbol('');

    // Background sync
    const updated = await addToCustomWatchlist(user?.uid || null, clean);
    setCustomWatchlist(updated);
  };

  const handleRemoveFromWatchlist = async (symbol: string) => {
    // Optimistic UI updates
    setCustomWatchlist(prev => prev.filter(s => s !== symbol));

    // Background sync
    const updated = await removeFromCustomWatchlist(user?.uid || null, symbol);
    setCustomWatchlist(updated);
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
    setCurrentView('home');
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
            <div className="mb-4 md:mb-0 flex items-center gap-6">
              <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center gap-3">
                  <Activity className="text-blue-500" />
                  Vantage7
                </h1>
                <p className="text-slate-500 mt-2 font-mono text-sm">Indian Market Focus • Gemini 2.5/3.0 Powered</p>
              </div>

              {user && (
                <div className="hidden md:flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl ml-4 relative overflow-hidden">
                  <button
                    onClick={() => setCurrentView('home')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${currentView === 'home' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    Home
                  </button>
                  <button
                    onClick={() => setCurrentView('markets')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${currentView === 'markets' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    <TrendingUp className="w-4 h-4" /> Markets
                  </button>
                  <button
                    onClick={() => setCurrentView('history')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${currentView === 'history' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    <HistoryIcon className="w-4 h-4" /> History
                  </button>
                </div>
              )}
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

          <div className="max-w-6xl mx-auto mt-6">
            {currentView === 'history' ? (
              <div className="animate-fade-in-up">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                      <HistoryIcon className="w-6 h-6 text-blue-400" /> Analysis History
                    </h2>
                    <p className="text-slate-400 text-sm">Browse all your previously analyzed stocks.</p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search history by symbol..."
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-sm text-white rounded-lg pl-9 pr-4 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {history
                    .filter(s => s.symbol.toLowerCase().includes(historySearchQuery.toLowerCase()))
                    .map(session => {

                      const hasResult = !!session.engines.synthesizer?.result;
                      let verdictColor = 'border-slate-800';
                      let verdictText = 'Analysis Complete';
                      let verdictTextColor = 'text-slate-400';

                      if (hasResult) {
                        const verdictMatch = session.engines.synthesizer.result.match(/4\.\s*(?:\*\*)?Final\s*Verdict.*?(:|\*\*)?/i);
                        if (verdictMatch) {
                          const remainingText = session.engines.synthesizer.result.slice(verdictMatch.index);
                          if (remainingText.toLowerCase().includes('strong buy')) {
                            verdictColor = 'border-emerald-500/50';
                            verdictText = 'Strong Buy';
                            verdictTextColor = 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
                          }
                          else if (remainingText.toLowerCase().includes('buy')) {
                            verdictColor = 'border-green-500/50';
                            verdictText = 'Buy';
                            verdictTextColor = 'text-green-400 bg-green-500/10 border border-green-500/20';
                          }
                          else if (remainingText.toLowerCase().includes('sell')) {
                            verdictColor = 'border-red-500/50';
                            verdictText = 'Sell';
                            verdictTextColor = 'text-red-400 bg-red-500/10 border border-red-500/20';
                          }
                          else if (remainingText.toLowerCase().includes('hold')) {
                            verdictColor = 'border-yellow-500/50';
                            verdictText = 'Hold';
                            verdictTextColor = 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20';
                          }
                        }
                      }

                      return (
                        <div key={session.id} className={`bg-slate-900 rounded-xl p-5 border ${verdictColor} hover:border-slate-500 transition-colors flex justify-between items-start group`}>
                          <button onClick={() => handleLoadSession(session)} className="text-left flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-3 mb-1">
                              <div className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors truncate">{session.symbol}</div>
                              {hasResult && verdictText !== 'Analysis Complete' && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${verdictTextColor}`}>
                                  {verdictText}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono w-full truncate">
                              {new Date(session.timestamp).toLocaleString()}
                            </div>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
                            title="Delete locally"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                  {history.length === 0 && (
                    <div className="col-span-full text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
                      <HistoryIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400 font-medium">No history found</p>
                      <p className="text-slate-500 text-sm mt-1">Run an analysis to save it here automatically.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : currentView === 'markets' ? (
              <div className="animate-fade-in-up space-y-8">
                <div className="mb-2">
                  <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-emerald-400" /> Markets Hub
                  </h2>
                  <p className="text-slate-400 text-sm">Your monitored stocks and live global market news.</p>
                </div>

                {/* Custom Watchlist Section */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3 className="text-white font-bold flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-400" />
                      Live Custom Watchlist
                    </h3>

                    <form onSubmit={handleAddToWatchlist} className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={newWatchlistSymbol}
                          onChange={(e) => setNewWatchlistSymbol(e.target.value)}
                          placeholder="Add symbol (e.g. INFY)"
                          className="bg-slate-950 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-48 font-mono uppercase"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!newWatchlistSymbol.trim()}
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                      >
                        Add
                      </button>
                    </form>
                  </div>

                  {customWatchlist.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {customWatchlist.map(symbol => {
                        const cleanSym = symbol.replace('.NS', '').replace('.BO', '');
                        return (
                          <div key={symbol} className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative group flex flex-col justify-between">
                            <button
                              onClick={() => handleRemoveFromWatchlist(symbol)}
                              className="absolute top-2 right-2 z-10 p-1.5 bg-slate-900/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all border border-slate-700/50"
                              title="Remove from watchlist"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className="h-[220px] pointer-events-none">
                              <MiniChart
                                symbol={`BSE:${cleanSym}`}
                                colorTheme="dark"
                                width="100%"
                                height="100%"
                                isTransparent={true}
                                locale="in"
                                dateRange="1M"
                              />
                            </div>
                            <button
                              onClick={() => { setStockSymbol(cleanSym); setCurrentView('home'); document.querySelector('form')?.requestSubmit(); }}
                              className="w-full py-2.5 bg-slate-800 hover:bg-blue-600 text-white text-xs font-bold transition-colors border-t border-slate-700 flex items-center justify-center gap-2 flex-shrink-0"
                            >
                              <Layers className="w-3.5 h-3.5" /> Deep Analyze
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-12 bg-slate-950/50 rounded-xl border border-slate-800 border-dashed text-center">
                      <Activity className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                      <p className="text-slate-400 font-medium">No stocks in your custom watchlist</p>
                      <p className="text-slate-500 text-xs mt-1">Search or type a symbol above and hit Add</p>
                    </div>
                  )}
                </div>

                {/* AI Top Rated Watchlist Section */}
                {history.filter(s => {
                  if (!s.engines.synthesizer?.result) return false;
                  const text = s.engines.synthesizer.result.toLowerCase();
                  const match = text.match(/4\.\s*(?:\*\*)?final\s*verdict.*?(:|\*\*)?/i);
                  if (!match) return false;
                  const remaining = text.slice(match.index);
                  return remaining.includes('strong buy') || (remaining.includes('buy') && !remaining.includes('strong buy'));
                }).length > 0 && (
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
                      <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-400" />
                        AI Top Rated History
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {history.filter(s => {
                          if (!s.engines.synthesizer?.result) return false;
                          const text = s.engines.synthesizer.result.toLowerCase();
                          const match = text.match(/4\.\s*(?:\*\*)?final\s*verdict.*?(:|\*\*)?/i);
                          if (!match) return false;
                          const remaining = text.slice(match.index);
                          return remaining.includes('strong buy') || (remaining.includes('buy') && !remaining.includes('strong buy'));
                        }).slice(0, 6).map(session => {
                          const remaining = session.engines.synthesizer!.result!.toLowerCase().slice(session.engines.synthesizer!.result!.toLowerCase().match(/4\.\s*(?:\*\*)?final\s*verdict.*?(:|\*\*)?/i)!.index);
                          const isStrong = remaining.includes('strong buy');

                          const verdictColor = isStrong ? 'border-emerald-500/50' : 'border-green-500/50';
                          const verdictText = isStrong ? 'Strong Buy' : 'Buy';
                          const verdictTextColor = isStrong ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-green-400 bg-green-500/10 border border-green-500/20';

                          return (
                            <button key={session.id} onClick={() => { setCurrentView('home'); handleLoadSession(session); }} className={`bg-slate-950 rounded-xl p-4 border ${verdictColor} hover:border-slate-500 transition-colors flex flex-col items-start gap-2 group text-left shadow-lg`}>
                              <div className="flex w-full justify-between items-center gap-2">
                                <div className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors truncate">{session.symbol}</div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${verdictTextColor}`}>
                                  {verdictText}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 font-mono">
                                {new Date(session.timestamp).toLocaleDateString()}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="lg:col-span-12 space-y-8">
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

                {/* Empty State Hero (Only on Home View) */}
                {currentView === 'home' && !isAnalyzing && !engines.synthesizer.result && (
                  <div className="space-y-8 animate-fade-in-up">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:shadow-xl transition-all">
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

                      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:shadow-xl transition-all">
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
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono rounded-lg transition-colors border border-slate-700 shadow-sm"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
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
                    <FinalReport synthesizer={engines.synthesizer} totalTokens={calculateTotalTokens()} modelUsed={geminiModel} stockSymbol={stockSymbol} />
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
            )}
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