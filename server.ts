import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";

export function sanitizeMovieData(rawData: any): any {
  if (!rawData || typeof rawData !== 'object') {
    rawData = {};
  }

  // Map Spanish key names back to standard Movie interface keys if the IA responded in Spanish
  const mapped: any = {
    title: rawData.title ?? rawData.titulo ?? rawData.title_es ?? rawData.display_title ?? "",
    originalTitle: rawData.originalTitle ?? rawData.titulo_original ?? rawData.original_title ?? "",
    year: Number(rawData.year ?? rawData.año ?? rawData.anio ?? rawData.year_released ?? 0) || 0,
    rating: Number(rawData.rating ?? rawData.calificacion ?? rawData.rating_global ?? rawData.score ?? 0) || 0,
    duration: rawData.duration ?? rawData.duracion ?? rawData.length ?? "",
    country: rawData.country ?? rawData.pais ?? rawData.country_of_origin ?? "",
    director: rawData.director ?? rawData.dirección ?? rawData.direction ?? "",
    genre: rawData.genre ?? rawData.genero ?? rawData.género ?? "",
    ageRating: rawData.ageRating ?? rawData.clasificacion ?? rawData.clasificación ?? rawData.rating_age ?? "",
    format: rawData.format ?? rawData.formato ?? "",
    poster: rawData.poster ?? rawData.imagen ?? rawData.poster_url ?? "",
    synopsis: rawData.synopsis ?? rawData.sinopsis ?? rawData.argumento ?? "",
    cast: Array.isArray(rawData.cast ?? rawData.elenco ?? rawData.actores) 
      ? (rawData.cast ?? rawData.elenco ?? rawData.actores) 
      : [],
    script: rawData.script ?? rawData.guion ?? rawData.guión ?? "",
    music: rawData.music ?? rawData.banda_sonora ?? rawData.música ?? rawData.musica ?? "",
    photography: rawData.photography ?? rawData.fotografia ?? rawData.fotografía ?? "",
    companies: rawData.companies ?? rawData.estudio ?? rawData.compania ?? rawData.compañía ?? rawData.estudios ?? "",
    reviews: rawData.reviews ?? rawData.reseñas ?? rawData.critica ?? rawData.crítica ?? "",
    awards: rawData.awards ?? rawData.premios ?? "",
    streaming: rawData.streaming ?? rawData.plataformas ?? "",
    estante: rawData.estante ?? rawData.ubicacion ?? rawData.ubicación ?? ""
  };

  // Convert all null/undefined values to empty strings (except year, rating, and cast which is an array)
  for (const key in mapped) {
    if (key === 'cast') {
      if (!Array.isArray(mapped[key])) {
        mapped[key] = [];
      } else {
        mapped[key] = mapped[key].map((item: any) => item != null ? String(item) : "");
      }
    } else if (key === 'year' || key === 'rating') {
      if (typeof mapped[key] !== 'number' || isNaN(mapped[key])) {
        mapped[key] = 0;
      }
    } else {
      if (mapped[key] == null) {
        mapped[key] = "";
      } else {
        mapped[key] = String(mapped[key]);
      }
    }
  }

  return mapped;
}

export function extractAndParseJSON(text: string): any {
  if (!text) {
    throw new Error("El texto devuelto por la IA está vacío.");
  }
  
  // Limpiamos bloque de código markdown si existe
  let cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  
  const enforceEmptyStrings = (obj: any): any => {
    if (obj === null || obj === undefined) return "";
    if (typeof obj === "string") return obj;
    if (typeof obj === "number" || typeof obj === "boolean") return obj;
    if (Array.isArray(obj)) return obj.map(enforceEmptyStrings);
    if (typeof obj === "object") {
      const newObj: any = {};
      for (const key of Object.keys(obj)) {
        newObj[key] = enforceEmptyStrings(obj[key]);
      }
      return newObj;
    }
    return obj;
  };

  let parsedObject = null;
  
  try {
    parsedObject = JSON.parse(cleaned);
  } catch (err) {
    // Si falla el parse directo, intentamos extraer el primer bloque JSON delimitado por llaves o corchetes
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        parsedObject = JSON.parse(objectMatch[0]);
      } catch (e1) {
        console.warn("Fallo al parsear el objeto extraído:", e1);
      }
    }
    
    if (!parsedObject) {
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          parsedObject = JSON.parse(arrayMatch[0]);
        } catch (e2) {
          console.warn("Fallo al parsear el array extraído:", e2);
        }
      }
    }
    
    if (!parsedObject) {
      throw new Error(`No se pudo decodificar un JSON válido de la respuesta de la IA.`);
    }
  }
  
  return enforceEmptyStrings(parsedObject);
}

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
5. INTEGRIDAD Y CLASIFICACIÓN TOTAL: Debes llenar TODOS los campos del JSON solicitado. Si un dato técnico específico (ej. fotografía) es extremadamente difícil de encontrar, proporciona el dato más probable de la industria para esa obra o utiliza una fuente secundaria confiable. El objetivo es una ficha técnica completa al 100%.
6. DETECCIÓN Y REACOMODO INTELIGENTE: Analiza detenidamente todo el texto de entrada. Identifica cada dato (director, guion, año, actores, música, etc.), incluso si viene en desorden, en párrafos desestructurados, o en otros idiomas, y reacomódalo perfectamente en su campo correspondiente en el JSON de salida. Nunca dejes campos en blanco si la información puede ser inferida, extraída o buscada.

