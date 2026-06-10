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
    { text: "Que la Fuerza te acompañe.", movie: "Star Wars", character: "Obi-Wan Kenobi" },
    { text: "Le haré una oferta que no podrá rechazar.", movie: "El Padrino", character: "Don Vito Corleone" },
    { text: "Francamente, querida, me importa un bledo.", movie: "Lo que el viento se llevó", character: "Rhett Butler" },
    { text: "He visto cosas que ustedes no creerían.", movie: "Blade Runner", character: "Roy Batty" },
    { text: "Siempre nos quedará París.", movie: "Casablanca", character: "Rick Blaine" },
    { text: "Me encanta el olor del napalm por la mañana.", movie: "Apocalypse Now", character: "Teniente Coronel Kilgore" },
    { text: "Al infinito... ¡y más allá!", movie: "Toy Story", character: "Buzz Lightyear" },
    { text: "Mantén a tus amigos cerca, pero a tus enemigos más cerca.", movie: "El Padrino II", character: "Michael Corleone" },
    { text: "Houston, tenemos un problema.", movie: "Apolo 13", character: "Jim Lovell" },
    { text: "¡Aquí está Johnny!", movie: "El Resplandor", character: "Jack Torrance" },
    { text: "¡Soy el rey del mundo!", movie: "Titanic", character: "Jack Dawson" },
    { text: "Volveré.", movie: "Terminator", character: "T-800" },
    { text: "La vida es como una caja de bombones.", movie: "Forrest Gump", character: "Forrest" },
    { text: "A Dios pongo por testigo que jamás volveré a pasar hambre.", movie: "Lo que el viento se llevó", character: "Scarlett O'Hara" },
    { text: "Alégrame el día.", movie: "Harry el Sucio", character: "Harry Callahan" },
    { text: "¡Estás loco! ¡Me encanta pero estás loco!", movie: "El club de la lucha", character: "Tyler Durden" },
    { text: "Puedes quitarme la vida, pero jamás nos quitarás la libertad.", movie: "Braveheart", character: "William Wallace" },
    { text: "Yo soy tu padre.", movie: "El Imperio Contraataca", character: "Darth Vader" },
    { text: "No hay lugar como el hogar.", movie: "El Mago de Oz", character: "Dorothy" },
    { text: "Todos esos momentos se perderán en el tiempo, como lágrimas en la lluvia.", movie: "Blade Runner", character: "Roy Batty" },
    { text: "Hakuna Matata. Vive y sé feliz.", movie: "El Rey León", character: "Timón y Pumba" },
    { text: "Debiste apuntar a la cabeza.", movie: "Avengers: Infinity War", character: "Thanos" },
    { text: "No sé quién eres, pero te buscaré y te mataré.", movie: "Búsqueda Implacable", character: "Bryan Mills" },
    { text: "Carpe diem. Aprovechen el día, hagan que sus vidas sean extraordinarias.", movie: "La sociedad de los poetas muertos", character: "John Keating" },
    { text: "Yo soy inevitable.", movie: "Avengers: Endgame", character: "Thanos" },
    { text: "Y yo... yo soy... Iron Man.", movie: "Avengers: Endgame", character: "Tony Stark" },
    { text: "Un gran poder conlleva una gran responsabilidad.", movie: "Spider-Man", character: "Tío Ben" },
    { text: "Mi tesoro.", movie: "El Señor de los Anillos: Las dos torres", character: "Gollum" },
    { text: "¡Está vivo! ¡Está vivo!", movie: "Frankenstein", character: "Dr. Henry Frankenstein" },
    { text: "Elemental, querido Watson.", movie: "Sherlock Holmes", character: "Sherlock Holmes" },
    { text: "¡Dile hola a mi pequeño amigo!", movie: "Cara Cortada (Scarface)", character: "Tony Montana" },
    { text: "Nadie es perfecto.", movie: "Con faldas y a lo loco", character: "Osgood Fielding III" },
    { text: "Lo que hacemos en la vida tiene su eco en la eternidad.", movie: "Gladiador", character: "Máximo Décimo Meridio" },
    { text: "O mueres como un héroe, o vives lo suficiente para verte convertido en el villano.", movie: "El Caballero Oscuro", character: "Harvey Dent" },
    { text: "No dejes que nadie te diga qué puedes hacer, ni dejes de soñar.", movie: "En busca de la felicidad", character: "Chris Gardner" },
    { text: "Si tú saltas, yo salto, ¿recuerdas?", movie: "Titanic", character: "Rose DeWitt Bukater" },
    { text: "Tengo un presentimiento de que ya no estamos en Kansas.", movie: "El Mago de Oz", character: "Dorothy" },
    { text: "La primera regla del Club de la Lucha es: no hablar del Club de la Lucha.", movie: "El club de la lucha", character: "Tyler Durden" },
    { text: "¡No puedes soportar la verdad!", movie: "Cuestión de honor", character: "Coronel Nathan R. Jessep" },
    { text: "La belleza mató a la bestia.", movie: "King Kong", character: "Carl Denham" },
    { text: "¡Corran, tontos!", movie: "El Señor de los Anillos: La comunidad del anillo", character: "Gandalf" },
    { text: "E.T., teléfono, mi casa.", movie: "E.T., el extraterrestre", character: "E.T." },
    { text: "Hasta la vista, baby.", movie: "Terminator 2", character: "T-800" },
    { text: "No soy un hombre inteligente, pero sé lo que es el amor.", movie: "Forrest Gump", character: "Forrest" },
    { text: "Buenos días... y por si no los veo luego: buenos días, buenas tardes y buenas noches.", movie: "El show de Truman", character: "Truman Burbank" },
    { text: "Recuerda, Red, la esperanza es algo bueno, tal vez lo mejor de todo, y las cosas buenas no mueren.", movie: "Sueños de fuga", character: "Andy Dufresne" },
    { text: "¡Espartanos! ¿Cuál es su oficio?", movie: "300", character: "Rey Leónidas" },
    { text: "Una mañana me desperté y me di cuenta de que todos mis sueños se habían cumplido.", movie: "El lobo de Wall Street", character: "Jordan Belfort" },
    { text: "En este mundo hay dos tipos de personas: las que tienen el revólver cargado y las que cavan. Tú cavas.", movie: "El bueno, el malo y el feo", character: "Rubio" },
    { text: "Muéstrame el dinero.", movie: "Jerry Maguire", character: "Rod Tidwell" },
    { text: "Eres un mago, Harry.", movie: "Harry Potter y la piedra filosofal", character: "Rubeus Hagrid" },
    { text: "Con cada combate te haces más fuerte, no te des por vencido.", movie: "Rocky", character: "Rocky Balboa" },
    { text: "La vida siempre se abre camino.", movie: "Parque Jurásico", character: "Dr. Ian Malcolm" },
    { text: "Prefiero haber tenido un suspiro de su pelo, un beso de su boca, un roce de su mano, que una eternidad sin ella.", movie: "City of Angels", character: "Seth" },
    { text: "A veces el camino correcto no es el más fácil.", movie: "Pocahontas", character: "Abuela Sauce" },
    { text: "Nunca olvides lo que eres, el resto del mundo no lo hará.", movie: "Juego de Tronos", character: "Tyrion Lannister" },
    { text: "No recordamos días, recordamos momentos.", movie: "Cinema Paradiso", character: "Alfredo" },
    { text: "El cine no es un arte que filma vida, el cine está entre el arte y la vida.", movie: "Jean-Luc Godard", character: "Él mismo" },
    { text: "Mi mamá dice que los milagros pasan todos los días.", movie: "Forrest Gump", character: "Forrest" },
    { text: "Cada vez que escuchas una campana, un ángel recibe sus alas.", movie: "Qué bello es vivir", character: "Zuzu Bailey" },
    { text: "Lamento que la vida no sea una película.", movie: "La La Land", character: "Mia Dolan" },
    { text: "Las despedidas son dolorosas, pero la nostalgia es peor.", movie: "Roma", character: "Cleo" },
    { text: "No quiero necesitarte porque no puedo tenerte.", movie: "Los puentes de Madison", character: "Robert Kincaid" },
    { text: "Daría cualquier cosa por haber sido tu segundo amor, porque el primero ya dolió.", movie: "Rebeca", character: "Maxim de Winter" },
    { text: "El dolor forma parte de la vida y nos ayuda a crecer.", movie: "Mente indomable", character: "Sean Maguire" },
    { text: "Solo tú puedes decidir qué hacer con el tiempo que se te ha dado.", movie: "El Señor de los Anillos: La comunidad del anillo", character: "Gandalf" },
    { text: "La vida se mueve rápido. Si no te detienes y miras a tu alrededor de vez en cuando, te la puedes perder.", movie: "Un experto en diversión (Ferris Bueller)", character: "Ferris Bueller" },
    { text: "No permitas que nadie te haga sentir que no mereces lo que quieres.", movie: "10 cosas que odio de ti", character: "Patrick Verona" },
    { text: "Eres la respuesta a todas mis plegarias.", movie: "El diario de una pasión", character: "Noah Calhoun" },
    { text: "El amor significa no tener que decir nunca lo siento.", movie: "Love Story", character: "Oliver Barrett IV" },
    { text: "A veces el mundo no necesita un héroe, a veces necesita un monstruo.", movie: "Drácula de Bram Stoker", character: "Drácula" },
    { text: "La cordura es una imperfección muy sobrevalorada.", movie: "La isla siniestra", character: "Teddy Daniels" },
    { text: "Todos los hombres mueren, pero no todos realmente viven.", movie: "Braveheart", character: "William Wallace" },
    { text: "Mejor sufrir por un amor que no haber amado nunca.", movie: "Alfred Tennyson", character: "Poeta" },
    { text: "Si buscas la perfección, jamás estarás contento.", movie: "Anna Karenina", character: "Levin" },
    { text: "El miedo es el camino hacia el Lado Oscuro. El miedo lleva a la ira, la ira al odio, el odio al sufrimiento.", movie: "Star Wars: La amenaza fantasma", character: "Yoda" },
    { text: "Nuestros nombres no importan, lo que importa es nuestro plan.", movie: "El Caballero Oscuro: La leyenda renace", character: "Bane" },
    { text: "Por muy dura que parezca la vida, mientras haya vida hay esperanza.", movie: "La teoría del todo", character: "Stephen Hawking" },
    { text: "Enterramos nuestros pecados, lavamos nuestras conciencias.", movie: "Río místico", character: "Jimmy Markum" },
    { text: "No dejes que el pasado defina tu futuro.", movie: "Ratatouille", character: "Gusteau" },
    { text: "Tu verdad es la única que importa en este teatro de mentiras.", movie: "La sociedad de los poetas muertos", character: "John Keating" },
    { text: "No somos nuestros trabajos, no somos nuestra cuenta corriente.", movie: "El club de la lucha", character: "Tyler Durden" },
    { text: "Si buscas la paz, prepárate para la guerra.", movie: "John Wick 3: Parabellum", character: "Winston" },
    { text: "Solo sé que no sé nada, decían los sabios.", movie: "Sócrates", character: "Sócrates" },
    { text: "Si vas a intentarlo, ve hasta el final. De lo contrario, ni comiences.", movie: "Factótum", character: "Henry Chinaski" },
    { text: "La felicidad solo es real cuando se comparte.", movie: "Hacia rutas salvajes", character: "Christopher McCandless" },
    { text: "Nunca odies a tus enemigos, afecta a tu juicio.", movie: "El Padrino III", character: "Michael Corleone" },
    { text: "La venganza nunca es un camino recto. Es como una fuerza de la naturaleza.", movie: "Kill Bill: Volumen 1", character: "Hattori Hanzo" },
    { text: "No llores porque terminó, sonríe porque sucedió.", movie: "El Grinch", character: "Grinch" },
    { text: "Ojo por ojo y el mundo terminará ciego.", movie: "Gandhi", character: "Mahatma Gandhi" },
    { text: "No somos dioses, somos hombres que amamos y sufrimos.", movie: "Troya", character: "Aquiles" },
    { text: "Un hombre sin miedo es un hombre sin esperanza.", movie: "Daredevil", character: "Fisk" },
    { text: "La realidad es con frecuencia decepcionante.", movie: "Avengers: Infinity War", character: "Thanos" },
    { text: "La mente es su propio lugar, y en sí misma puede hacer un cielo del infierno.", movie: "El Paraíso Perdido", character: "Narrador" },
    { text: "Yo soy el caballero de la noche, el guardián de tus sueños.", movie: "Batman", character: "Batman" },
    { text: "Nadaremos, nadaremos, en el mar, el mar, el mar...", movie: "Buscando a Nemo", character: "Dory" },
    { text: "El ayer es historia, el mañana es un misterio, el de hoy es un regalo. Por eso lo llaman presente.", movie: "Kung Fu Panda", character: "Maestro Oogway" },
    { text: "No soy un monstruo, solo voy un paso por delante de la locura.", movie: "El Caballero Oscuro", character: "Joker" },
    { text: "La lealtad es un camino de doble sentido.", movie: "Suits", character: "Harvey Specter" },
    { text: "No juzgues a un hombre por sus palabras, sino por sus acciones y sus silencios.", movie: "El Padrino", character: "Don Vito Corleone" },
    { text: "No puedes cambiar lo que eres, solo lo que haces con el tiempo.", movie: "Hellboy", character: "Hellboy" },
    { text: "El conocimiento es la mejor arma contra la oscuridad.", movie: "El código Da Vinci", character: "Robert Langdon" },
    { text: "Tengo miedo de que si te beso ahora, no podré detenerme jamás.", movie: "El diario de una pasión", character: "Noah Calhoun" },
    { text: "El amor es la única fuerza capaz de transformar a un enemigo en amigo verdadero.", movie: "Selma", character: "Martin Luther King" },
    { text: "La justicia es ciega, pero la noche todo lo ve.", movie: "Daredevil", character: "Matt Murdock" },
    { text: "Hazlo o no lo hagas, pero no lo intentes.", movie: "El Imperio Contraataca", character: "Yoda" },
    { text: "La imaginación es el arma de la guerra contra la realidad cotidiana.", movie: "Alicia en el País de las Maravillas", character: "Sombrerero Loco" },
    { text: "Nada es verdad, todo está permitido en las sombras.", movie: "Assassin's Creed", character: "Aguilar" },
    { text: "Una persona que nunca cometió un error nunca intentó nada nuevo en esta vida.", movie: "Einstein", character: "Albert" },
    { text: "Tanto si crees que puedes como si crees que no, siempre tienes razón.", movie: "Ford", character: "Henry" },
    { text: "La paciencia es una virtud de reyes.", movie: "El código Da Vinci", character: "Robert Langdon" },
    { text: "El tiempo es una ilusión, una hermosa ilusión.", movie: "Interstellar", character: "Cooper" },
    { text: "No dejes que se apague la luz de tu alma, mantén tu chispa encendida.", movie: "Soul", character: "Joe Gardner" },
    { text: "No hay preguntas tontas, sino tontos que no se atreven a preguntar.", movie: "El nombre de la rosa", character: "Guillermo de Baskerville" },
    { text: "Un gran escritor dijo una vez: 'Todos los finales son también comienzos'.", movie: "El cielo sobre Berlín", character: "Damiel" },
    { text: "El futuro no está escrito. No hay más destino que el que nosotros mismos construimos.", movie: "Terminator 2", character: "John Connor" },
    { text: "El cine es un espejo pintado que retrata la verdad del alma humana.", movie: "Cinema Paradiso", character: "Alfredo" },
    { text: "Todo pasa por una extraña pero hermosa razón.", movie: "Matrix", character: "Morfeo" },
    { text: "Sigue el camino de ladrillos amarillos.", movie: "El Mago de Oz", character: "Dorothy" },
    { text: "No te fíes de nadie, ni de tu propia sombra.", movie: "Sospechosos habituales", character: "Keyser Söze" },
    { text: "La risa es el mejor remedio para curar un corazón roto.", movie: "Patch Adams", character: "Patch Adams" },
    { text: "El respeto se gana en el asfalto, no se exige.", movie: "Training Day", character: "Alonzo Harris" },
    { text: "Un hombre fuerte no necesita ser de hierro, basta con tener voluntad.", movie: "El gigante de hierro", character: "Hogarth" },
    { text: "Si eres bueno en algo, jamás lo hagas gratis.", movie: "El Caballero Oscuro", character: "Joker" }
  ];
  return backupQuotes[Math.floor(Math.random() * backupQuotes.length)];
}
