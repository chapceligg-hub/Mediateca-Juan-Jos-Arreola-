import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API endpoints
  app.post("/api/catalog", async (req, res) => {
    try {
      const { query, searchYear } = req.body;
      const displayQuery = searchYear ? `${query} (${searchYear})` : query;
      
      let geminiKey = process.env.GEMINI_API_KEY || "";
      let openRouterKey = process.env.OPENROUTER_API_KEY || "";
      const userKey = process.env.USER_API_KEY || "";

      if (userKey) {
        if (userKey.startsWith("AIza")) {
          geminiKey = userKey;
        } else {
          openRouterKey = userKey;
          if (!geminiKey) geminiKey = process.env.GEMINI_API_KEY || "";
        }
      }

      if (geminiKey === "MY_GEMINI_API_KEY" || geminiKey === '""' || geminiKey === "undefined") {
        geminiKey = "";
      }

      const systemInstruction = `Eres el motor automatizado de catalogación y crítico cinematográfico de una videoteca de alto nivel. Tu objetivo es procesar las entradas del usuario y devolver una ficha técnica perfectamente estructurada para exportación automática, manteniendo siempre un estándar de redacción limpio, moderno y premium.

REGLAS DE BÚSQUEDA PROFUNDA (Prioridad: Google Search):
1. DEPENDENCIA TOTAL DE BÚSQUEDA: Tu herramienta principal y obligatoria es Google Search. Debes encontrar datos REALES y COMPLETOS. Está PROHIBIDO omitir campos.
2. PROHIBIDO RENDIRSE: Si no hay resultados iniciales, reformula la búsqueda (ej. título original, director, país).
3. RESOLUCIÓN DE AMBIGÜEDADES: Si hay remakes, usa el año proporcionado.
4. CERO INTERVENCIÓN HUMANA: No hagas preguntas. Selecciona la fuente más confiable (IMDb, FilmAffinity, Wikipedia).
5. INTEGRIDAD TOTAL: Debes llenar TODOS los campos del JSON solicitado. Si un dato técnico específico (ej. fotografía) es extremadamente difícil de encontrar, proporciona el dato más probable de la industria para esa obra o utiliza una fuente secundaria confiable. El objetivo es una ficha técnica completa al 100%.

El usuario te enviará la información en dos formatos:
CASO A: DATOS DE API (Contiene "DATOS_API") -> Transforma y enriquece.
CASO B: MODO RESCATE (Contiene "RESCATE") -> Búsqueda profunda obligatoria.

REGLAS GLOBALES Y FORMATO INQUEBRANTABLE:
- Devuelve ÚNICAMENTE un JSON VÁLIDO.
- Géneros separados por barras (Ej: Drama / Comedia).
- Elenco: Máximo 4 actores en formato: Nombre del Actor (Personaje).`;

      const aiResultParse = (rawText: string) => {
        let text = rawText || "{}";
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(text);
      };

      const determinePromptParams = (queryStr: string) => {
        const isRescate = queryStr.toUpperCase().includes("RESCATE");
        const isDatosApi = queryStr.toUpperCase().includes("DATOS_API");
        
        if (isRescate) {
          return `CASO B: MODO RESCATE Detectado para: "${displayQuery}".
          Busca exhaustivamente en Google hasta encontrar la información técnica. Usa múltiples consultas y agota las opciones antes de decir "No encontrado". NUNCA respondas que no encontraste ningún resultado en general.`;
        } else if (isDatosApi) {
          return `CASO A: DATOS_API Detectado para: "${displayQuery}".`;
        } else {
          return `CASO B: MODO RESCATE Detectado para: "${displayQuery}".
          Aplica el MODO RESCATE. Busca exhaustivamente en Google hasta encontrar la información técnica. Usa múltiples consultas y agota las opciones antes de decir "No encontrado".`;
        }
      };

      const customPrompt = determinePromptParams(query);

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Título en español / México" },
          originalTitle: { type: Type.STRING, description: "Título original" },
          year: { type: Type.INTEGER, description: "Año de lanzamiento" },
          rating: { type: Type.NUMBER, description: "Calificación ej. 8.1" },
          duration: { type: Type.STRING, description: "Duración en formato: 148 min" },
          country: { type: Type.STRING, description: "País de origen" },
          director: { type: Type.STRING, description: "Director de la obra" },
          script: { type: Type.STRING, description: "Guionista" },
          cast: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lista de 3 a 5 actores principales" },
          music: { type: Type.STRING, description: "Compositor de la música" },
          photography: { type: Type.STRING, description: "Director de fotografía" },
          companies: { type: Type.STRING, description: "Productora o estudio principal" },
          genre: { type: Type.STRING, description: "Géneros separados por comas" },
          synopsis: { type: Type.STRING, description: "Sinopsis completa y sin spoilers" },
          poster: { type: Type.STRING, description: "URL de imagen jpg o png de alta calidad" },
          reviews: { type: Type.STRING, description: "Resumen de la crítica consensuada" },
          awards: { type: Type.STRING, description: "Principales premios ganados" },
          ageRating: { type: Type.STRING, description: "Clasificación de edad (Ej: B15, R, PG-13)" },
          streaming: { type: Type.STRING, description: "Plataformas donde se puede ver" }
        },
        required: ["title", "originalTitle", "year", "rating", "duration", "country", "director", "script", "cast", "music", "photography", "companies", "genre", "synopsis", "poster", "reviews", "awards", "ageRating", "streaming"]
      };

      let openRouterSuccess = false;

      // Fase 1: Intentamos primero con Google Gemini Nativo (con Search)
      let geminiFailed = false;
      if (geminiKey) {
        const geminiModels = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "gemini-1.5-flash"];
        let aiSuccess = false;

        for (const gModel of geminiModels) {
          let retryCount = 0;
          const maxRetries = 1;

          while (retryCount <= maxRetries) {
            try {
              console.log(`Intentando Gemini Nativo (${gModel}) para: ${displayQuery}`);
              const ai = new GoogleGenAI({ apiKey: geminiKey });
              const prompt = `${customPrompt}\n\nDevuelve la ficha técnica en JSON EXACTAMENTE con los siguientes campos:\n{ "title": "string", "originalTitle": "string", "year": 1234, "rating": 1.2, "duration": "string", "country": "string", "director": "string", "script": "string", "cast": ["string"], "music": "string", "photography": "string", "companies": "string", "genre": "string", "synopsis": "string", "poster": "string", "reviews": "string", "awards": "string", "ageRating": "string", "streaming": "string", "format": "string", "estante": "string" }`;

              const response = await ai.models.generateContent({
                model: gModel,
                contents: prompt,
                config: {
                  systemInstruction: systemInstruction,
                  tools: [{ googleSearch: {} }],
                  responseMimeType: "application/json",
                },
              });
              const text = response.text;
              console.log("Respuesta Gemini exitosa");
              return res.json(aiResultParse(text));
            } catch (googleError: any) {
              console.error(`Google Gemini Nativo (${gModel}) falló:`, googleError.message);
              if (googleError?.message?.includes("503") || googleError?.status === 503 || googleError?.message?.includes("429") || googleError?.status === 429) {
                retryCount++;
                if (retryCount <= maxRetries) {
                  console.warn(`Rate limit o 503 alcanzado. Retentando en ${retryCount * 3}s...`);
                  await new Promise(r => setTimeout(r, retryCount * 3000));
                  continue;
                }
              }
              break; // Mover al siguiente modelo
            }
          }
        }
        // Si sale de este loop y no hizo return res.json(), fallaron todos.
        geminiFailed = true;
      } else {
        geminiFailed = true;
      }

      // Fase 2: Si no hay clave de Google o falló, intentamos con OpenRouter
      if (geminiFailed && openRouterKey) {
        const callOpenRouter = async (model: string) => {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.APP_URL || "https://ai.studio",
              "X-Title": "MovieApp AI",
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: `${customPrompt}
                
Devuelve la ficha técnica en JSON EXACTAMENTE con los siguientes campos y tipos para la búsqueda: "${displayQuery}".

Campos obligatorios:
{
  "title": "string",
  "originalTitle": "string",
  "year": 1234,
  "rating": 1.2,
  "duration": "string",
  "country": "string",
  "director": "string",
  "script": "string",
  "cast": ["string"],
  "music": "string",
  "photography": "string",
  "companies": "string",
  "genre": "string",
  "synopsis": "string",
  "poster": "string",
  "reviews": "string",
  "awards": "string",
  "ageRating": "string",
  "streaming": "string"
}

Si un dato no existe, usa "N/A" (o 0 si es numérico). Responde SOLAMENTE con un objeto JSON válido, sin delimitadores extra.` }
              ]
            })
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenRouter Error ${response.status}`);
          }
          return await response.json();
        };

        const modelsToTry = [
          "google/gemini-2.5-flash",
          "meta-llama/llama-3.3-70b-instruct:free",
          "qwen/qwen-2.5-7b-instruct:free",
          "openrouter/auto",
          "openrouter/free"
        ];
        
        let lastError = "Unknown error";
        for (const model of modelsToTry) {
          try {
            console.log(`Intentando modelo OpenRouter: ${model}`);
            const completion = await callOpenRouter(model);
            const text = completion.choices?.[0]?.message?.content || "{}";
            return res.json(aiResultParse(text));
          } catch (err: any) {
            console.warn(`Modelo OpenRouter ${model} falló:`, err.message);
            lastError = err.message;
          }
        }
        console.error("Todos los intentos con modelos gratuitos de OpenRouter fallaron:", lastError);

      }

      return res.status(500).json({ error: "No se pudo obtener información de ninguna fuente." });
    } catch (error: any) {
      console.error("API Error encountered:", error);
      
      let clientErrorMsg = error.message || "Unknown error";
      
      if (error.status === 429 || clientErrorMsg.includes("429") || clientErrorMsg.includes("quota")) {
        clientErrorMsg = "La Inteligencia Artificial base (Gemini) ha agotado su cuota gratuita de Google. Para hacerlo 100% ilimitado y gratuito para el público, configura un OPENROUTER_API_KEY en tus variables globales (Recomendado: Llama 3.3).";
      }

      res.status(error.status || 500).json({ 
        error: clientErrorMsg,
        status: error.status || 500
      });
    }
  });

  app.post("/api/batch-parse", async (req, res) => {
    try {
      const { text, limit = 5 } = req.body;
      
      let geminiKey = process.env.GEMINI_API_KEY || "";
      let openRouterKey = process.env.OPENROUTER_API_KEY || "";
      const userKey = process.env.USER_API_KEY || "";

      if (userKey) {
        if (userKey.startsWith("AIza")) {
          geminiKey = userKey;
        } else {
          openRouterKey = userKey;
          if (!geminiKey) geminiKey = process.env.GEMINI_API_KEY || "";
        }
      }
      if (geminiKey === "MY_GEMINI_API_KEY" || geminiKey === '""' || geminiKey === "undefined") {
        geminiKey = "";
      }

      if (!geminiKey && !openRouterKey) {
        return res.status(500).json({ error: "No API key configured." });
      }

      const prompt = `Extrae las películas del siguiente texto y conviértelas a un array de objetos JSON estructurados.