El usuario te enviará la información en dos formatos:
CASO A: DATOS DE API (Contiene "DATOS_API") -> Transforma, organiza, reacomoda y enriquece.
CASO B: MODO RESCATE (Contiene "RESCATE") -> Búsqueda profunda obligatoria.

REGLAS GLOBALES Y FORMATO INQUEBRANTABLE:
- Devuelve ÚNICAMENTE un JSON VÁLIDO.
- Géneros separados por barras (Ej: Drama / Comedia).
- Elenco: Máximo 4 actores en formato: Nombre del Actor (Personaje).`;

      const aiResultParse = (rawText: string) => {
        const parsed = extractAndParseJSON(rawText);
        return sanitizeMovieData(parsed);
      };

      const determinePromptParams = (queryStr: string) => {
        const isRescate = queryStr.toUpperCase().includes("RESCATE");
        const isDatosApi = queryStr.toUpperCase().includes("DATOS_API");
        
        if (isRescate) {
          return `CASO B: MODO RESCATE Detectado para: "${displayQuery}".
          Busca exhaustivamente en Google hasta encontrar la información técnica. Analiza y extrae meticulosamente todos los detalles; asocia y reacomoda cada dato en su campo correspondiente. Usa múltiples consultas y agota las opciones antes de decir "No encontrado". NUNCA respondas que no encontraste ningún resultado en general.`;
        } else if (isDatosApi) {
          return `CASO A: DATOS_API Detectado para: "${displayQuery}". Mapea, reorganiza y reacomoda toda la información en los campos correspondientes.`;
        } else {
          return `CASO B: MODO RESCATE Detectado para: "${displayQuery}".
          Aplica el MODO RESCATE. Busca exhaustivamente en Google hasta encontrar la información técnica. Determina y reacomoda todos los campos del JSON correctamente. Usa múltiples consultas y agota las opciones antes de decir "No encontrado".`;
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
          genre: { type: Type.STRING, description: "Géneros separados por barras" },
          synopsis: { type: Type.STRING, description: "Sinopsis completa y sin spoilers" },
          poster: { type: Type.STRING, description: "URL de imagen jpg o png de alta calidad" },
          reviews: { type: Type.STRING, description: "Resumen de la crítica consensuada" },
          awards: { type: Type.STRING, description: "Principales premios ganados" },
          ageRating: { type: Type.STRING, description: "Clasificación de edad (Ej: B15, R, PG-13)" },
          streaming: { type: Type.STRING, description: "Plataformas de streaming disponibles" },
          format: { type: Type.STRING, description: "Formato físico o digital de la película" },
          estante: { type: Type.STRING, description: "Ubicación o estante físico de la videoteca" }
        },
        required: ["title", "originalTitle", "year", "rating", "duration", "country", "director", "script", "cast", "music", "photography", "companies", "genre", "synopsis", "poster", "reviews", "awards", "ageRating", "streaming", "format", "estante"]
      };

      let openRouterSuccess = false;

      // Fase 1: Intentamos primero con Google Gemini Nativo (con Search)
      let geminiFailed = false;
      if (geminiKey) {
        const geminiModels = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
        let aiSuccess = false;

        for (const gModel of geminiModels) {
          let retryCount = 0;
          const maxRetries = 1;
          let forceBreakAll = false;

          while (retryCount <= maxRetries) {
            try {
              console.log(`Intentando Gemini Nativo (${gModel}) para: ${displayQuery}`);
              const ai = new GoogleGenAI({
                apiKey: geminiKey,
                httpOptions: {
                  headers: {
                    'User-Agent': 'aistudio-build',
                  }
                }
              });
              const prompt = `${customPrompt}\n\nDevuelve la ficha técnica en JSON con todos los datos requeridos. No omitas ningún campo.`;

              const response = await ai.models.generateContent({
                model: gModel,
                contents: prompt,
                config: {
                  systemInstruction: systemInstruction,
                  tools: [{ googleSearch: {} }],
                  responseMimeType: "application/json",
                  responseSchema: responseSchema
                },
              });
              const text = response.text;
              console.log("Respuesta Gemini exitosa");
              return res.json(aiResultParse(text));
            } catch (googleError: any) {
              const rawMessage = googleError?.message || "";
              const errMsg = rawMessage.toLowerCase();
              let isQuotaExceeded = errMsg.includes("quota") || errMsg.includes("exhausted") || errMsg.includes("limit") || errMsg.includes("billing") || googleError?.status === 429;
              
              try {
                const parsedErr = JSON.parse(rawMessage);
                if (parsedErr?.error?.status === "RESOURCE_EXHAUSTED" || parsedErr?.error?.code === 429) {
                  isQuotaExceeded = true;
                }
              } catch (e) {}

              console.error(`Google Gemini Nativo (${gModel}) falló:`, googleError.message);
              
              // Si es un error de cuota agotada, no reintentes ni intentes otros modelos nativos. Pasa directo a OpenRouter.
              if (isQuotaExceeded) {
                console.warn("Cuota de Gemini nativo agotada. Saltando directo a OpenRouter...");
                forceBreakAll = true;
                break;
              }

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
          if (forceBreakAll) {
            break;
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
  "streaming": "string",
  "format": "string",
  "estante": "string"
}

Si un dato no existe, usa "" (o 0 si es numérico, o [] para 'cast'). Responde SOLAMENTE con un objeto JSON válido, sin delimitadores extra.` }
              ]
            })
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenRouter Error ${response.status}`);
          }
          const result = await response.json();
          if (result.error) {
            throw new Error(result.error.message || "OpenRouter internal provider error");
          }
          return result;
        };

        const modelsToTry = [
          "meta-llama/llama-3.3-70b-instruct:free",
          "qwen/qwen-2.5-72b-instruct:free",
          "google/gemini-2.5-flash:free",
          "google/gemini-2.5-flash-lite:free"
        ];
        
        let lastError = "Unknown error";
        for (const model of modelsToTry) {
          try {
            console.log(`Intentando modelo OpenRouter en catalog: ${model}`);
            const completion = await callOpenRouter(model);
            const text = completion.choices?.[0]?.message?.content;
            if (!text || text.trim() === "" || text.trim() === "[]" || text.trim() === "{}") {
              throw new Error("Vacío o resultado inválido de OpenRouter");
            }
            return res.json(aiResultParse(text));
          } catch (err: any) {
            console.warn(`Modelo OpenRouter ${model} falló en catalog:`, err.message);
            lastError = err.message;
          }
        }
        console.error("Todos los intentos con modelos gratuitos de OpenRouter fallaron:", lastError);
        throw new Error(lastError);
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

      const prompt = `Extrae las películas del siguiente texto y conviértelas a un array de objetos JSON estructurados con todos sus datos técnicos disponibles (como título español, título original, año, calificación, guion, dirección, género, elenco, distribuidora/estudio, música, sinopsis, formato físico, estante, etc.).
