import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENGINE_CONFIGS } from '../constants';
import { EngineId, TokenUsage, WebSource } from '../types';

// Initialize Gemini Client
const apiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.API_KEY;

if (!apiKey) {
  console.error("Gemini API Key is missing. Please add REACT_APP_GEMINI_API_KEY to your .env file.");
}

const ai = new GoogleGenerativeAI(apiKey || 'missing-key');

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
  context?: string
): Promise<EngineResponse> => {
  if (!apiKey || apiKey === 'missing-key') {
    throw new Error("API Key missing. Please check your .env configuration.");
  }

  const config = ENGINE_CONFIGS[engineId];

  // Model Selection Strategy (MAXIMUM QUALITY):
  // User Requirement: "No compromise on quality. 1 stock per day is fine."
  // Strategy: EVERY engine uses 'gemini-3-flash-preview' (Smartest).
  // Strategy: EVERY engine gets 'googleSearch' (Live Data).
  // Cost: ~10 Requests per Analysis.
  // Capacity: ~2 Stocks per Day (20 RPD Limit).
  // Model Selection Strategy (SINGLE SHOT + HIGH QUOTA):
  // gemini-3-flash-preview has tight limits (20 RPD).
  // gemini-1.5-flash has HUGE limits (1500 RPD).
  // We use 1.5 Flash for reliability.

  // Model Selection Strategy (SINGLE SHOT + SEARCH):
  // User reported Gemini 3 Flash not working.
  // Reverting to Gemini 2.5 Flash with Search Enabled.

  const modelId = 'gemini-2.5-flash';

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

  console.log(`[GeminiService] Running ${engineId} on ${modelId} (Tools: ${!!tools})...`);

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: modelId,
      tools: tools as any // Cast to any to avoid strict type mismatch for googleSearch
    });

    const result = await withRetry(async () => {
      return await model.generateContent(fullPrompt);
    });

    const response = result.response;
    const text = response.text() || "Analysis failed to generate text.";

    // Extract token usage and sources
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

  } catch (error: any) {
    console.error(`Error running engine ${engineId}:`, error);

    if (error?.message?.includes('429') || error?.message?.includes('Quota') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error("Gemini Quota Exceeded. Please try again tomorrow (20 RPD Limit).");
    }

    throw error;
  }
};