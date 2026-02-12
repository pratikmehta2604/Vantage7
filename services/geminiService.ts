import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENGINE_CONFIGS } from '../constants';
import { EngineId, TokenUsage, WebSource } from '../types';

// Initialize Gemini Client
const apiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.API_KEY;

if (!apiKey) {
  console.error("Gemini API Key is missing. Please add REACT_APP_GEMINI_API_KEY to your .env file.");
}

// Helper: Delay function for rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Retry with exponential backoff
const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 2000
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('RESOURCE_EXHAUSTED') ||
        error?.message?.includes('429') ||
        error?.message?.includes('rate limit');

      if (isRateLimit && attempt < maxRetries) {
        const waitTime = baseDelayMs * Math.pow(2, attempt);
        console.log(`Rate limited. Retrying in ${waitTime / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await delay(waitTime);
        continue;
      }

      // Enhance error message for UI
      if (error?.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error(`Quota Exceeded: You've hit the free tier limit for today. Try again tomorrow or upgrade.`);
      }

      throw error;
    }
  }
  throw new Error('Max retries exceeded');
};

interface EngineResponse {
  text: string;
  usage?: TokenUsage;
  sources?: WebSource[];
}

export const runEngine = async (
  engineId: EngineId,
  stockName: string,
  userQuery?: string,
  context?: string,
  modelOverride?: string
): Promise<EngineResponse> => {
  if (!apiKey || apiKey === 'missing-key') {
    throw new Error("API Key missing. Please check your .env configuration.");
  }

  const config = ENGINE_CONFIGS[engineId];
  const FALLBACK_MODEL = 'gemini-2.5-flash';

  // Model: Use override if provided, otherwise default to 2.5 Flash
  const primaryModel = modelOverride || FALLBACK_MODEL;

  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' });
  let fullPrompt = `CURRENT DATE: ${today}\n\n${config.prompt}\n\nTarget Asset: ${stockName}`;

  if (userQuery) {
    fullPrompt += `\n\nUser Question/Hypothesis: ${userQuery}`;
  }

  if (context) {
    fullPrompt += `\n\nCONTEXT FROM PREVIOUS STEPS:\n${context}`;
  }

  // Universal Search Enabled for Agents
  const tools = [{ googleSearch: {} }];

  // --- Core API call helper ---
  const callGemini = async (modelId: string): Promise<EngineResponse> => {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: modelId,
      tools: tools as any
    });

    const result = await withRetry(async () => {
      return await model.generateContent(fullPrompt);
    });

    const response = result.response;
    const text = response.text() || "Analysis failed to generate text.";

    const usage: TokenUsage = {
      promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokenCount: response.usageMetadata?.totalTokenCount || 0,
    };

    const sources: WebSource[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({ uri: chunk.web.uri, title: chunk.web.title });
        }
      });
    }

    return { text, usage, sources };
  };

  // --- Execute with auto-fallback ---
  console.log(`[GeminiService] Running ${engineId} on ${primaryModel}...`);

  try {
    return await callGemini(primaryModel);
  } catch (error: any) {
    const isQuotaError = error?.message?.includes('429') ||
      error?.message?.includes('Quota') ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.message?.includes('rate limit');

    // Auto-fallback: if quota hit on non-default model, retry with 2.5 Flash
    if (isQuotaError && primaryModel !== FALLBACK_MODEL) {
      console.warn(`[GeminiService] ${primaryModel} quota exceeded for ${engineId}. Falling back to ${FALLBACK_MODEL}...`);
      try {
        const fallbackResult = await callGemini(FALLBACK_MODEL);
        // Prepend a note so the user knows fallback was used
        fallbackResult.text = `[⚡ Auto-switched to Gemini 2.5 Flash due to quota limits]\n\n${fallbackResult.text}`;
        return fallbackResult;
      } catch (fallbackError: any) {
        console.error(`[GeminiService] Fallback to ${FALLBACK_MODEL} also failed for ${engineId}:`, fallbackError);
        throw new Error("Gemini Quota Exceeded on both models. Please try again tomorrow.");
      }
    }

    if (isQuotaError) {
      throw new Error("Gemini Quota Exceeded. Please try again tomorrow.");
    }

    console.error(`Error running engine ${engineId}:`, error);
    throw error;
  }
};

// --- Custom Prompt Runner (for comparison mode etc.) ---
export const runCustomPrompt = async (
  prompt: string,
  modelOverride?: string
): Promise<EngineResponse> => {
  if (!apiKey || apiKey === 'missing-key') {
    throw new Error("API Key missing. Please check your .env configuration.");
  }

  const FALLBACK_MODEL = 'gemini-2.5-flash';
  const primaryModel = modelOverride || FALLBACK_MODEL;
  const tools = [{ googleSearch: {} }];

  const callGemini = async (modelId: string): Promise<EngineResponse> => {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: modelId,
      tools: tools as any
    });

    const result = await withRetry(async () => {
      return await model.generateContent(prompt);
    });

    const response = result.response;
    const text = response.text() || "Analysis failed to generate text.";

    const usage: TokenUsage = {
      promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokenCount: response.usageMetadata?.totalTokenCount || 0,
    };

    const sources: WebSource[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({ uri: chunk.web.uri, title: chunk.web.title });
        }
      });
    }

    return { text, usage, sources };
  };

  console.log(`[GeminiService] Running custom prompt on ${primaryModel}...`);

  try {
    return await callGemini(primaryModel);
  } catch (error: any) {
    const isQuotaError = error?.message?.includes('429') ||
      error?.message?.includes('Quota') ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.message?.includes('rate limit');

    if (isQuotaError && primaryModel !== FALLBACK_MODEL) {
      console.warn(`[GeminiService] ${primaryModel} quota exceeded. Falling back to ${FALLBACK_MODEL}...`);
      try {
        const fallbackResult = await callGemini(FALLBACK_MODEL);
        fallbackResult.text = `[⚡ Auto-switched to Gemini 2.5 Flash due to quota limits]\n\n${fallbackResult.text}`;
        return fallbackResult;
      } catch (fallbackError: any) {
        throw new Error("Gemini Quota Exceeded on both models. Please try again tomorrow.");
      }
    }

    if (isQuotaError) {
      throw new Error("Gemini Quota Exceeded. Please try again tomorrow.");
    }

    throw error;
  }
};