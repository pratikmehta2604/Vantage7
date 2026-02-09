import { GoogleGenAI } from "@google/genai";
import { ENGINE_CONFIGS } from '../constants';
import { EngineId, TokenUsage, WebSource } from '../types';

// Initialize Gemini Client
// Checks for REACT_APP_GEMINI_API_KEY (Frontend) or API_KEY (Node/System)
// Fallback to the provided key if env vars are missing in the environment.
const apiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.API_KEY;

if (!apiKey) {
  console.error("Gemini API Key is missing. Please add REACT_APP_GEMINI_API_KEY to your .env file.");
}

// Initialize with the key or a dummy string to prevent immediate crash, though calls will fail without a valid key.
const ai = new GoogleGenAI({ apiKey: apiKey || 'missing-key' });

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

  // Model Selection Strategy:
  // Planner/Librarian/Synthesizer: Use 'gemini-3-pro-preview' for complex reasoning, planning, and data extraction.
  // Specialists: Use 'gemini-3-flash-preview' for efficient analysis of the provided context.
  const isComplex = ['planner', 'librarian', 'synthesizer'].includes(engineId);
  const modelId = isComplex ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

  let fullPrompt = `${config.prompt}\n\nTarget Asset: ${stockName}`;

  if (engineId === 'custom' && userQuery) {
    fullPrompt += `\n\nUser Specific Hypothesis/Query: "${userQuery}"`;
  }

  // Inject context (Shared Storage - The "MASTER_DATA_FILE")
  if (context) {
    fullPrompt += `\n\n=========== MASTER_DATA_FILE (SOURCE OF TRUTH) ===========\n${context}\n==========================================================\n\nINSTRUCTION: Base your analysis PRIMARILY on the MASTER_DATA_FILE above to ensure consistency and reduce hallucinations. Only use external tools if data is missing or you need real-time price/news.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: fullPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "Analysis failed to generate text.";

    // Extract token usage
    const usage: TokenUsage = {
      promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokenCount: response.usageMetadata?.totalTokenCount || 0,
    };

    // Extract grounding sources (Web Search Results)
    const sources: WebSource[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({
            uri: chunk.web.uri,
            title: chunk.web.title
          });
        }
      });
    }

    return { text, usage, sources };
  } catch (error) {
    console.error(`Error running engine ${engineId}:`, error);
    throw error; // Let the caller handle the error state
  }
};