import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiKey = process.env.USER_API_KEY || process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.list();
  if (response.models) {
    for (const model of response.models) {
       console.log(model.name);
    }
  } else if (response.length) {
     for (const model of response) console.log(model.name);
  } else {
     console.log('models uniterable keys:', Object.keys(response));
     for (const k in response) {
       console.log('key:', k);
       try { for (const m of response[k]) console.log(m.name); } catch(e){}
     }
  }
}
run();
