import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENGINE_CONFIGS } from '../constants';
import { AnalysisContext, EngineId, TokenUsage, WebSource } from '../types';

// Build a readable persona string from the pre-analysis context
const buildContextBlock = (ctx?: AnalysisContext): string => {
  if (!ctx) return '';

  const horizonMap = { short: 'Short-term trader (<3 months)', medium: 'Medium-term investor (6-12 months)', long: 'Long-term investor (3+ years)' };
  const goalMap = { growth: 'Capital growth maximizer', dividend: 'Dividend income seeker', balanced: 'Risk-adjusted return optimizer' };
  const riskMap = { aggressive: 'Aggressive (can handle 40%+ drawdowns)', moderate: 'Moderate (comfortable with 15-25% dips)', conservative: 'Conservative (max 15% downside tolerance)' };
  const posMap = { fresh: 'No current position — evaluating fresh entry', holding: 'Currently holding — validating existing thesis', averaging: 'Currently holding but down — evaluating whether to average', reentry: 'Previously exited — evaluating re-entry' };

  let block = `\n\n═══════════════════════════════════════
INVESTOR PERSONA (CRITICAL — Tailor ENTIRE analysis to this profile)
═══════════════════════════════════════
• Time Horizon: ${horizonMap[ctx.horizon]}
• Investment Goal: ${goalMap[ctx.goal]}
• Risk Tolerance: ${riskMap[ctx.riskTolerance]}
• Current Position: ${posMap[ctx.position]}`;

  if (ctx.hypothesis) {
    block += `\n• INVESTOR HYPOTHESIS TO VALIDATE: "${ctx.hypothesis}"
  → You MUST directly investigate this claim with Google Search.
  → Present evidence FOR and AGAINST this hypothesis.
  → Give a verdict: CONFIRMED ✅ / PARTIALLY TRUE ⚠️ / REFUTED ❌`;
  }

  block += `\n\nADAPT YOUR ANALYSIS:\n`;
  if (ctx.horizon === 'short') block += '→ Prioritize technical setup, near-term catalysts, and momentum over long-term DCF.\n';
  if (ctx.horizon === 'long') block += '→ Prioritize compounding quality, management track record, and moat durability over near-term price moves.\n';
  if (ctx.goal === 'dividend') block += '→ Emphasize dividend history, payout sustainability, FCF yield, and balance sheet safety.\n';
  if (ctx.riskTolerance === 'conservative') block += '→ Weight Bear case risks heavily. Recommend conservative position sizing. Flag any leverage or debt concerns prominently.\n';
  if (ctx.riskTolerance === 'aggressive') block += '→ Explore full upside scenarios. Acceptable to recommend larger position sizing if conviction is high.\n';
  if (ctx.position === 'averaging') block += '→ Specifically answer: "Should I average down here?" with clear price levels.\n';
  if (ctx.position === 'reentry') block += '→ Compare current fundamentals vs when investor last held. What has changed — better or worse?\n';
  block += '═══════════════════════════════════════\n';

  return block;
};

// Initialize Gemini Client
const apiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.API_KEY;

if (!apiKey) {
  console.error("Gemini API Key is missing. Please add REACT_APP_GEMINI_API_KEY to your .env file.");
}

// Helper: Delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// MODEL REGISTRY
// Based on official Gemini API docs (April 2026):
//   - gemini-2.5-flash         → Stable, FREE tier, Search grounding ✅
//   - gemini-2.5-flash-lite    → Stable, FREE tier, Search grounding ✅
//   - gemini-3-flash-preview   → Preview, paid-only search billing per query,
//                                 more restrictive rate limits on free tier
//   - gemini-1.5-flash         → SHUT DOWN — do NOT use
//
// Strategy:
//   1. Primary: gemini-2.5-flash (stable, search, free ✅)
//   2. Fallback: gemini-2.5-flash-lite (stable, search, free ✅)
//
// Gemini 3 preview is NOT used as an automatic fallback because:
//   a) It has MORE RESTRICTIVE rate limits on free tier (worse, not better)
//   b) Preview status means it can change/break at any time
//   c) Billing model changed — each search query is billed separately for Gemini 3
// ─────────────────────────────────────────────────────────────────────────────

