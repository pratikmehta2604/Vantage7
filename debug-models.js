import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function listModels() {
    try {
        console.log("Listing models...");

        // The response is likely an async iterable or has a `models` property that needs better handling
        // Let's print raw first to see structure if iterating fails
        const response = await ai.models.list();

        // Try to iterate directly if it's iterable
        /*
        for await (const model of response) {
          console.log(model.name);
        }
        */

        // Or inspect the object structure from previous output
        // It had: 
        // { paramsInternal: ..., requestInternal: ..., nameInternal: 'models', sdkHttpResponseInternal: ..., idxInternal: 0, pageInternalSize: 45 }
        // This looks like a custom pagination object.
        // Let's try to convert it to array if possible, or use the library's method.

        // Hack: try to access internal cache if available, or just use raw REST call which is foolproof
        console.log("Using raw REST call to guaranteed get the list...");

        const fetch = (await import('node-fetch')).default;
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`);
        const data = await resp.json();

        if (data.models) {
            console.log("\n--- AVAILABLE MODELS (REST API) ---");
            data.models.forEach(m => {
                console.log(`${m.name} [${m.version}] - ${m.supportedGenerationMethods ? m.supportedGenerationMethods.join(',') : 'no methods'}`);
            });
            console.log("-----------------------------------");
        } else {
            console.log("No models found in REST response:", JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

listModels();
