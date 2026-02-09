import React, { useState, useEffect } from 'react';
import { EngineId, EngineStatus, AnalysisSession } from './types';
import { ENGINE_CONFIGS } from './constants';
import { runEngine } from './services/geminiService';
import { saveSession, getSessions, deleteSession, saveUser, getUserData, updateUserPreferences } from './services/storageService';
import { auth, googleProvider } from './services/firebase';
import firebase from 'firebase/compat/app';
import EngineCard from './components/EngineCard';
import FinalReport from './components/FinalReport';
import AnalysisModal from './components/AnalysisModal';
import HistorySidebar from './components/HistorySidebar';
import { Search, Activity, Layers, Terminal, BookOpen, BrainCircuit, AlertTriangle, RotateCw, ShieldAlert, LogIn, LogOut, User as UserIcon, Lock } from 'lucide-react';

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
    setEngines(session.engines);
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

      const updaterRes = await runEngine('updater', stockSymbol, undefined, updatePrompt);
      updateEngineStatus('updater', 'success', updaterRes.text, undefined, updaterRes.usage, updaterRes.sources);

      updateEngineStatus('synthesizer', 'loading');
      const synthesisContext = `
         --- PREVIOUS REPORT (${oldReportDate}) ---
         ${previousSummary}
         
         --- UPDATER ENGINE FINDINGS (Mode: ${onlyNewInfo ? 'Incremental' : 'Full Scan'}) ---
         ${updaterRes.text}
       `;

      const finalRes = await runEngine('synthesizer', stockSymbol, undefined, synthesisContext);
      updateEngineStatus('synthesizer', 'success', finalRes.text, undefined, finalRes.usage, finalRes.sources);

      // Save Updated Session
      setEngines(prev => {
        const finalEngines = {
          ...prev,
          updater: { ...prev.updater, status: 'success' as const, result: updaterRes.text, usage: updaterRes.usage, sources: updaterRes.sources },
          synthesizer: { ...prev.synthesizer, status: 'success' as const, result: finalRes.text, usage: finalRes.usage, sources: finalRes.sources }
        };

        saveSession(user.uid, stockSymbol, finalEngines).then(updatedSession => {
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
        });
        return finalEngines;
      });

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
      updateEngineStatus('planner', 'loading');
      let plannerRes;
      try {
        plannerRes = await runEngine('planner', stockSymbol);
        updateEngineStatus('planner', 'success', plannerRes.text, undefined, plannerRes.usage, plannerRes.sources);
      } catch (err) {
        updateEngineStatus('planner', 'error', null, (err as Error).message);
        throw new Error("Planning Phase Failed. Cannot proceed.");
      }

      updateEngineStatus('librarian', 'loading');
      let librarianRes;
      try {
        librarianRes = await runEngine('librarian', stockSymbol, undefined, `PLANNER STRATEGY:\n${plannerRes.text}`);
        updateEngineStatus('librarian', 'success', librarianRes.text, undefined, librarianRes.usage, librarianRes.sources);
      } catch (err) {
        updateEngineStatus('librarian', 'error', null, (err as Error).message);
        throw new Error("Librarian failed to acquire data. Analysis aborted.");
      }

      const sharedContext = librarianRes.text;

      const workerIds: EngineId[] = ['business', 'quant', 'forensic', 'valuation', 'technical', 'custom'];
      workerIds.forEach(id => updateEngineStatus(id, 'loading'));

      const promises = workerIds.map(async (id) => {
        try {
          const query = id === 'custom' ? userQuery : undefined;
          const result = await runEngine(id, stockSymbol, query, sharedContext);
          updateEngineStatus(id, 'success', result.text, undefined, result.usage, result.sources);
          return { id, result: result.text };
        } catch (err) {
          updateEngineStatus(id, 'error', null, (err as Error).message);
          return { id, result: `[Analysis Failed: ${(err as Error).message}]` };
        }
      });

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled' && !r.value.result.includes('[Analysis Failed')).length;
      if (successCount < 3) throw new Error("Too many specialists failed. Synthesis aborted.");

      const synthesisContext = results
        .filter(r => r.status === 'fulfilled')
        // @ts-ignore
        .map(r => `--- REPORT FROM ${ENGINE_CONFIGS[r.value.id].name} ---\n${r.value.result}\n`)
        .join('\n');

      updateEngineStatus('synthesizer', 'loading');
      const finalRes = await runEngine('synthesizer', stockSymbol, undefined, synthesisContext);
      updateEngineStatus('synthesizer', 'success', finalRes.text, undefined, finalRes.usage, finalRes.sources);

      setEngines(prev => {
        const finalEngines = {
          ...prev,
          synthesizer: { ...prev.synthesizer, status: 'success' as const, result: finalRes.text, usage: finalRes.usage, sources: finalRes.sources }
        };

        // Auto-save to either Firestore (if logged in) or LocalStorage (if not/demo)
        saveSession(user.uid, stockSymbol, finalEngines).then(newSession => {
          if (newSession) {
            setHistory(prev => [newSession, ...prev]);
            setCurrentSessionId(newSession.id);
          }
        });

        return finalEngines;
      });

    } catch (error) {
      console.error("Workflow failed", error);
      setGlobalError((error as Error).message);
    } finally {
      setIsAnalyzing(false);
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
                          placeholder="e.g. RELIANCE, TCS"
                          className="w-full bg-slate-950 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono uppercase"
                          disabled={isAnalyzing || isUpdating}
                        />
                      </div>
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

                    <div className="md:col-span-2 flex items-end">
                      {user ? (
                        <button
                          type="submit"
                          disabled={isAnalyzing || isUpdating || !stockSymbol}
                          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAnalyzing ? <Layers className="animate-bounce" /> : <Activity />}
                          {isAnalyzing ? '...' : 'Go'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleLogin}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-blue-400 font-bold py-3 px-6 rounded-xl transition-all shadow-lg border border-slate-700 flex items-center justify-center gap-2"
                        >
                          <Lock className="w-4 h-4" />
                          Login
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </section>

              {/* Error Message */}
              {globalError && (
                <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-400">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-mono">{globalError}</p>
                </div>
              )}

              {/* Synthesis Result */}
              {engines.synthesizer.status === 'success' && (
                <div className="animate-fade-in-up relative">
                  {currentSessionId && user && (
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-4">
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

                      <button
                        onClick={handleUpdateReport}
                        disabled={isUpdating}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RotateCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                        {isUpdating ? 'Checking...' : 'Update'}
                      </button>
                    </div>
                  )}
                  <FinalReport synthesizer={engines.synthesizer} totalTokens={calculateTotalTokens()} />
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
                <EngineCard engine={engines.updater} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.business} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.quant} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.forensic} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.valuation} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.technical} onViewDetails={setSelectedEngine} />
                <EngineCard engine={engines.custom} onViewDetails={setSelectedEngine} />
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-3 space-y-4">
              {isLoadingHistory ? (
                <div className="text-center p-8 text-slate-500 text-sm animate-pulse">Loading portfolio...</div>
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
    </div>
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