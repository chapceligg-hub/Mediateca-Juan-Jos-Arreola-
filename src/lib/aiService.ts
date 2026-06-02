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

  const systemInstruction = `Eres el motor automatizado de catalogación y crítico cinematográfico de una videoteca de alto nivel. Tu objetivo es procesar las entradas del usuario y devolver una ficha técnica perfectamente estructurada para exportación automática, manteniendo siempre un estándar de redacción limpio, moderno y premium.

REGLAS DE BÚSQUEDA PROFUNDA (Prioridad: Google Search):
1. DEPENDENCIA TOTAL DE BÚSQUEDA: Tu herramienta principal y obligatoria es Google Search. Debes encontrar datos REALES y COMPLETOS. Está PROHIBIDO omitir campos o dejar valores vacíos.
2. PROHIBIDO RENDIRSE: Si no hay resultados iniciales, reformula la búsqueda (ej. título original, director, país).
3. RESOLUCIÓN DE AMBIGÜEDADES: Si hay remakes, usa el año proporcionado.
4. CERO INTERVENCIÓN HUMANA: No hagas preguntas. Selecciona la fuente más confiable (IMDb, FilmAffinity, Wikipedia).
5. INTEGRIDAD Y CLASIFICACIÓN TOTAL: Debes llenar TODOS los campos del JSON solicitado. Si un dato técnico específico (ej. fotografía) es extremadamente difícil de encontrar, proporciona el dato más probable de la industria para esa obra o utiliza una fuente secundaria confiable. El objetivo es una ficha técnica completa al 100%.
6. DETECCIÓN Y REACOMODO INTELIGENTE: Analiza detenidamente todo el texto de entrada. Identifica cada dato (director, guion, año, actores, música, etc.), incluso si viene en desorden o en otros idiomas, y reacomódalo perfectamente en su campo correspondiente en el JSON de salida. Nunca dejes campos en blanco si la información puede ser inferida, extraída o buscada.

REGLAS GLOBALES Y FORMATO INQUEBRANTABLE:
- Devuelve ÚNICAMENTE un JSON VÁLIDO.
- Géneros separados por barras (Ej: Drama / Comedia).
- Elenco: Máximo 4 actores en formato: Nombre del Actor (Personaje).`;

  const determinePrompt = (queryStr: string) => {
    const isRescate = queryStr.toUpperCase().includes("RESCATE");
    const isDatosApi = queryStr.toUpperCase().includes("DATOS_API");
    
    if (isRescate) {
      return `CASO B: MODO RESCATE Detectado para: "${displayQuery}". Busca exhaustivamente en Google hasta encontrar la información técnica. Determina, extrae y reacomoda meticulosamente cada dato en su campo correspondiente. Usa múltiples consultas y agota las opciones antes de decir "No encontrado". NUNCA respondas que no encontraste ningún resultado en general.`;
    } else if (isDatosApi) {
      return `CASO A: DATOS_API Detectado para: "${displayQuery}". Mapea, reorganiza y reacomoda toda la información en los campos correspondientes.`;
    } else {
      return `Aplica MODO RESCATE para: "${displayQuery}". Busca exhaustivamente en Google hasta encontrar la información técnica. Determina y reacomoda todos los campos del JSON correctamente.`;
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

  const geminiModels = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  
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

export async function fetchIconicQuote() {
  const backupQuotes = [
    { text: "Que la Fuerza te acompañe.", movie: "La Guerra de las Galaxias", character: "Han Solo" },
    { text: "Le haré una oferta que no podrá rechazar.", movie: "El Padrino", character: "Don Corleone" },
    { text: "Francamente, querida, me importa un bledo.", movie: "Lo que el viento se llevó", character: "Rhett Butler" },
    { text: "He visto cosas que vosotros no creeríais.", movie: "Blade Runner", character: "Roy Batty" },
    { text: "Siempre nos quedará París.", movie: "Casablanca", character: "Rick Blaine" },
    { text: "Me encanta el olor del napalm por la mañana.", movie: "Apocalypse Now", character: "Coronel Kilgore" },
    { text: "Hasta el infinito y más allá.", movie: "Toy Story", character: "Buzz Lightyear" },
    { text: "Mantén a tus amigos cerca, pero a tus enemigos más.", movie: "El Padrino II", character: "Michael Corleone" },
    { text: "Houston, tenemos un problema.", movie: "Apolo 13", character: "Jim Lovell" },
    { text: "Aquí está Johnny.", movie: "El Resplandor", character: "Jack Torrance" },
    { text: "Soy el rey del mundo.", movie: "Titanic", character: "Jack Dawson" },
    { text: "Volveré.", movie: "Terminator", character: "T-800" },
    { text: "La vida es como una caja de bombones.", movie: "Forrest Gump", character: "Forrest" },
    { text: "A Dios pongo por testigo que jamás volveré a pasar hambre.", movie: "Lo que el viento se llevó", character: "Scarlett O'Hara" },
    { text: "Alégrame el día.", movie: "Harry el Sucio", character: "Harry Callahan" },
    { text: "¡Estás loco! ¡Me encanta pero estás loco!", movie: "El club de la lucha", character: "Tyler Durden" },
    { text: "Puedes quitarme la vida, pero jamás nos quitarás la libertad.", movie: "Braveheart", character: "William Wallace" },
    { text: "Yo soy tu padre.", movie: "El Imperio Contraataca", character: "Darth Vader" },
    { text: "No hay lugar como el hogar.", movie: "El Mago de Oz", character: "Dorothy" }
  ];
  return backupQuotes[Math.floor(Math.random() * backupQuotes.length)];
}
