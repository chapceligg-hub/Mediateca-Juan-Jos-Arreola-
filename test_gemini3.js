import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiKey = process.env.USER_API_KEY || process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const models = ["gemini-3.1-flash-lite-preview", "gemini-flash-lite-latest"];
  for (const m of models) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: "Hello",
        });
        console.log(`Response with ${m}:`, response.text);
      } catch(e) {
        console.error(`${m} error:`, e.message);
      }
  }
}
run();