const MODELS = {
  // All models that support Google Search grounding on free tier
  SEARCH_CAPABLE: [
    'gemini-2.5-flash',         // Primary: stable, best quality
    'gemini-2.5-flash-lite',    // Fallback: stable, lighter, has separate RPM budget
  ],
  // Models that support search but are NOT used in the auto-fallback waterfall
  // (preview models, billing changes, restrictive limits)
  SEARCH_CAPABLE_PAID_OR_PREVIEW: [
    'gemini-3-flash-preview',
  ],
  // These models do NOT exist or are shut down — never call these
  INVALID: [
    'gemini-3-flash',           // Does not exist (correct name is gemini-3-flash-preview)
    'gemini-1.5-flash',         // SHUT DOWN
    'gemini-1.5-pro',           // SHUT DOWN
  ]
};

// Helper: Retry with exponential backoff for TRANSIENT errors only (503 / 429 RPM)
// Max retries = 4, total wait up to ~45s (3s + 6s + 12s + 24s)
// Handles transient 503 (high demand) with 1 quick retry, then throws a tagged error
// so the waterfall can cascade to the next model instead of showing an error to the user.
// RESOURCE_EXHAUSTED (daily quota) is passed through immediately — no retry.
const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 1,   // Only 1 retry for 503; don't make user wait 45s
  baseDelayMs: number = 5000 // 5s gap before the one retry
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const msg = error?.message || '';

      // RESOURCE_EXHAUSTED = daily quota depleted → bubble up immediately for waterfall cascade
      if (msg.includes('RESOURCE_EXHAUSTED')) {
        throw error;
      }

      // 503 = high demand overload, 429 = RPM limit  → transient, worth retrying once
      const isTransient =
        msg.includes('503') ||
        msg.includes('high demand') ||
        (msg.includes('429') && !msg.includes('RESOURCE_EXHAUSTED'));

      if (isTransient && attempt < maxRetries) {
        console.log(`[GeminiService] Transient error — waiting ${baseDelayMs / 1000}s before retry...`);
        await delay(baseDelayMs);
        continue;
      }

      // Retries exhausted on transient error: tag the error so the waterfall knows to cascade
      if (isTransient) {
        const tagged = new Error(`[TRANSIENT] ${msg}`);
        (tagged as any).isTransient = true;
        throw tagged;
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
  modelUsed?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core call helper — always uses Google Search grounding
// ALL models in MODELS.SEARCH_CAPABLE support { googleSearch: {} } tool
// ─────────────────────────────────────────────────────────────────────────────
const callModel = async (
  modelId: string,
  prompt: string,
  apiKey: string
): Promise<EngineResponse> => {
  const ai = new GoogleGenerativeAI(apiKey);

  // All models we call support search grounding.
  // If this ever fails with INVALID_ARGUMENT, it means the model doesn't support it.
  const model = ai.getGenerativeModel({
    model: modelId,
    tools: [{ googleSearch: {} }] as any,
  });

  const result = await withRetry(() => model.generateContent(prompt));

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

  return { text, usage, sources, modelUsed: modelId };
};

// ─────────────────────────────────────────────────────────────────────────────
// Waterfall executor — tries models in order, only cascades on quota errors
// ─────────────────────────────────────────────────────────────────────────────
const runWithWaterfall = async (
  prompt: string,
  primaryModel?: string
): Promise<EngineResponse> => {
  if (!apiKey || apiKey === 'missing-key') {
    throw new Error("API Key missing. Please check your .env configuration.");
  }

  // Build waterfall: requested model first, then remaining search-capable models
  const waterfall = primaryModel
    ? [primaryModel, ...MODELS.SEARCH_CAPABLE.filter(m => m !== primaryModel)]
    : [...MODELS.SEARCH_CAPABLE];

  let lastError: any;

  for (const modelId of waterfall) {
    console.log(`[GeminiService] Trying model: ${modelId}`);
    try {
      const result = await callModel(modelId, prompt, apiKey!);
      if (modelId !== waterfall[0]) {
        result.text = `[⚡ Auto-switched to ${modelId} — previous model quota exceeded]\n\n${result.text}`;
      }
      return result;
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';

      // Cascade condition: quota exhausted OR transient (503) that survived all retries
      const isQuotaExhausted =
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('429') ||
        msg.includes('Quota');

      const isTransientExhausted =
        msg.includes('[TRANSIENT]') ||
        (error as any)?.isTransient === true ||
        msg.includes('503') ||
        msg.includes('high demand');

      // Tool not supported → this model doesn't allow search, skip it
      const isToolError =
        msg.includes('INVALID_ARGUMENT') && msg.toLowerCase().includes('tool');

      if (isQuotaExhausted || isToolError || isTransientExhausted) {
        const reason = isQuotaExhausted ? 'quota exhausted' : isTransientExhausted ? '503 high demand' : 'tool error';
        console.warn(`[GeminiService] ${modelId} unavailable (${reason}). Cascading to next model...`);
        continue;
      }

      // Fatal errors (auth, bad key, malformed request) — stop immediately
      console.error(`[GeminiService] Fatal error on ${modelId}:`, error);
      throw error;
    }
  }

  // All models exhausted
  throw new Error(
    "All models are currently unavailable.\n\n" +
    "• gemini-2.5-flash: Daily quota (1,500 requests/day on free tier) may be exhausted.\n" +
    "• gemini-2.5-flash-lite: Also quota exhausted.\n\n" +
    "Free tier quotas reset at midnight Pacific Time. Please try again later, or check your quota at https://aistudio.google.com/rate-limit"
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const runEngine = async (
  engineId: EngineId,
  stockName: string,
  userQuery?: string,
  context?: string,
  modelOverride?: string,
  analysisContext?: AnalysisContext
): Promise<EngineResponse> => {
  const config = ENGINE_CONFIGS[engineId];

  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' });
  let fullPrompt = `CURRENT DATE: ${today}\n\n${config.prompt}\n\nTarget Asset: ${stockName}`;

  // Inject investor persona block at the top of the prompt
  const personaBlock = buildContextBlock(analysisContext);
  if (personaBlock) {
    fullPrompt = `CURRENT DATE: ${today}${personaBlock}\n\n${config.prompt}\n\nTarget Asset: ${stockName}`;
  }

  if (userQuery) {
    fullPrompt += `\n\nUser Question/Hypothesis: ${userQuery}`;
  }
  if (context) {
    fullPrompt += `\n\nCONTEXT FROM PREVIOUS STEPS:\n${context}`;
  }

  console.log(`[GeminiService] Running engine: ${engineId} | stock: ${stockName} | persona: ${analysisContext ? 'yes' : 'none'}`);
  const result = await runWithWaterfall(fullPrompt, modelOverride);

  // SANITIZE SYNTHESIZER OUTPUT (Strip conversational preambles)
  // AI sometimes outputs "X is indeed listed on NSE..." or "I will now conduct..." before the actual memo.
  if (engineId === 'synthesizer' && result.text) {
    // Try multiple anchor points in priority order
    const anchors = [
      /(?:^|\n)(#+\s*Investment\s*Memo[:\s])/im,
      /(?:^|\n)(\*\*Investment\s*Memo[:\s])/im,
      /(?:^|\n)(Investment\s*Memo:\s)/im,
      /(?:^|\n)(1\.\s*\*?\*?Executive\s*Summary)/im,
      /(?:^|\n)(#+\s*Executive\s*Summary)/im,
      /(?:^|\n)(#+\s*1\.)/im,
    ];
    for (const regex of anchors) {
      const match = result.text.match(regex);
      if (match && match.index !== undefined) {
        // Trim to the start of the captured group (the actual memo content)
        const captureStart = match.index + (match[0].length - match[1].length);
        result.text = result.text.substring(captureStart).trim();
        break;
      }
    }
  }

  return result;
};

export const runCustomPrompt = async (
  prompt: string,
  modelOverride?: string
): Promise<EngineResponse> => {
  console.log(`[GeminiService] Running custom prompt...`);
  return runWithWaterfall(prompt, modelOverride);
};

// --- Chat with Report Context (for AI Chatbot) ---
export const runChatWithContext = async (
  reportText: string,
  stockSymbol: string,
  userQuestion: string,
  chatHistory?: string
): Promise<EngineResponse> => {
  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' });

  let prompt = `CURRENT DATE: ${today}

You are the AI Investment Partner at Vantage7. You have already completed a comprehensive analysis of ${stockSymbol}. The full investment memo is provided below.

FULL INVESTMENT MEMO:
${reportText}

RULES:
- Answer the user's question using the data and analysis from the memo above.
- Be direct, concise, and data-driven. Lead with the answer.
- Use actual numbers (₹ Crores, %, ratios) from the memo — don't be vague.
- If the question requires information NOT in the memo, use Google Search to find current data.
- If you need to update or correct something from the memo, clearly state what changed and why.
- Keep responses under 300 words unless the question requires detailed analysis.
- End with: "**Impact on Thesis:** [How this affects the investment decision]"
`;

  if (chatHistory) {
    prompt += `
PREVIOUS CONVERSATION:
${chatHistory}
`;
  }

  prompt += `
USER QUESTION: ${userQuestion}`;

  return runCustomPrompt(prompt);
};

// ─────────────────────────────────────────────────────────────────────────────
// Language Translation API
// ─────────────────────────────────────────────────────────────────────────────

export const translateReport = async (reportText: string, targetLanguage: string): Promise<string> => {
  if (!apiKey) throw new Error("API key missing. Please check your .env configuration.");

  const prompt = `You are a professional financial translator. Translate the following Investment Memo into ${targetLanguage}.
  
CRITICAL INSTRUCTIONS:
1. Preserve ALL Markdown formatting exactly (headers, bolding, tables, bullet points).
2. Translate the ENTIRE memo from start to finish into ${targetLanguage}.
3. Output ONLY the ${targetLanguage} translation. Do NOT include any English text or paragraphs. Do NOT interleave English and ${targetLanguage} — the output must be purely in ${targetLanguage}.
4. Do NOT translate the [SCORES: ...] hidden array at the bottom. Leave it exactly as is.
5. Keep ticker symbols (like NSE: ATHERENERG) and financial abbreviations (PE, EPS, ROE, ROCE) in English.
6. Translate financial terms accurately with the English term in parentheses where helpful, e.g., "બજાર મૂડીકરણ (Market Cap)".
7. Keep "Entry Zone:", "Stop Loss:", "T1:", "T2:", "T3:" labels in English alongside the translation.

MEMO TO TRANSLATE:
${reportText}`;

  // We explicitly use models WITHOUT googleSearch tool attached to save quota.
  // gemini-2.5-flash handles translation well and is free-tier friendly.
  const translationModel = 'gemini-2.5-flash';

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: translationModel,
    generationConfig: {
      temperature: 0.2, // low temperature for accurate translation
    },
  });

  try {
    console.log(`[TranslateEngine] Translating report to ${targetLanguage} using ${translationModel}...`);
    const result = await withRetry(() => model.generateContent(prompt));
    const response = result.response;
    const text = response.text();
    if (!text) throw new Error("Empty response from translate model");
    console.log(`[TranslateEngine] Translation successful (${text.length} chars).`);
    return text;
  } catch (error: any) {
    console.error(`[TranslateEngine] Translation failed:`, error);
    throw new Error("Translation failed. Please try again later.");
  }
};