El texto contiene hasta ${limit} películas pegadas con o sin emojis. Ignora los emojis. Limpia los datos.
Asegúrate de mapear los campos correctamente al esquema solicitado, rellenar todos los campos posibles de la ficha de forma fidedigna basándote en el texto y evitar siempre omitir información útil.
Responde ÚNICAMENTE con un array de JSON válido.

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
              title: { type: Type.STRING, description: "Título en español / México" },
              originalTitle: { type: Type.STRING, description: "Título original" },
              year: { type: Type.INTEGER, description: "Año de lanzamiento" },
              rating: { type: Type.NUMBER, description: "Calificación de la obra de 0 a 10" },
              duration: { type: Type.STRING, description: "Duración en formato: 120 min" },
              country: { type: Type.STRING, description: "País de origen" },
              director: { type: Type.STRING, description: "Director de la obra" },
              script: { type: Type.STRING, description: "Guionista de la película" },
              cast: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Actores principales en formato: Nombre (Personaje)" },
              music: { type: Type.STRING, description: "Compositor de la música" },
              photography: { type: Type.STRING, description: "Director de fotografía" },
              companies: { type: Type.STRING, description: "Productora o estudio principal" },
              genre: { type: Type.STRING, description: "Géneros separados por barras (Ej: Drama / Acción)" },
              synopsis: { type: Type.STRING, description: "Sinopsis completa y sin spoilers" },
              poster: { type: Type.STRING, description: "URL de póster si se menciona" },
              reviews: { type: Type.STRING, description: "Reseñas críticas condensadas o consenso" },
              awards: { type: Type.STRING, description: "Premios ganados o relevantes" },
              ageRating: { type: Type.STRING, description: "Clasificación de edad (Ej: B15, R, A)" },
              format: { type: Type.STRING, description: "Formato físico o digital del elemento pegado" },
              estante: { type: Type.STRING, description: "Ubicación o estante físico de la videoteca" },
              streaming: { type: Type.STRING, description: "Plataformas de streaming si se mencionan" }
            },
            required: ["title"]
          }
        };

        const geminiModels = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
        let aiSuccess = false;
        let finalResponseText = "";
        
        for (const gModel of geminiModels) {
          let retryCount = 0;
          const maxRetries = 1;
          let forceBreakAll = false;

          while (retryCount <= maxRetries) {
            try {
              const ai = new GoogleGenAI({
                apiKey: geminiKey,
                httpOptions: {
                  headers: {
                    'User-Agent': 'aistudio-build',
                  }
                }
              });
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
              const rawMessage = err?.message || "";
              const errMsg = rawMessage.toLowerCase();
              let isQuotaExceeded = errMsg.includes("quota") || errMsg.includes("exhausted") || errMsg.includes("limit") || errMsg.includes("billing") || err?.status === 429;

              try {
                const parsedErr = JSON.parse(rawMessage);
                if (parsedErr?.error?.status === "RESOURCE_EXHAUSTED" || parsedErr?.error?.code === 429) {
                  isQuotaExceeded = true;
                }
              } catch (e) {}

              console.error(`Batch parse Gemini (${gModel}) failed:`, err.message);

              // Si es un error de cuota agotada, no reintentes ni intentes otros modelos nativos. Pasa directo a OpenRouter.
              if (isQuotaExceeded) {
                console.warn("Cuota de Gemini nativo agotada en batch-parse. Saltando directo a OpenRouter...");
                forceBreakAll = true;
                break;
              }

              if (err?.message?.includes("503") || err?.status === 503 || err?.message?.includes("429") || err?.status === 429) {
                retryCount++;
                if (retryCount <= maxRetries) {
                  console.warn(`Rate limit or 503 hit in batch-parse for ${gModel}. Retrying...`);
                  await new Promise(resolve => setTimeout(resolve, retryCount * 3000));
                  continue;
                }
              }
              break; // Mode to next model
            }
          }
          if (forceBreakAll || aiSuccess) break;
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
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenRouter Error ${response.status}`);
          }
          const result = await response.json();
          if (result.error) {
            throw new Error(result.error.message || "OpenRouter internal provider error");
          }
          return result;
        };

        const modelsToTry = [
          "meta-llama/llama-3.3-70b-instruct:free",
          "qwen/qwen-2.5-72b-instruct:free",
          "google/gemini-2.5-flash:free",
          "google/gemini-2.5-flash-lite:free"
        ];
        
        let lastError = "Unknown error";
        for (const model of modelsToTry) {
          try {
            console.log(`Intentando modelo OpenRouter en batch: ${model}`);
            const completion = await callOpenRouter(model);
            const textResponse = completion.choices?.[0]?.message?.content;
            if (!textResponse || textResponse.trim() === "" || textResponse.trim() === "[]" || textResponse.trim() === "{}") {
              throw new Error("Vacío o resultado inválido de OpenRouter");
            }
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
         parsedResult = extractAndParseJSON(jsonText);
      } catch (parseErr: any) {
         console.warn("JSON Parse Error on OpenRouter text, manual backup extract failed", parseErr.message);
         throw new Error("No se pudo extraer un JSON válido de la respuesta de la Inteligencia Artificial.");
      }

      if (Array.isArray(parsedResult)) {
        parsedResult = parsedResult.map(item => sanitizeMovieData(item));
      } else if (parsedResult && typeof parsedResult === 'object') {
        parsedResult = [sanitizeMovieData(parsedResult)];
      } else {
        parsedResult = [];
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
