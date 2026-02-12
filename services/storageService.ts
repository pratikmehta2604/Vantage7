import { AnalysisSession, EngineId, EngineStatus, UserData, UserPreferences } from '../types';
import { db } from './firebase';
import firebase from "firebase/compat/app";

const LOCAL_STORAGE_KEY = 'hedgefund_ai_sessions';

// Helper to extract summary data
const extractMetadata = (engines: Record<EngineId, EngineStatus>) => {
  const synthResult = engines.synthesizer?.result || '';
  let verdict = 'ANALYZED';
  let summary = '';

  const verdictMatch = synthResult.match(/FINAL DECISION:\s*\[?(.*?)\]?$/m) || synthResult.match(/FINAL DECISION:\s*(.*)$/m);
  if (verdictMatch) {
    verdict = verdictMatch[1].replace(/\*/g, '').trim();
  }

  const thesisMatch = synthResult.match(/The "One-Line" Thesis:?\s*(.*)$/m);
  if (thesisMatch) {
    summary = thesisMatch[1].replace(/\*/g, '').trim();
  } else {
    summary = synthResult.split('\n').find(line => line.length > 20 && !line.startsWith('#'))?.substring(0, 100) + '...' || '';
  }

  return { verdict, summary };
};

// Firestore does not accept 'undefined', so we must convert to null or strip them.
const sanitizeForFirestore = (data: any): any => {
  return JSON.parse(JSON.stringify(data, (key, value) => {
    return value === undefined ? null : value;
  }));
};

const getLocalSessionsInternal = (): AnalysisSession[] => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load from LocalStorage", e);
    return [];
  }
};

export const saveSession = async (userId: string | null, symbol: string, engines: Record<EngineId, EngineStatus>, existingId?: string): Promise<AnalysisSession | null> => {
  try {
    const totalTokens = Object.values(engines).reduce((acc, e) => acc + (e.usage?.totalTokenCount || 0), 0);
    const { verdict, summary } = extractMetadata(engines);
    const id = existingId || Date.now().toString();

    const newSession: AnalysisSession = {
      id,
      symbol: symbol.toUpperCase(),
      timestamp: existingId ? Date.now() : Date.now(), // Update timestamp on edit? Yes.
      engines,
      totalTokens,
      verdict,
      summary
    };

    // If real user (and not demo mode), save to Firestore
    if (userId && userId !== 'demo-mode-user') {
      // Sanitize to ensure no 'undefined' values are passed to Firestore
      const cleanSession = sanitizeForFirestore(newSession);
      // Namespace API: db.collection(...).doc(...).set(...)
      await db.collection("users").doc(userId).collection("sessions").doc(id).set(cleanSession, { merge: true });
    } else {
      // Save to LocalStorage for Demo User or Guest
      const sessions = getLocalSessionsInternal();
      // Deduplicate: replace existing entry if same ID, otherwise prepend
      const existingIdx = sessions.findIndex(s => s.id === id);
      if (existingIdx >= 0) {
        sessions[existingIdx] = newSession;
      } else {
        sessions.unshift(newSession);
      }
      // Limit size to avoid localStorage quota issues
      if (sessions.length > 20) sessions.pop();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
    }

    return newSession;
  } catch (e) {
    console.error("Failed to save session", e);
    return null;
  }
};

export const getSessions = async (userId: string | null): Promise<AnalysisSession[]> => {
  if (userId && userId !== 'demo-mode-user') {
    try {
      // Namespace API: db.collection(...).orderBy(...).get()
      const querySnapshot = await db.collection("users")
        .doc(userId)
        .collection("sessions")
        .orderBy("timestamp", "desc")
        .get();

      const sessions: AnalysisSession[] = [];
      querySnapshot.forEach((doc: any) => {
        sessions.push(doc.data() as AnalysisSession);
      });
      return sessions;
    } catch (e) {
      console.error("Failed to load sessions from Firestore", e);
      return [];
    }
  } else {
    return getLocalSessionsInternal();
  }
};

export const deleteSession = async (userId: string | null, sessionId: string): Promise<void> => {
  try {
    if (userId && userId !== 'demo-mode-user') {
      // Namespace API: db.collection(...).doc(...).delete()
      await db.collection("users").doc(userId).collection("sessions").doc(sessionId).delete();
    } else {
      const sessions = getLocalSessionsInternal().filter(s => s.id !== sessionId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
    }
  } catch (e) {
    console.error("Failed to delete session", e);
    throw e;
  }
};

// --- User Profile Management ---

export const saveUser = async (user: firebase.User): Promise<void> => {
  if (!user.uid || user.uid === 'demo-mode-user') return; // Skip for demo user

  const userRef = db.collection("users").doc(user.uid);

  try {
    const snapshot = await userRef.get();

    if (!snapshot.exists) {
      const newUser: UserData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        preferences: {
          defaultIncrementalMode: true
        },
        createdAt: Date.now(),
        lastLogin: Date.now()
      };
      const cleanUser = sanitizeForFirestore(newUser);
      await userRef.set(cleanUser);
    } else {
      await userRef.update({
        lastLogin: Date.now()
      });
    }
  } catch (e) {
    console.error("Error saving user data:", e);
  }
};

export const getUserData = async (userId: string): Promise<UserData | null> => {
  if (userId === 'demo-mode-user') return null;

  try {
    const doc = await db.collection("users").doc(userId).get();
    return doc.exists ? doc.data() as UserData : null;
  } catch (e) {
    console.error("Error getting user data:", e);
    return null;
  }
}

export const updateUserPreferences = async (userId: string, preferences: Partial<UserPreferences>): Promise<void> => {
  if (userId === 'demo-mode-user') return;

  try {
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(preferences)) {
      // Ensure no undefined values
      if (value !== undefined) {
        updates[`preferences.${key}`] = value;
      }
    }
    await db.collection("users").doc(userId).update(updates);
  } catch (e) {
    console.error("Error updating preferences:", e);
  }
}