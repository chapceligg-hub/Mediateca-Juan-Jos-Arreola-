import { GoogleGenAI } from "@google/genai";
console.log("Calling with empty key...");
try {
  const ai = new GoogleGenAI({ apiKey: "" });
  ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: 'hello'
  }).then(() => console.log('success')).catch(e => console.error("API error:", e.message));
} catch(e) {
  console.error("SDK Error:", e.message);
}
