import { Movie, Quote } from "../types";

export async function catalogMovie(query: string, searchYear?: string): Promise<Partial<Movie>> {
  try {
    const response = await fetch('/api/catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, searchYear })
    });

    if (!response.ok) {
      const errorData = await response.json();
      const status = response.status;
      if (status === 403) {
        throw new Error("Acceso denegado: Usa la App desde el entorno permitido o verifica las credenciales.");
      }
      if (status === 429 || errorData.error?.includes("exceeded your current quota") || errorData.error?.includes("429")) {
        throw new Error("La Inteligencia Artificial está saturada en este momento (Límite Gratuito). Por favor, espera 1 minuto y vuelve a dar clic en sincronizar.");
      }
      throw new Error(`Error en el servidor de IA: ${errorData.error || response.statusText}`);
    }

    return await response.json();
  } catch (apiError: any) {
    console.error("API Error encountered:", apiError);
    throw apiError;
  }
}

export async function fetchIconicQuote(): Promise<Quote> {
  const backupQuotes: Quote[] = [
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

