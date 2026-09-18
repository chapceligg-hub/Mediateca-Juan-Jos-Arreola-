import { GoogleGenAI, Type } from "@google/genai";

export async function catalogMovieAI(query: string, searchYear?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  const displayQuery = searchYear ? `${query} (${searchYear})` : query;

  const systemInstruction = `Eres el motor automatizado de catalogación y crítico cinematográfico de una mediateca de alto nivel. Tu objetivo es procesar las entradas del usuario y devolver una ficha técnica perfectamente estructurada para exportación automática, manteniendo siempre un estándar de redacción limpio, moderno y premium.

REGLAS DE BÚSQUEDA PROFUNDA (Prioridad: Google Search):
1. DEPENDENCIA TOTAL DE BÚSQUEDA: Tu herramienta principal y obligatoria es Google Search. Debes encontrar datos REALES y COMPLETOS. Está PROHIBIDO omitir campos o dejar valores vacíos.
2. PROHIBIDO RENDIRSE: Si no hay resultados iniciales, reformula la búsqueda (ej. título original, director, país).
3. RESOLUCIÓN DE AMBIGÜEDADES: Si hay remakes, usa el año proporcionado.
4. CERO INTERVENCIÓN HUMANA: No hagas preguntas. Selecciona la fuente más confiable (IMDb, FilmAffinity, Wikipedia).
5. INTEGRIDAD TOTAL: Debes llenar TODOS los campos del JSON solicitado. Si un dato técnico específico (ej. fotografía) es extremadamente difícil de encontrar, proporciona el dato más probable de la industria para esa obra o utiliza una fuente secundaria confiable. El objetivo es una ficha técnica completa al 100%.
6. DETECCIÓN Y REACOMODO DE CAMPOS: Debes escanear exhaustivamente todo el texto de entrada y mapear de forma extremadamente rigurosa cada fragmento de información al campo del JSON correspondiente. No descartes ningún dato técnico disponible (duración, país, director, guion, elenco, música, fotografía, empresa productora, reseñas, premios, clasificación por edad, estante o formato). Si la información de entrada tiene nombres de etiquetas diferentes u otros idiomas, búscalas semánticamente y reacomódalas en el campo JSON correcto según el esquema solicitado.

REGLAS GLOBALES Y FORMATO INQUEBRANTABLE:
- Devuelve ÚNICAMENTE un JSON VÁLIDO.
- Géneros separados por barras (Ej: Drama / Comedia).
- Elenco: Máximo 4 actores en formato: Nombre del Actor (Personaje).`;

  const determinePrompt = (queryStr: string) => {
    const isRescate = queryStr.toUpperCase().includes("RESCATE");
    const isDatosApi = queryStr.toUpperCase().includes("DATOS_API");
    
    if (isRescate) {
      return `CASO B: MODO RESCATE Detectado para: "${displayQuery}". Busca exhaustivamente en Google hasta encontrar la información técnica. Usa múltiples consultas y agota las opciones antes de decir "No encontrado". NUNCA respondas que no encontraste ningún resultado en general.`;
    } else if (isDatosApi) {
      return `CASO A: DATOS_API Detectado para: "${displayQuery}".`;
    } else {
      return `Aplica MODO RESCATE para: "${displayQuery}". Busca exhaustivamente en Google hasta encontrar la información técnica.`;
    }
  };

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
      cast: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lista de 3 a 4 actores principales con personaje" },
      music: { type: Type.STRING, description: "Compositor de la música" },
      photography: { type: Type.STRING, description: "Director de fotografía" },
      companies: { type: Type.STRING, description: "Productora o estudio principal" },
      genre: { type: Type.STRING, description: "Géneros separados por barras" },
      synopsis: { type: Type.STRING, description: "Sinopsis completa y sin spoilers" },
      poster: { type: Type.STRING, description: "URL de imagen jpg o png de alta calidad" },
      reviews: { type: Type.STRING, description: "Resumen de la crítica consensuada" },
      awards: { type: Type.STRING, description: "Principales premios ganados" },
      ageRating: { type: Type.STRING, description: "Clasificación de edad (Ej: B15, R, PG-13)" },
      format: { type: Type.STRING, description: "Formato físico o digital de la película (Ej: DVD Original, Blu-ray, VHS)" },
      estante: { type: Type.STRING, description: "Localización anatómica del estante" }
    },
    required: ["title", "originalTitle", "year", "rating", "duration", "country", "director", "script", "cast", "music", "photography", "companies", "genre", "synopsis", "poster", "reviews", "awards", "ageRating", "format"]
  };

  const geminiModels = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
  
  for (const gModel of geminiModels) {
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      try {
        const response = await ai.models.generateContent({
          model: gModel,
          contents: determinePrompt(query),
          config: {
            systemInstruction: systemInstruction,
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: responseSchema
          },
        });

        if (!response.text) {
          throw new Error("AI_NO_RESPONSE");
        }

        const parsedData = JSON.parse(response.text.replace(/```json/g, "").replace(/```/g, "").trim());
        
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

        return enforceEmptyStrings(parsedData);
      } catch (error: any) {
        if (error?.message?.includes("503") || error?.status === 503 || error?.message?.includes("429") || error?.status === 429) {
          retryCount++;
          if (retryCount <= maxRetries) {
            console.warn(`Rate limit or 503 hit in frontend for ${gModel}. Retrying in ${retryCount * 3} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryCount * 3000));
            continue;
          }
        }
        break; // break out of retry loop to try next model
      }
    }
  }
  throw new Error("No se pudo obtener información de ninguna fuente (Service 503/429)");
}

import { ICONIC_CINEMA_QUOTES } from "./iconicQuotes";

export async function fetchIconicQuote() {
  return ICONIC_CINEMA_QUOTES[Math.floor(Math.random() * ICONIC_CINEMA_QUOTES.length)];
}
