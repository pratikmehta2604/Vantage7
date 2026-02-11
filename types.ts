export type EngineId = 'planner' | 'librarian' | 'business' | 'quant' | 'forensic' | 'valuation' | 'technical' | 'updater' | 'synthesizer' | 'linkedin' | 'custom' | 'comprehensive';

export interface TokenUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface WebSource {
  uri: string;
  title: string;
}

export interface EngineStatus {
  id: EngineId;
  name: string;
  role: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  result: string | null;
  error?: string;
  usage?: TokenUsage;
  sources?: WebSource[];
}

export interface StockData {
  symbol: string;
  name: string;
  currentPrice: number;
}

export interface AnalysisRequest {
  stockSymbol: string;
  userQuery?: string;
}

export interface UserPreferences {
  defaultIncrementalMode: boolean;
}

export interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  preferences: UserPreferences;
  createdAt: number;
  lastLogin: number;
}

export interface AnalysisSession {
  id: string; // UUID or timestamp
  symbol: string;
  timestamp: number;
  engines: Record<EngineId, EngineStatus>;
  totalTokens: number;
  verdict?: string; // e.g. "STRONG BUY"
  summary?: string; // One line summary
}