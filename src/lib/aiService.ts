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

export async function fetchIconicQuote() {
  const backupQuotes = [
    { text: "Le haré una oferta que no podrá rechazar.", movie: "El padrino", character: "Don Vito Corleone" },
    { text: "Mantén a tus amigos cerca, pero a tus enemigos más cerca.", movie: "El padrino 2", character: "Michael Corleone" },
    { text: "Saluda a mi pequeño amigo.", movie: "Caracortada", character: "Tony Montana" },
    { text: "La vida es como una caja de chocolates.", movie: "Forrest Gump", character: "Forrest Gump" },
    { text: "La primera regla del club de la pelea es no hablar del club de la pelea.", movie: "El club de la pelea", character: "Tyler Durden" },
    { text: "¡Aquí está Johnny!", movie: "El resplandor", character: "Jack Torrance" },
    { text: "¿Qué es la Matrix?", movie: "Matrix", character: "Morfeo" },
    { text: "¡No pasarás!", movie: "El señor de los anillos: La comunidad del anillo", character: "Gandalf" },
    { text: "Mi tesoro.", movie: "El señor de los anillos: Las dos torres", character: "Gollum" },
    { text: "No puedo cargarlo por ti, pero sí puedo cargarte a ti.", movie: "El retorno del rey", character: "Sam Gamyi" },
    { text: "Eres un mago, Harry.", movie: "Harry Potter y la piedra filosofal", character: "Hagrid" },
    { text: "Que la Fuerza te acompañe.", movie: "Star Wars IV", character: "Obi-Wan Kenobi" },
    { text: "Yo soy tu padre.", movie: "Star Wars V", character: "Darth Vader" },
    { text: "Hazlo o no lo hagas. Pero no lo intentes.", movie: "Star Wars VI", character: "Yoda" },
    { text: "Así es como muere la libertad: con un estruendoso aplauso.", movie: "Star Wars III", character: "Padmé" },
    { text: "La vida siempre se abre camino.", movie: "Parque Jurásico", character: "Ian Malcolm" },
    { text: "Volveré.", movie: "El exterminador", character: "T-800" },
    { text: "Hasta la vista, baby.", movie: "Terminator 2", character: "T-800" },
    { text: "En el espacio, nadie puede oír tus gritos.", movie: "Alien", character: "Lema de la película" },
    { text: "Aléjate de ella, perra.", movie: "Aliens", character: "Ellen Ripley" },
    { text: "¿Me estás hablando a mí?", movie: "Taxi Driver", character: "Travis Bickle" },
    { text: "No importa qué tan fuerte golpees, sino cuánto puedes resistir.", movie: "Rocky", character: "Rocky" },
    { text: "Lo que hacemos en vida tiene eco en la eternidad.", movie: "Gladiador", character: "Máximo" },
    { text: "¡Libertad!", movie: "Corazón valiente", character: "William Wallace" },
    { text: "Quien salva una vida, salva al mundo entero.", movie: "La lista de Schindler", character: "Oskar Schindler" },
    { text: "Buenos días, princesa.", movie: "La vida es bella", character: "Guido" },
    { text: "Me encanta el olor del napalm por la mañana.", movie: "Apocalipsis ahora Redux", character: "Kilgore" },
    { text: "Siempre nos quedará París.", movie: "Casablanca", character: "Rick Blaine" },
    { text: "El Dude permanece.", movie: "El gran Lebowski", character: "El Dude" },
    { text: "Que yo recuerde, siempre quise ser un gánster.", movie: "Buenos muchachos", character: "Henry Hill" },
    { text: "En este negocio, debes confiar en alguien.", movie: "Casino", character: "Sam Rothstein" },
    { text: "No somos producto de nuestro entorno.", movie: "El club de la pelea", character: "Tyler Durden" },
    { text: "No tengo nada que perder.", movie: "Fuego contra fuego", character: "Neil McCauley" },
    { text: "El rey Kong no tiene nada conmigo.", movie: "Día de entrenamiento", character: "Alonzo Harris" },
    { text: "La venganza nunca es un camino recto.", movie: "Kill Bill: Volumen 1", character: "Hattori Hanzo" },
    { text: "¿Por qué no subes a la mesa?", movie: "Bastardos sin gloria", character: "Hans Landa" },
    { text: "¿Por qué tan serio?", movie: "Batman: El caballero de la noche", character: "Joker" },
    { text: "Solía pensar que mi vida era una tragedia.", movie: "Guasón", character: "Arthur Fleck" },
    { text: "Yo soy Batman.", movie: "Batman", character: "Bruce Wayne" },
    { text: "¿Por qué nos caemos?", movie: "Batman comienza", character: "Bruce Wayne" },
    { text: "Yo soy Iron Man.", movie: "Iron Man", character: "Tony Stark" },
    { text: "¡Hulk aplasta!", movie: "Los Vengadores", character: "Hulk" },
    { text: "Wakanda por siempre.", movie: "Pantera negra", character: "T’Challa" },
    { text: "¿A dónde vamos? No necesitamos carreteras.", movie: "Volver al futuro", character: "Doc Brown" },
    { text: "¡Qué desperdicio de un día tan hermoso!", movie: "Eterno resplandor de una mente sin recuerdos", character: "Joel Barish" },
    { text: "¡Soy el rey del mundo!", movie: "Titanic", character: "Jack Dawson" },
    { text: "Si tú saltas, yo salto, ¿recuerdas?", movie: "Titanic", character: "Rose" },
    { text: "Francamente, querida, me importa un bledo.", movie: "Lo que el viento se llevó", character: "Rhett Butler" },
    { text: "A Dios pongo por testigo que jamás volveré a pasar hambre.", movie: "Lo que el viento se llevó", character: "Scarlett O’Hara" },
    { text: "Houston, tenemos un problema.", movie: "Apolo 13", character: "Jim Lovell" },
    { text: "Alégrame el día.", movie: "Harry el Sucio", character: "Harry Callahan" },
    { text: "No sé quién eres, pero te buscaré y te mataré.", movie: "Búsqueda implacable", character: "Bryan Mills" },
    { text: "Carpe diem. Aprovechen el día.", movie: "La sociedad de los poetas muertos", character: "John Keating" },
    { text: "Yo soy inevitable.", movie: "Avengers: Endgame", character: "Thanos" },
    { text: "Y yo... yo soy... Iron Man.", movie: "Avengers: Endgame", character: "Tony Stark" },
    { text: "Un gran poder conlleva una gran responsabilidad.", movie: "El hombre araña", character: "Tío Ben" },
    { text: "¡Está vivo! ¡Está vivo!", movie: "Frankenstein", character: "Henry Frankenstein" },
    { text: "Elemental, querido Watson.", movie: "Sherlock Holmes", character: "Sherlock Holmes" },
    { text: "O mueres como un héroe, o vives lo suficiente para verte convertido en el villano.", movie: "Batman: El caballero de la noche", character: "Harvey Dent" },
    { text: "No dejes que nadie te diga qué puedes hacer.", movie: "En busca de la felicidad", character: "Chris Gardner" },
    { text: "¡No puedes soportar la verdad!", movie: "Cuestión de honor", character: "Nathan Jessep" },
    { text: "La belleza mató a la bestia.", movie: "King Kong", character: "Carl Denham" },
    { text: "¡Corran, tontos!", movie: "El señor de los anillos: La comunidad del anillo", character: "Gandalf" },
    { text: "E.T., teléfono, mi casa.", movie: "E.T., el extraterrestre", character: "E.T." },
    { text: "No soy un hombre inteligente, pero sé lo que es el amor.", movie: "Forrest Gump", character: "Forrest" },
    { text: "¡Espartanos! ¿Cuál es su oficio?", movie: "300", character: "Leónidas" },
    { text: "En este mundo hay dos tipos de personas: las que tienen el revólver cargado y las que cavan.", movie: "El bueno, el malo y el feo", character: "Rubio" },
    { text: "Muéstrame el dinero.", movie: "Jerry Maguire", character: "Rod Tidwell" },
    { text: "Con cada combate te haces más fuerte.", movie: "Rocky", character: "Rocky Balboa" },
    { text: "Hakuna Matata. Vive y sé feliz.", movie: "El rey león", character: "Timón y Pumba" },
    { text: "He visto cosas que ustedes no creerían.", movie: "Blade Runner", character: "Roy Batty" },
    { text: "Todos esos momentos se perderán en el tiempo, como lágrimas en la lluvia.", movie: "Blade Runner", character: "Roy Batty" },
    { text: "La esperanza es algo bueno, quizá lo mejor de todo.", movie: "Sueño de fuga", character: "Andy Dufresne" },
    { text: "Veo gente muerta.", movie: "El sexto sentido", character: "Cole Sear" },
    { text: "Estoy cansado, jefe.", movie: "Milagros inesperados", character: "John Coffey" },
    { text: "Vanidad, definitivamente mi pecado favorito.", movie: "El abogado del diablo", character: "John Milton" },
    { text: "¡Oh capitán, mi capitán!", movie: "La sociedad de los poetas muertos", character: "John Keating" },
    { text: "Buenos días, y por si no nos vemos luego…", movie: "Historia de una vida", character: "Truman Burbank" },
    { text: "Nuestras vidas se definen por las oportunidades.", movie: "El curioso caso de Benjamin Button", character: "Benjamin Button" },
    { text: "Tengo una voz.", movie: "El discurso del rey", character: "Jorge VI" },
    { text: "¡Wilson!", movie: "Náufrago", character: "Chuck Noland" },
    { text: "¿Quieres saber por qué?", movie: "Troya", character: "Aquiles" },
    { text: "Teniente Dunbar.", movie: "Danza con lobos", character: "John Dunbar" },
    { text: "Yo no maté a mi esposa.", movie: "El fugitivo", character: "Richard Kimble" },
    { text: "La gente no está lista para saber la verdad.", movie: "Hombres de negro", character: "Kay" },
    { text: "El peligro es mi profesión.", movie: "Mentiras verdaderas", character: "Harry Tasker" },
    { text: "¡Suelta la mano!", movie: "Depredador", character: "Dutch" },
    { text: "Yippee-ki-yay, hijo de puta.", movie: "Duro de matar", character: "John McClane" },
    { text: "Dar cera, pulir cera.", movie: "El karate kid", character: "Miyagi" },
    { text: "Nadie pone a Baby en un rincón.", movie: "Baile caliente", character: "Johnny Castle" },
    { text: "Tú eres la que quiero.", movie: "Vaselina", character: "Danny Zuko" },
    { text: "Quiero el cuento de hadas.", movie: "Mujer bonita", character: "Vivian Ward" },
    { text: "Odio cómo me hablas y tu corte de cabello.", movie: "10 cosas que odio de ti", character: "Kat Stratford" },
    { text: "Los miércoles usamos rosa.", movie: "Chicas pesadas", character: "Regina George" },
    { text: "¿Florales? ¿Para primavera? Innovador.", movie: "El diablo viste a la moda", character: "Miranda Priestly" },
    { text: "El mundo no es una fábrica de conceder deseos.", movie: "Bajo la misma estrella", character: "Augustus Waters" },
    { text: "Eres la respuesta a todas mis plegarias.", movie: "El diario de una pasión", character: "Noah Calhoun" },
    { text: "Tengo miedo de que si te beso ahora, no podré detenerme jamás.", movie: "El diario de una pasión", character: "Noah Calhoun" },
    { text: "El amor significa no tener que decir nunca lo siento.", movie: "Historia de amor", character: "Oliver Barrett IV" },
    { text: "Hay algunos peces que no se pueden atrapar.", movie: "El gran pez", character: "Edward Bloom" },
    { text: "¡Es la hora del espectáculo!", movie: "Beetlejuice", character: "Beetlejuice" },
    { text: "¿Qué es esto?", movie: "El extraño mundo de Jack", character: "Jack Skellington" },
    { text: "Con esta mano, levantaré tu copa.", movie: "El cadáver de la novia", character: "Victor" },
    { text: "¡Manten el cambio, sucio animal!", movie: "Mi pobre angelito", character: "Kevin McCallister" },
    { text: "¡Fenomenal cósmica!", movie: "Aladdin", character: "Genio" },
    { text: "¡No soy un monstruo!", movie: "La bella y la bestia", character: "Bestia" },
    { text: "¡Almas de los muertos, levántense!", movie: "Hércules", character: "Hades" },
    { text: "No hay ingrediente secreto.", movie: "Kung Fu Panda", character: "Po" },
    { text: "¡Muevan las patas!", movie: "Madagascar", character: "Rey Julien" },
    { text: "¡Zing!", movie: "Hotel Transylvania", character: "Drácula" },
    { text: "¡Banana!", movie: "Minions", character: "Kevin" },
    { text: "¡Hasta el infinito y más allá!", movie: "Toy Story 3", character: "Buzz Lightyear" },
    { text: "Recuerda quién eres.", movie: "El rey león", character: "Mufasa" },
    { text: "Los ogros son como las cebollas.", movie: "Shrek", character: "Shrek" },
    { text: "EVA.", movie: "WALL-E", character: "WALL-E" },
    { text: "Gracias por la aventura. Ahora ve a buscar una nueva.", movie: "Up", character: "Carl" },
    { text: "Sigue nadando.", movie: "Buscando a Nemo", character: "Dory" },
    { text: "La velocidad. Soy velocidad.", movie: "Cars", character: "Rayo McQueen" },
    { text: "No me gusta la arena.", movie: "Star Wars II", character: "Anakin Skywalker" },
    { text: "Nunca me digas las probabilidades.", movie: "Han Solo", character: "Han Solo" },
    { text: "Dime, ¿sangras? Lo harás.", movie: "Batman vs. Superman", character: "Batman" },
    { text: "Si no eres nada sin el traje, no deberías tenerlo.", movie: "Spider-Man: De regreso a casa", character: "Tony Stark" },
    { text: "¡Arriba, arriba y lejos!", movie: "Superman", character: "Superman" },
    { text: "El ayer es historia, el mañana es un misterio y el hoy es un regalo.", movie: "Kung Fu Panda", character: "Oogway" },
    { text: "No soy un monstruo, solo voy un paso por delante de la locura.", movie: "Batman: El caballero de la noche", character: "Joker" },
    { text: "No juzgues a un hombre por sus palabras, sino por sus acciones.", movie: "El padrino", character: "Don Vito Corleone" },
    { text: "El conocimiento es la mejor arma contra la oscuridad.", movie: "El código Da Vinci", character: "Robert Langdon" },
    { text: "La paciencia es una virtud de reyes.", movie: "El código Da Vinci", character: "Robert Langdon" },
    { text: "El amor es la única fuerza capaz de transformar a un enemigo en amigo.", movie: "Selma", character: "Martin Luther King" },
    { text: "La justicia es ciega, pero la noche todo lo ve.", movie: "Daredevil", character: "Matt Murdock" },
    { text: "Nada es verdad, todo está permitido.", movie: "Assassin’s Creed", character: "Aguilar" },
    { text: "El tiempo es una ilusión, una hermosa ilusión.", movie: "Interestelar", character: "Cooper" },
    { text: "No hay preguntas tontas, sino tontos que no se atreven a preguntar.", movie: "El nombre de la rosa", character: "Guillermo de Baskerville" },
    { text: "El futuro no está escrito.", movie: "Terminator 2", character: "John Connor" },
    { text: "No recuerdo días, recuerdo momentos.", movie: "Cinema Paradiso", character: "Alfredo" },
    { text: "Todo pasa por una extraña pero hermosa razón.", movie: "Matrix", character: "Morfeo" },
    { text: "No te fíes de nadie, ni de tu propia sombra.", movie: "Sospechosos comunes", character: "Keyser Söze" },
    { text: "La risa es el mejor remedio para curar un corazón roto.", movie: "Patch Adams", character: "Patch Adams" },
    { text: "El respeto se gana en el asfalto, no se exige.", movie: "Día de entrenamiento", character: "Alonzo Harris" },
    { text: "Un hombre fuerte no necesita ser de hierro, basta con tener voluntad.", movie: "El gigante de hierro", character: "Hogarth" },
    { text: "Si eres bueno en algo, jamás lo hagas gratis.", movie: "Batman: El caballero de la noche", character: "Joker" },
    { text: "La cordura es una imperfección muy sobrevalorada.", movie: "La isla siniestra", character: "Teddy Daniels" },
    { text: "Si buscas la paz, prepárate para la guerra.", movie: "John Wick 3", character: "Winston" },
    { text: "La felicidad solo es real cuando se comparte.", movie: "Camino salvaje", character: "Christopher McCandless" },
    { text: "Nunca odies a tus enemigos, afecta a tu juicio.", movie: "El padrino 3", character: "Michael Corleone" },
    { text: "No llores porque terminó, sonríe porque sucedió.", movie: "El Grinch", character: "El Grinch" },
    { text: "Ojo por ojo y el mundo terminará ciego.", movie: "Gandhi", character: "Mahatma Gandhi" },
    { text: "No somos dioses, somos hombres que amamos y sufrimos.", movie: "Troya", character: "Aquiles" },
    { text: "La mente es su propio lugar.", movie: "El paraíso perdido", character: "Narrador" },
    { text: "El miedo es una enfermedad.", movie: "Apocalypto", character: "Jaguar Paw" }
  ];
  return backupQuotes[Math.floor(Math.random() * backupQuotes.length)];
}