El texto contiene hasta ${limit} películas pegadas con o sin emojis. Ignora los emojis. Limpia los datos.
Asegúrate de mapear los campos correctamente al esquema solicitado. Responde ÚNICAMENTE con un array de JSON válido de tipo objeto.
Es de extrema importancia que el sistema SIEMPRE extraiga la calificación (Rating) de la película y la convierta a número.
Asegúrate de que el campo de formato físico se mantenga estrictamente mapeado bajo el nombre 'format' guardando el dato correctamente como string (ej. DVD Original).

Texto a procesar:
${text}`;

      let jsonText = "";
      let geminiFailed = false;

      // Fase 1: Gemini
      if (geminiKey) {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const responseSchema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              originalTitle: { type: Type.STRING },
              year: { type: Type.INTEGER },
              rating: { type: Type.NUMBER },
              duration: { type: Type.STRING },
              country: { type: Type.STRING },
              director: { type: Type.STRING },
              script: { type: Type.STRING },
              cast: { type: Type.ARRAY, items: { type: Type.STRING } },
              music: { type: Type.STRING },
              photography: { type: Type.STRING },
              companies: { type: Type.STRING },
              genre: { type: Type.STRING },
              synopsis: { type: Type.STRING },
              poster: { type: Type.STRING },
              reviews: { type: Type.STRING },
              awards: { type: Type.STRING },
              ageRating: { type: Type.STRING },
              format: { type: Type.STRING },
              estante: { type: Type.STRING }
            },
            required: ["title", "originalTitle", "year", "rating", "duration", "country", "director", "script", "cast", "music", "photography", "companies", "genre", "synopsis", "poster", "reviews", "awards", "ageRating", "format"]
          }
        };

          const geminiModels = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "gemini-1.5-flash"];
          let aiSuccess = false;
          let finalResponseText = "";
          
          for (const gModel of geminiModels) {
            let retryCount = 0;
            const maxRetries = 1;
            while (retryCount <= maxRetries) {
              try {
                const ai = new GoogleGenAI({ apiKey: geminiKey });
                const response = await ai.models.generateContent({
                  model: gModel,
                  contents: prompt,
                  config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema
                  },
                });
                
                if (!response.text) throw new Error("No text response");
                finalResponseText = response.text;
                aiSuccess = true;
                break;
              } catch (err: any) {
                console.error(`Batch parse Gemini (${gModel}) failed:`, err.message);
                if (err?.message?.includes("503") || err?.status === 503 || err?.message?.includes("429") || err?.status === 429) {
                  retryCount++;
                  if (retryCount <= maxRetries) {
                    console.warn(`Rate limit or 503 hit in batch-parse for ${gModel}. Retrying...`);
                    await new Promise(resolve => setTimeout(resolve, retryCount * 3000));
                    continue;
                  }
                }
                break; // Move to next model
              }
            }
            if (aiSuccess) break;
          }
          
          if (aiSuccess) {
            jsonText = finalResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
          } else {
            geminiFailed = true;
          }
      } else {
        geminiFailed = true;
      }

      // Fase 2: OpenRouter Fallback
      if (geminiFailed && openRouterKey) {
        console.log("Intentando OpenRouter en batch-parse");
        const callOpenRouter = async (model: string) => {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.APP_URL || "https://ai.studio",
              "X-Title": "MovieApp AI",
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: "user", content: prompt }]
            })
          });

          if (!response.ok) {
            throw new Error(`OpenRouter Error ${response.status}`);
          }
          return await response.json();
        };

        const modelsToTry = [
          "google/gemini-2.5-flash",
          "meta-llama/llama-3.3-70b-instruct:free",
          "qwen/qwen-2.5-7b-instruct:free",
          "openrouter/auto",
          "openrouter/free"
        ];
        
        let lastError = "Unknown error";
        for (const model of modelsToTry) {
          try {
            const completion = await callOpenRouter(model);
            const textResponse = completion.choices?.[0]?.message?.content || "[]";
            jsonText = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
            break;
          } catch (err: any) {
            console.warn(`Modelo OpenRouter ${model} falló en batch:`, err.message);
            lastError = err.message;
          }
        }
        
        if (!jsonText || jsonText === "") {
          throw new Error("Batch parse by OpenRouter failed: " + lastError);
        }
      }

      if (!jsonText) {
         throw new Error("No response generated.");
      }

      let parsedResult;
      try {
         parsedResult = JSON.parse(jsonText);
      } catch (parseErr) {
         console.warn("JSON Parse Error on OpenRouter text, returning raw or error", jsonText);
         // if OpenRouter didn't return pure JSON, we might want to try to extract it
         const match = jsonText.match(/\[.*\]/s);
         if (match) {
             parsedResult = JSON.parse(match[0]);
         } else {
             throw new Error("No se pudo extraer JSON válido.");
         }
      }
      return res.json(parsedResult);

    } catch (error: any) {
      console.error("Batch parse error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
