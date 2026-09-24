import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";

export function sanitizeMovieData(rawData: any): any {
  if (!rawData || typeof rawData !== 'object') {
    rawData = {};
  }

  // Map Spanish key names back to standard Movie interface keys if the IA responded in Spanish
  const rawSeason = rawData.season 
    ?? rawData.temporada 
    ?? rawData.temporadas 
    ?? rawData.seasons 
    ?? rawData.numero_temporadas 
    ?? rawData["Temporadas :"] 
    ?? rawData["Temporadas:"] 
    ?? rawData["Temporadas "] 
    ?? rawData["Temporadas"] 
    ?? rawData["Temporada :"] 
    ?? rawData["Temporada:"] 
    ?? rawData["Temporada"] 
    ?? rawData["📺 Temporadas :"] 
    ?? rawData["📺 Temporadas:"] 
    ?? rawData["📺 Temporada :"] 
    ?? rawData["📺 Temporada:"] 
    ?? rawData["📺 Temporada"] 
    ?? rawData["📺 Temporadas"] 
    ?? "";

  let cleanSeason = String(rawSeason || "").trim();
  cleanSeason = cleanSeason.replace(/^(📺\s*)?(Temporadas?|TEMPORADAS?)\s*:?\s*/i, "").trim();

  let cleanDuration = String(rawData.duration ?? rawData.duracion ?? rawData.length ?? rawData["Capítulos y Duración"] ?? rawData["⏱️ Capítulos y Duración:"] ?? rawData["⏱️ Capítulos y Duración"] ?? rawData["capitulos_y_duracion"] ?? "").trim();
  cleanDuration = cleanDuration.replace(/^(⏱️\s*)?(Capítulos\s*y\s*Duración|Duración)\s*:?\s*/i, "").trim();

  let reqSection = rawData.section ?? rawData.seccion_destino ?? rawData.pestana_destino ?? rawData.pestaña_destino ?? "";
  if (!reqSection || (reqSection === "peliculas" && cleanSeason)) {
    if (cleanSeason) {
      reqSection = "series";
    }
  }

  const mapped: any = {
    title: rawData.title ?? rawData.titulo ?? rawData.title_es ?? rawData.display_title ?? "",
    originalTitle: rawData.originalTitle ?? rawData.titulo_original ?? rawData.original_title ?? "",
    year: Number(rawData.year ?? rawData.año ?? rawData.anio ?? rawData.year_released ?? 0) || 0,
    rating: Number(rawData.rating ?? rawData.calificacion ?? rawData.rating_global ?? rawData.score ?? 0) || 0,
    duration: cleanDuration,
    country: rawData.country ?? rawData.pais ?? rawData.country_of_origin ?? "",
    director: rawData.director ?? rawData.dirección ?? rawData.direction ?? "",
    genre: rawData.genre ?? rawData.genero ?? rawData.género ?? "",
    ageRating: rawData.ageRating ?? rawData.clasificacion ?? rawData.clasificación ?? rawData.rating_age ?? "",
    format: rawData.format ?? rawData.formato ?? rawData["Formato y Edición"] ?? rawData["📀 Formato y Edición:"] ?? rawData["📀 Formato y Edición"] ?? rawData.formato_y_edicion ?? "",
    poster: rawData.poster ?? rawData.imagen ?? rawData.poster_url ?? "",
    synopsis: rawData.synopsis ?? rawData.sinopsis ?? rawData.argumento ?? "",
    cast: Array.isArray(rawData.cast ?? rawData.elenco ?? rawData.actores ?? rawData["Elenco Principal"] ?? rawData["👥 Elenco Principal"]) 
      ? (rawData.cast ?? rawData.elenco ?? rawData.actores ?? rawData["Elenco Principal"] ?? rawData["👥 Elenco Principal"]) 
      : (typeof (rawData.cast ?? rawData.elenco ?? rawData.actores ?? rawData["Elenco Principal"] ?? rawData["👥 Elenco Principal"]) === 'string'
        ? (rawData.cast ?? rawData.elenco ?? rawData.actores ?? rawData["Elenco Principal"] ?? rawData["👥 Elenco Principal"]).split(/[,/]+/).map((a: string) => a.trim()).filter(Boolean)
        : []),
    script: rawData.script ?? rawData.guion ?? rawData.guión ?? "",
    music: rawData.music ?? rawData.banda_sonora ?? rawData.música ?? rawData.musica ?? "",
    photography: rawData.photography ?? rawData.fotografia ?? rawData.fotografía ?? "",
    companies: rawData.companies ?? rawData.estudio ?? rawData.compania ?? rawData.compañía ?? rawData.estudios ?? rawData.productora ?? rawData["Estudio / Productora"] ?? rawData["🏢 Estudio / Productora"] ?? "",
    reviews: rawData.reviews ?? rawData.reseñas ?? rawData.critica ?? rawData.crítica ?? "",
    awards: rawData.awards ?? rawData.premios ?? "",
    estante: rawData.estante ?? rawData.seccion ?? rawData.sección ?? rawData.ubicacion ?? rawData.ubicación ?? rawData["Sección (Localización)"] ?? rawData["📚 Sección (Localización)"] ?? rawData["Estante (Localización)"] ?? rawData["📚 Estante (Localización)"] ?? "",
    season: cleanSeason,
    section: reqSection
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

const NATIVE_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
const OPENROUTER_MODELS = [
  "google/gemini-2.5-flash:free",
  "google/gemini-2.5-flash-lite:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free"
];
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.3-70b-specdec",
  "llama-3.1-70b-versatile"
];
const SAMBANOVA_MODELS = [
  "Meta-Llama-3.3-70B-Instruct",
  "Meta-Llama-3.1-70B-Instruct",
  "Meta-Llama-3.1-405B-Instruct"
];
let currentPriorityModel = "gemini-2.5-flash";

export const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- GESTIÓN DE ADMINISTRADORES Y EDITORES EN SERVIDOR (Garantiza acceso multi-dispositivo sin bloqueos por cuota) ---
const ADMINS_FILE = path.join(process.cwd(), "admins-registry.json");
const DELETED_ADMINS_FILE = path.join(process.cwd(), "deleted-admins.json");

function loadDeletedAdminIds(): string[] {
  try {
    if (fs.existsSync(DELETED_ADMINS_FILE)) {
      const raw = fs.readFileSync(DELETED_ADMINS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Error leyendo deleted-admins.json:", e);
  }
  return [];
}

function saveDeletedAdminIds(ids: string[]) {
  try {
    fs.writeFileSync(DELETED_ADMINS_FILE, JSON.stringify(ids, null, 2), "utf-8");
  } catch (e) {
    console.warn("Error guardando deleted-admins.json:", e);
  }
}

// --- REGISTRO DE ADMINISTRADOR PRINCIPAL Y EDITORES (Persistencia y Sincronización) ---
const PRIMARY_ADMIN_FILE = path.join(process.cwd(), "primary-admin.json");

function loadPrimarySuperAdmin(): string {
  try {
    if (fs.existsSync(PRIMARY_ADMIN_FILE)) {
      const raw = fs.readFileSync(PRIMARY_ADMIN_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.email === 'string' && parsed.email.trim()) {
        return parsed.email.trim().toLowerCase();
      }
    }
  } catch (e) {
    console.warn("Error leyendo primary-admin.json:", e);
  }
  return "chapceligg@gmail.com";
}

function savePrimarySuperAdmin(email: string) {
  try {
    fs.writeFileSync(PRIMARY_ADMIN_FILE, JSON.stringify({ email: email.trim().toLowerCase(), updatedAt: new Date().toISOString() }, null, 2), "utf-8");
  } catch (e) {
    console.warn("Error guardando primary-admin.json:", e);
  }
}

const DEFAULT_PERSISTENT_ADMINS: any[] = [
  {
    id: "chapceligg@gmail.com",
    email: "chapceligg@gmail.com",
    role: "admin",
    name: "Alex Cárdenas",
    createdAt: "2026-09-17T20:29:42.431Z",
    updatedAt: "2026-09-22T17:57:55.347Z"
  },
  {
    id: "uriel.cardenas@udgvirtual.udg.mx",
    email: "uriel.cardenas@udgvirtual.udg.mx",
    role: "editor",
    name: "Uriel Cárdenas",
    createdAt: "2026-09-18T19:36:07.784Z",
    updatedAt: "2026-09-23T16:51:40.205Z"
  },
  {
    id: "lizbeth.hernandez@udgvirtual.udg.mx",
    email: "lizbeth.hernandez@udgvirtual.udg.mx",
    role: "editor",
    name: "lizbeth hernandez",
    createdAt: "2026-09-21T19:28:27.162Z",
    updatedAt: "2026-09-22T17:37:40.371Z"
  }
];

function loadServerAdmins(): any[] {
  const primary = loadPrimarySuperAdmin();
  const deletedSet = new Set(loadDeletedAdminIds());
  deletedSet.delete(primary);

  const map = new Map<string, any>();

  // 1. Cargar administradores base predeterminados (garantía anti-pérdida)
  for (const def of DEFAULT_PERSISTENT_ADMINS) {
    const key = def.email.toLowerCase().trim();
    if (!deletedSet.has(key)) {
      map.set(key, { ...def });
    }
  }

  // 2. Cargar y combinar archivo admins-registry.json si existe
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const raw = fs.readFileSync(ADMINS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const key = (item.email || item.id || "").toLowerCase().trim();
          if (key && !deletedSet.has(key)) {
            const existing = map.get(key);
            if (!existing) {
              map.set(key, { ...item, id: key, email: key });
            } else {
              const itemTime = item.updatedAt || item.createdAt || "";
              const existTime = existing.updatedAt || existing.createdAt || "";
              const base = itemTime >= existTime ? { ...existing, ...item } : { ...item, ...existing };
              const existingName = (existing.name || "").trim();
              const incomingName = (item.name || "").trim();
              const finalName = incomingName || existingName;
              map.set(key, { ...base, id: key, email: key, name: finalName });
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Error leyendo admins-registry.json:", e);
  }

  // Asegurar que el Administrador Principal siempre tenga rol admin
  const primaryAdmin = map.get(primary) || {
    id: primary,
    email: primary,
    role: "admin",
    name: primary.split("@")[0],
    createdAt: new Date().toISOString()
  };
  primaryAdmin.role = "admin";
  map.set(primary, primaryAdmin);

  const result = Array.from(map.values());
  return result;
}

function saveServerAdmins(admins: any[]) {
  try {
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2), "utf-8");
  } catch (e) {
    console.warn("Error guardando admins-registry.json:", e);
  }
}

// Clientes conectados a la sincronización en tiempo real (SSE: Server-Sent Events, 0 lecturas de cuota)
const adminStreamClients = new Set<express.Response>();

function getActiveAdminsList(): any[] {
  const admins = loadServerAdmins();
  const deleted = new Set(loadDeletedAdminIds());
  const primary = loadPrimarySuperAdmin();
  // El Administrador Principal jamás puede figurar como eliminado
  deleted.delete(primary);
  deleted.delete("chapceligg@gmail.com");
  return admins.filter(a => !deleted.has((a.email || a.id || "").trim().toLowerCase()));
}

function broadcastAdminsUpdate() {
  const active = getActiveAdminsList();
  const payload = JSON.stringify({
    type: "admins_update",
    admins: active,
    primarySuperAdmin: loadPrimarySuperAdmin(),
    timestamp: new Date().toISOString()
  });

  for (const client of adminStreamClients) {
    try {
      client.write(`event: admins_update\ndata: ${payload}\n\n`);
    } catch (_) {
      adminStreamClients.delete(client);
    }
  }
}

// Endpoint de eventos en tiempo real (SSE) para sincronizar altas, bajas y cambios en cualquier dispositivo (0 lecturas Firestore)
app.get("/api/admins/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  // Relleno inicial de 2KB para forzar el vaciado de buffers intermedios (Nginx, Cloud Run)
  res.write(`: ${" ".repeat(2048)}\n\n`);

  // Enviar estado actual de inmediato al conectar
  const active = getActiveAdminsList();
  res.write(`event: admins_update\ndata: ${JSON.stringify({ type: "admins_update", admins: active, primarySuperAdmin: loadPrimarySuperAdmin(), timestamp: new Date().toISOString() })}\n\n`);

  adminStreamClients.add(res);

  // Ping periódico cada 15s para mantener activo el canal y evitar caídas en redes móviles
  const pingInterval = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (_) {
      clearInterval(pingInterval);
      adminStreamClients.delete(res);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(pingInterval);
    adminStreamClients.delete(res);
  });
});

app.get("/api/primary-admin", (req, res) => {
  res.json({ email: loadPrimarySuperAdmin() });
});

app.post("/api/primary-admin", (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  const current = (req.body?.current || "").trim().toLowerCase();
  const keepPrevious = req.body?.keepPrevious !== false;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Email inválido" });
  }
  savePrimarySuperAdmin(email);

  // Asegurar que el primary super admin esté registrado en admins
  let admins = loadServerAdmins();
  const deleted = loadDeletedAdminIds().filter(d => d !== email);
  saveDeletedAdminIds(deleted);

  const idx = admins.findIndex(a => (a.email || a.id || "").trim().toLowerCase() === email);
  if (idx > -1) {
    admins[idx].role = "admin";
  } else {
    admins.unshift({
      id: email,
      email,
      role: "admin",
      name: "",
      createdAt: new Date().toISOString()
    });
  }

  // Si el anterior primary admin estaba registrado, mantenerlo si keepPrevious es true, o removerlo si es false (edición)
  if (current && current !== email) {
    if (keepPrevious) {
      const curIdx = admins.findIndex(a => (a.email || a.id || "").trim().toLowerCase() === current);
      if (curIdx > -1) {
        admins[curIdx].role = "admin";
      }
    } else {
      admins = admins.filter(a => (a.email || a.id || "").trim().toLowerCase() !== current);
      const delList = loadDeletedAdminIds();
      if (!delList.includes(current)) {
        delList.push(current);
        saveDeletedAdminIds(delList.slice(-500));
      }
    }
  }

  saveServerAdmins(admins);
  broadcastAdminsUpdate();
  res.json({ success: true, email });
});

app.get("/api/admins", (req, res) => {
  const active = getActiveAdminsList();
  res.json(active);
});

app.get("/api/admins/deleted", (req, res) => {
  const ids = loadDeletedAdminIds();
  res.json(ids);
});

app.get("/api/admins/check/:email", (req, res) => {
  const email = (req.params.email || "").trim().toLowerCase();
  if (!email) {
    return res.json({ isAdmin: false });
  }

  const primary = loadPrimarySuperAdmin();
  if (email === primary || email === "chapceligg@gmail.com") {
    const admins = loadServerAdmins();
    const primaryMatch = admins.find(a => (a.email || a.id || "").trim().toLowerCase() === email);
    return res.json({ 
      isAdmin: true, 
      role: "admin", 
      name: primaryMatch?.name || "Alex Cárdenas"
    });
  }

  const deleted = new Set(loadDeletedAdminIds());
  if (deleted.has(email)) {
    return res.json({ isAdmin: false, deleted: true });
  }

  const admins = loadServerAdmins();
  const match = admins.find(a => (a.email || a.id || "").trim().toLowerCase() === email);
  if (match) {
    return res.json({ 
      isAdmin: true, 
      role: match.role || "editor", 
      name: match.name || ""
    });
  }
  return res.json({ isAdmin: false });
});

app.post("/api/admins", (req, res) => {
  const adminData = req.body;
  if (!adminData || (!adminData.email && !adminData.id)) {
    return res.status(400).json({ error: "Datos de administrador incompletos" });
  }
  const email = (adminData.email || adminData.id).trim().toLowerCase();
  
  // Si se vuelve a agregar o editar, quitar de la lista de eliminados
  const deletedIds = loadDeletedAdminIds().filter(id => id !== email);
  saveDeletedAdminIds(deletedIds);

  const admins = loadServerAdmins();
  const idx = admins.findIndex(a => (a.email || a.id || "").trim().toLowerCase() === email);
  const existingName = (idx > -1 ? (admins[idx].name || "") : "").trim();
  const incomingName = (adminData.name !== undefined ? String(adminData.name) : "").trim();
  const finalName = incomingName || existingName;

  const updatedEntry = {
    ...(idx > -1 ? admins[idx] : {}),
    ...adminData,
    id: email,
    email: email,
    name: finalName,
    role: adminData.role || (idx > -1 ? admins[idx].role : "editor"),
    updatedAt: new Date().toISOString()
  };
  if (idx > -1) {
    admins[idx] = updatedEntry;
  } else {
    admins.push(updatedEntry);
  }
  saveServerAdmins(admins);
  broadcastAdminsUpdate();
  res.json({ success: true, admin: updatedEntry });
});

app.post("/api/admins/sync", (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) {
    return res.status(400).json({ error: "Se esperaba un array de administradores" });
  }
  const primary = loadPrimarySuperAdmin();
  const deletedSet = new Set(loadDeletedAdminIds());
  deletedSet.delete(primary);

  const current = loadServerAdmins();
  const map = new Map<string, any>();
  for (const a of current) {
    const key = (a.email || a.id || "").trim().toLowerCase();
    if (key && !deletedSet.has(key)) map.set(key, a);
  }
  for (const item of list) {
    const key = (item.email || item.id || "").trim().toLowerCase();
    if (key && !deletedSet.has(key)) {
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...item, id: key, email: key });
      } else {
        const itemTime = item.updatedAt || item.createdAt || "";
        const existTime = existing.updatedAt || existing.createdAt || "";
        const base = itemTime >= existTime ? { ...existing, ...item } : { ...item, ...existing };
        const existingName = (existing.name || "").trim();
        const incomingName = (item.name || "").trim();
        const finalName = incomingName || existingName;
        map.set(key, { ...base, id: key, email: key, name: finalName });
      }
    }
  }
  if (!map.has(primary)) {
    map.set(primary, {
      id: primary,
      email: primary,
      role: "admin",
      name: primary.split("@")[0]
    });
  }
  const merged = Array.from(map.values());
  saveServerAdmins(merged);
  broadcastAdminsUpdate();
  res.json({ success: true, count: merged.length });
});

app.delete("/api/admins/:email", (req, res) => {
  const email = (req.params.email || "").trim().toLowerCase();
  const primary = loadPrimarySuperAdmin();
  if (email === primary) {
    return res.status(403).json({ error: "No se puede eliminar el Super Admin Principal" });
  }
  // Registrar en lista de eliminados para propagar a otros dispositivos
  const deletedIds = loadDeletedAdminIds();
  if (!deletedIds.includes(email)) {
    deletedIds.push(email);
    saveDeletedAdminIds(deletedIds.slice(-500));
  }

  const admins = loadServerAdmins().filter(a => (a.email || a.id || "").trim().toLowerCase() !== email);
  saveServerAdmins(admins);
  broadcastAdminsUpdate();
  res.json({ success: true });
});

// --- REGISTRO Y SINCRONIZACIÓN DE PELÍCULAS EN TIEMPO REAL (0 LECTURAS FIRESTORE) ---
const MOVIES_FILE = path.join(process.cwd(), "movies-registry.json");
const moviesStreamClients = new Set<express.Response>();

function loadServerMovies(): any[] {
  try {
    if (fs.existsSync(MOVIES_FILE)) {
      const raw = fs.readFileSync(MOVIES_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Error leyendo movies-registry.json:", e);
  }
  return [];
}

function saveServerMovies(movies: any[]) {
  try {
    fs.writeFileSync(MOVIES_FILE, JSON.stringify(movies, null, 2), "utf-8");
  } catch (e) {
    console.warn("Error guardando movies-registry.json:", e);
  }
}

function getActiveMoviesList(): any[] {
  const movies = loadServerMovies();
  const deleted = new Set(loadDeletedMovieIds());
  return movies.filter(m => m && m.id && !deleted.has(m.id));
}

function broadcastMoviesUpdate(eventType: string, payload: any) {
  const data = JSON.stringify({
    type: eventType,
    data: payload,
    timestamp: new Date().toISOString()
  });

  for (const client of moviesStreamClients) {
    try {
      client.write(`event: ${eventType}\ndata: ${data}\n\n`);
    } catch (_) {
      moviesStreamClients.delete(client);
    }
  }
}

// Endpoint de streaming en tiempo real para películas (0 lecturas Firestore)
app.get("/api/movies/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  // Relleno inicial para forzar flujo en Nginx y Cloud Run
  res.write(`: ${" ".repeat(2048)}\n\n`);
  res.write(`event: connected\ndata: {}\n\n`);

  moviesStreamClients.add(res);

  const pingInterval = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (_) {
      clearInterval(pingInterval);
      moviesStreamClients.delete(res);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(pingInterval);
    moviesStreamClients.delete(res);
  });
});

app.get("/api/movies", (req, res) => {
  const active = getActiveMoviesList();
  res.json(active);
});

app.post("/api/movies", (req, res) => {
  const movie = req.body;
  if (!movie || !movie.id) {
    return res.status(400).json({ error: "Película inválida o sin ID" });
  }

  // Quitar de deleted-movies si se vuelve a crear o editar
  const deleted = loadDeletedMovieIds().filter(id => id !== movie.id);
  saveDeletedMovieIds(deleted);

  const movies = loadServerMovies();
  const idx = movies.findIndex(m => m && m.id === movie.id);
  const nowIso = new Date().toISOString();
  const updatedMovie = {
    ...movie,
    updatedAt: movie.updatedAt || nowIso
  };

  if (idx > -1) {
    movies[idx] = { ...movies[idx], ...updatedMovie };
  } else {
    movies.unshift(updatedMovie);
  }

  saveServerMovies(movies);
  broadcastMoviesUpdate("movie_upsert", updatedMovie);
  res.json({ success: true, movie: updatedMovie });
});

app.post("/api/movies/sync", (req, res) => {
  const clientMovies = req.body;
  if (!Array.isArray(clientMovies)) {
    return res.status(400).json({ error: "Se esperaba un array de películas" });
  }

  const deletedSet = new Set(loadDeletedMovieIds());
  const serverMovies = loadServerMovies();
  const map = new Map<string, any>();

  // Cargar películas del servidor
  for (const m of serverMovies) {
    if (m && m.id && !deletedSet.has(m.id)) {
      map.set(m.id, m);
    }
  }

  // Fusionar con películas del cliente respetando la versión más reciente
  let updatedCount = 0;
  for (const cm of clientMovies) {
    if (!cm || !cm.id || deletedSet.has(cm.id)) continue;
    const existing = map.get(cm.id);
    if (!existing) {
      map.set(cm.id, cm);
      updatedCount++;
    } else {
      const serverTime = existing.updatedAt || existing.createdAt || "";
      const clientTime = cm.updatedAt || cm.createdAt || "";
      if (clientTime > serverTime) {
        map.set(cm.id, { ...existing, ...cm });
        updatedCount++;
      } else {
        map.set(cm.id, { ...cm, ...existing });
      }
    }
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const timeA = a.createdAt || a.updatedAt || "";
    const timeB = b.createdAt || b.updatedAt || "";
    return timeB.localeCompare(timeA);
  });

  saveServerMovies(merged);
  if (updatedCount > 0) {
    broadcastMoviesUpdate("movies_update", { count: merged.length });
  }
  res.json({ success: true, count: merged.length, movies: merged });
});

app.delete("/api/movies/:id", (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "ID requerido" });

  const deleted = loadDeletedMovieIds();
  if (!deleted.includes(id)) {
    deleted.push(id);
    saveDeletedMovieIds(deleted.slice(-1000));
  }

  const movies = loadServerMovies().filter(m => m && m.id !== id);
  saveServerMovies(movies);
  broadcastMoviesUpdate("movie_deleted", { id });
  res.json({ success: true });
});

// --- REGISTRO DE PELÍCULAS ELIMINADAS (Sincronización multi-dispositivo sin lecturas Firestore) ---
const DELETED_MOVIES_FILE = path.join(process.cwd(), "deleted-movies.json");

function loadDeletedMovieIds(): string[] {
  try {
    if (fs.existsSync(DELETED_MOVIES_FILE)) {
      const raw = fs.readFileSync(DELETED_MOVIES_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Error leyendo deleted-movies.json:", e);
  }
  return [];
}

function saveDeletedMovieIds(ids: string[]) {
  try {
    fs.writeFileSync(DELETED_MOVIES_FILE, JSON.stringify(ids, null, 2), "utf-8");
  } catch (e) {
    console.warn("Error guardando deleted-movies.json:", e);
  }
}

app.get("/api/movies/deleted", (req, res) => {
  const ids = loadDeletedMovieIds();
  res.json(ids);
});

app.post("/api/movies/deleted", (req, res) => {
  const { id, ids } = req.body || {};
  const current = loadDeletedMovieIds();
  const setIds = new Set(current);
  if (id && typeof id === "string") setIds.add(id);
  if (Array.isArray(ids)) {
    for (const item of ids) {
      if (item && typeof item === "string") setIds.add(item);
    }
  }
  const updated = Array.from(setIds).slice(-1000);
  saveDeletedMovieIds(updated);

  const movies = loadServerMovies().filter(m => m && m.id && !setIds.has(m.id));
  saveServerMovies(movies);
  broadcastMoviesUpdate("movies_update", { count: movies.length });
  res.json({ success: true, count: updated.length, deleted: updated });
});

   app.post("/api/catalog", async (req, res) => {
    try {
      const { query, searchYear } = req.body;
      const displayQuery = searchYear ? `${query} (${searchYear})` : query;
      
      const cleanKey = (k: string) => {
        if (!k) return "";
        const stripped = k.trim().replace(/^['"]|['"]$/g, "");
        if (stripped === "MY_GEMINI_API_KEY" || stripped === "undefined" || stripped === '""') return "";
        return stripped;
      };

      const finalGemini = cleanKey(process.env.GEMINI_API_KEY || "");
      const finalOpenRouter = cleanKey(process.env.OPENROUTER_API_KEY || "");
      const finalGroq = cleanKey(process.env.GROQ_API_KEY || "");
      const finalSambaNova = cleanKey(process.env.SAMBANOVA_API_KEY || "");
      const finalUser = cleanKey(process.env.USER_API_KEY || "");

      let geminiKey = finalGemini;
      let openRouterKey = finalOpenRouter;
      let groqKey = finalGroq;
      let sambanovaKey = finalSambaNova;

      if (finalUser) {
        if (finalUser.startsWith("AIza")) {
          if (!geminiKey) geminiKey = finalUser;
        } else if (finalUser.startsWith("gsk_")) {
          if (!groqKey) groqKey = finalUser;
        } else if (finalUser.startsWith("sn-") || (finalUser.length === 36 && finalUser.includes("-"))) {
          if (!sambanovaKey) sambanovaKey = finalUser;
        } else {
          if (!openRouterKey) openRouterKey = finalUser;
        }
      }

      if (!geminiKey && !openRouterKey && !groqKey && !sambanovaKey) {
        return res.status(500).json({ error: "No se ha configurado ninguna API Key para la Inteligencia Artificial. Por favor, define USER_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, SAMBANOVA_API_KEY u OPENROUTER_API_KEY en tu entorno o panel de configuración." });
      }

      const systemInstruction = `Eres el motor automatizado de catalogación y crítico cinematográfico de una mediateca de alto nivel. Tu objetivo es procesar las entradas del usuario y devolver una ficha técnica perfectamente estructurada para exportación automática, manteniendo siempre un estándar de redacción limpio, moderno y premium.

REGLA DE FORMATO DE ENTRADA OBLIGATORIA:
Debes respetar de forma rigurosa y absoluta la información y estructura en que se suben los multipegados y las nuevas entradas. Tu tarea principal consiste únicamente en clasificar, mapear y reordenar fidedignamente la información introducida en los correspondientes campos de la ficha, sin omitir, alterar ni descartar ningún dato provisto por el usuario.

REGLAS DE BÚSQUEDA PROFUNDA (Prioridad: Google Search):
1. DEPENDENCIA TOTAL DE BÚSQUEDA: Tu herramienta principal y obligatoria es Google Search. Debes encontrar datos REALES y COMPLETOS. Está PROHIBIDO omitir campos.
2. PROHIBIDO RENDIRSE: Si no hay resultados iniciales, reformula la búsqueda (ej. título original, director, país).
3. RESOLUCIÓN DE AMBIGÜEDADES: Si hay remakes, usa el año proporcionado.
4. CERO INTERVENCIÓN HUMANA: No hagas preguntas. Selecciona la fuente más confiable (IMDb, FilmAffinity, Wikipedia).
5. CERO INVENCIÓN Y RIGOR DE DATOS: Bajo ninguna circunstancia debes inventar, fabricar o alucinar datos técnicos (como director, guionista, fotógrafo, compositor, productora, casting o premios) si no están en la entrada ni se encuentran en la web. Si un dato no existe o no se puede hallar como verídico, coloca "No disponible" o "No encontrado". Está terminantemente prohibido inventar nombres ficticios o rellenar de forma inventiva.
6. PRIORIDAD ABSOLUTA DEL INPUT DEL USUARIO: Debes realizar una lectura y escaneo exhaustivos de la información entregada por el usuario. Si el usuario ya suministró datos técnicos válidos (por ejemplo, el director exacto, el formato, la localización en estante, etc.), DEBES conservar esos valores exactamente como el usuario los especificó, dándoles prioridad total e indestructible sobre cualquier búsqueda externa de internet.

El usuario te enviará la información en dos formatos:
CASO A: DATOS DE API (Contiene "DATOS_API") -> Transforma y enriquece.
CASO B: MODO RESCATE (Contiene "RESCATE") -> Búsqueda profunda obligatoria.

REGLAS GLOBALES Y FORMATO INQUEBRANTABLE:
- Devuelve ÚNICAMENTE un JSON VÁLIDO.
- Géneros separados por barras (Ej: Drama / Comedia).
- Elenco: Máximo 4 actores. Está PROHIBIDO usar "(Personaje)" o "(Voz)". Solo escribe los nombres de los actores (de preferencia) o con sus personajes de la trama real si se conocen exactamente.`;

      const aiResultParse = (rawText: string) => {
        const parsed = extractAndParseJSON(rawText);
        return sanitizeMovieData(parsed);
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
          cast: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lista de 3 a 5 actores principales con personaje" },
          music: { type: Type.STRING, description: "Compositor de la música" },
          photography: { type: Type.STRING, description: "Director de fotografía" },
          companies: { type: Type.STRING, description: "Productora o estudio principal" },
          genre: { type: Type.STRING, description: "Géneros separados por barras" },
          synopsis: { type: Type.STRING, description: "Sinopsis completa y sin spoilers" },
          poster: { type: Type.STRING, description: "URL de imagen jpg o png de alta calidad" },
          reviews: { type: Type.STRING, description: "Resumen de la crítica consensuada" },
          awards: { type: Type.STRING, description: "Principales premios ganados" },
          ageRating: { type: Type.STRING, description: "Clasificación de edad (Ej: B15, R, PG-13)" },
          format: { type: Type.STRING, description: "Formato físico o digital de la película" },
          estante: { type: Type.STRING, description: "Ubicación o estante físico de la mediateca" },
          season: { type: Type.STRING, description: "Temporada o temporadas si es serie (ej: 'Primera y única', 'Temporada 1', etc.)" },
          section: { type: Type.STRING, description: "Pestaña de destino: 'series', 'centauro' o 'peliculas'" }
        },
        required: ["title", "originalTitle", "year", "rating", "duration", "country", "director", "script", "cast", "music", "photography", "companies", "genre", "synopsis", "poster", "reviews", "awards", "ageRating", "format", "estante"]
      };

      let catalogSuccess = false;
      let finalResult = null;
      let lastError = "Exhausted all available providers";

      // 1. Definimos las ejecuciones específicas de cada proveedor
      const executeGemini = async () => {
        const nativePriority = currentPriorityModel === "google/gemini-2.5-flash:free"
          ? "gemini-2.5-flash"
          : (currentPriorityModel === "google/gemini-2.5-flash-lite:free" ? "gemini-3.1-flash-lite" : currentPriorityModel);

        const nativeToTry = [
          nativePriority,
          ...NATIVE_MODELS.filter(m => m !== nativePriority)
        ].filter(m => NATIVE_MODELS.includes(m));

        let localError = "No native models could respond";
        for (const gModel of nativeToTry) {
          let retryCount = 0;
          const maxRetries = 1;
          while (retryCount <= maxRetries) {
            try {
              console.log(`Intentando Gemini Nativo (${gModel}) para: ${displayQuery}`);
              const ai = new GoogleGenAI({
                apiKey: geminiKey,
                httpOptions: {
                  headers: { 'User-Agent': 'aistudio-build' }
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
              if (text) {
                const parsed = aiResultParse(text);
                currentPriorityModel = gModel;
                console.log(`¡Éxito! El modelo [${gModel}] el Gemini respondió correctamente. Establecido como nueva prioridad.`);
                return parsed;
              }
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

              console.error(`Google Gemini Nativo (${gModel}) falló en catalog:`, googleError.message);
              localError = googleError.message;
              
              if (isQuotaExceeded) {
                console.warn("Cuota de Gemini nativo agotada. Saltando fase Gemini...");
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
              break; // Mover al siguiente modelo nativo
            }
          }
        }
        throw new Error(localError);
      };

      const executeGroq = async () => {
        const callGroq = async (model: string) => {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${groqKey}`,
              "Content-Type": "application/json"
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
  "format": "string",
  "estante": "string"
}

Si un dato no existe, usa "" (o 0 si es numérico, o [] para 'cast'). Responde SOLAMENTE con un objeto JSON válido, sin delimitadores extra.` }
              ],
              response_format: { type: "json_object" }
            })
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Groq Error ${response.status}`);
          }
          const result = await response.json();
          if (result.error) {
            throw new Error(result.error.message || "Groq internal provider error");
          }
          return result;
        };

        const groqPriority = GROQ_MODELS.includes(currentPriorityModel)
          ? currentPriorityModel
          : "llama-3.3-70b-versatile";

        const groqToTry = [
          groqPriority,
          ...GROQ_MODELS.filter(m => m !== groqPriority)
        ].filter(m => GROQ_MODELS.includes(m));

        let localError = "No Groq models could respond";
        for (const model of groqToTry) {
          try {
            console.log(`Intentando modelo Groq en catalog: ${model}`);
            const completion = await callGroq(model);
            const text = completion.choices?.[0]?.message?.content;
            if (!text || text.trim() === "" || text.trim() === "[]" || text.trim() === "{}") {
              throw new Error("Vacío o resultado inválido de Groq");
            }
            const parsed = aiResultParse(text);
            currentPriorityModel = model;
            console.log(`¡Éxito! El modelo [${model}] en Groq respondió correctamente. Establecido como nueva prioridad.`);
            return parsed;
          } catch (err: any) {
            console.warn(`Modelo Groq ${model} falló en catalog:`, err.message);
            localError = err.message;
          }
        }
        throw new Error(localError);
      };

      const executeOpenRouter = async () => {
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

        const openRouterPriority = currentPriorityModel === "gemini-2.5-flash" || currentPriorityModel === "gemini-3.5-flash"
          ? "google/gemini-2.5-flash:free"
          : (currentPriorityModel === "gemini-3.1-flash-lite" ? "google/gemini-2.5-flash-lite:free" : currentPriorityModel);

        const openRouterToTry = [
          openRouterPriority,
          ...OPENROUTER_MODELS.filter(m => m !== openRouterPriority)
        ].filter(m => OPENROUTER_MODELS.includes(m));
        
        let localError = "No OpenRouter models could respond";
        for (const model of openRouterToTry) {
          try {
            console.log(`Intentando modelo OpenRouter en catalog: ${model}`);
            const completion = await callOpenRouter(model);
            const text = completion.choices?.[0]?.message?.content;
            if (!text || text.trim() === "" || text.trim() === "[]" || text.trim() === "{}") {
               throw new Error("Vacío o resultado inválido de OpenRouter");
            }
            const parsed = aiResultParse(text);
            currentPriorityModel = model;
            console.log(`¡Éxito! El modelo [${model}] respondió correctamente en OpenRouter. Establecido como nueva prioridad.`);
            return parsed;
          } catch (err: any) {
            console.warn(`Modelo OpenRouter ${model} falló en catalog:`, err.message);
            localError = err.message;
          }
        }
        throw new Error(localError);
      };

      const executeSambaNova = async () => {
        const callSambaNova = async (model: string) => {
          const response = await fetch("https://api.sambanova.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${sambanovaKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: `${customPrompt}\nAplica los reacomodos técnicos explicados de forma estricta. Devuelve única y estrictamente el JSON.` }
              ],
              temperature: 0.1
            })
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `SambaNova Error ${response.status}`);
          }
          const result = await response.json();
          if (result.error) {
            throw new Error(result.error.message || "SambaNova internal provider error");
          }
          return result;
        };

        const sambanovaPriority = SAMBANOVA_MODELS.includes(currentPriorityModel)
          ? currentPriorityModel
          : "Meta-Llama-3.3-70B-Instruct";

        const sambanovaToTry = [
          sambanovaPriority,
          ...SAMBANOVA_MODELS.filter(m => m !== sambanovaPriority)
        ].filter(m => SAMBANOVA_MODELS.includes(m));

        let localError = "No SambaNova models could respond";
        for (const model of sambanovaToTry) {
          try {
            console.log(`Intentando modelo SambaNova en catalog: ${model}`);
            const completion = await callSambaNova(model);
            const text = completion.choices?.[0]?.message?.content;
            if (!text || text.trim() === "" || text.trim() === "[]" || text.trim() === "{}") {
               throw new Error("Vacío o resultado inválido de SambaNova");
            }
            const parsed = aiResultParse(text);
            currentPriorityModel = model;
            console.log(`¡Éxito! El modelo [${model}] en SambaNova respondió correctamente. Establecido como nueva prioridad.`);
            return parsed;
          } catch (err: any) {
            console.warn(`Modelo SambaNova ${model} falló en catalog:`, err.message);
            localError = err.message;
          }
        }
        throw new Error(localError);
      };

      // 2. Armamos la cola secuencial dándole prioridad al proveedor correspondiente al modelo prioritario actual
      const phases: { name: string; hasKey: boolean; execute: () => Promise<any> }[] = [
        {
          name: "gemini",
          hasKey: !!geminiKey,
          execute: executeGemini
        },
        {
          name: "groq",
          hasKey: !!groqKey,
          execute: executeGroq
        },
        {
          name: "sambanova",
          hasKey: !!sambanovaKey,
          execute: executeSambaNova
        },
        {
          name: "openrouter",
          hasKey: !!openRouterKey,
          execute: executeOpenRouter
        }
      ];

      phases.sort((a, b) => {
        if (!a.hasKey && b.hasKey) return 1;
        if (a.hasKey && !b.hasKey) return -1;
        if (!a.hasKey && !b.hasKey) return 0;

        const isAPriority = 
          (a.name === "gemini" && NATIVE_MODELS.includes(currentPriorityModel)) ||
          (a.name === "groq" && GROQ_MODELS.includes(currentPriorityModel)) ||
          (a.name === "sambanova" && SAMBANOVA_MODELS.includes(currentPriorityModel)) ||
          (a.name === "openrouter" && OPENROUTER_MODELS.includes(currentPriorityModel));

        const isBPriority = 
          (b.name === "gemini" && NATIVE_MODELS.includes(currentPriorityModel)) ||
          (b.name === "groq" && GROQ_MODELS.includes(currentPriorityModel)) ||
          (b.name === "sambanova" && SAMBANOVA_MODELS.includes(currentPriorityModel)) ||
          (b.name === "openrouter" && OPENROUTER_MODELS.includes(currentPriorityModel));

        if (isAPriority && !isBPriority) return -1;
        if (!isAPriority && isBPriority) return 1;
        return 0;
      });

      for (const phase of phases) {
        if (!phase.hasKey) continue;
        try {
          console.log(`Iniciando Fase secuencial de catalogación: ${phase.name}`);
          finalResult = await phase.execute();
          catalogSuccess = true;
          break;
        } catch (phaseError: any) {
          console.warn(`Fase de catalogación ${phase.name} falló:`, phaseError.message);
          lastError = phaseError.message;
        }
      }

      if (catalogSuccess && finalResult) {
        return res.json(finalResult);
      }

      return res.status(500).json({ error: lastError || "No se pudo obtener información de ningún proveedor disponible." });
    } catch (error: any) {
      console.error("API Error en catalog:", error);
      
      let clientErrorMsg = error.message || "Unknown error";
      if (error.status === 429 || clientErrorMsg.includes("429") || clientErrorMsg.includes("quota")) {
        clientErrorMsg = "La Inteligencia Artificial base (Gemini) ha agotado su cuota gratuita de Google. Para cambiar a otra alternativa, configura un OPENROUTER_API_KEY o un GROQ_API_KEY.";
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
      
      const cleanKey = (k: string) => {
        if (!k) return "";
        const stripped = k.trim().replace(/^['"]|['"]$/g, "");
        if (stripped === "MY_GEMINI_API_KEY" || stripped === "undefined" || stripped === '""') return "";
        return stripped;
      };

      const finalGemini = cleanKey(process.env.GEMINI_API_KEY || "");
      const finalOpenRouter = cleanKey(process.env.OPENROUTER_API_KEY || "");
      const finalGroq = cleanKey(process.env.GROQ_API_KEY || "");
      const finalSambaNova = cleanKey(process.env.SAMBANOVA_API_KEY || "");
      const finalUser = cleanKey(process.env.USER_API_KEY || "");

      let geminiKey = finalGemini;
      let openRouterKey = finalOpenRouter;
      let groqKey = finalGroq;
      let sambanovaKey = finalSambaNova;

      if (finalUser) {
        if (finalUser.startsWith("AIza")) {
          if (!geminiKey) geminiKey = finalUser;
        } else if (finalUser.startsWith("gsk_")) {
          if (!groqKey) groqKey = finalUser;
        } else if (finalUser.startsWith("sn-") || (finalUser.length === 36 && finalUser.includes("-"))) {
          if (!sambanovaKey) sambanovaKey = finalUser;
        } else {
          if (!openRouterKey) openRouterKey = finalUser;
        }
      }

      if (!geminiKey && !openRouterKey && !groqKey && !sambanovaKey) {
        return res.status(500).json({ error: "No se ha configurado ninguna API Key para batch-parse." });
      }

      const prompt = `IMPORTANTE - MODO REORDENACIÓN ULTRA ESTRICTA Y FIDEDIGNA: El usuario no desea búsquedas externas, alucinaciones o invención de datos. Tu ÚNICA Y EXCLUSIVA tarea es leer el texto provisto por el usuario, extraer de él los datos y reorganizarlos/clasificarlos de forma fidedigna y literal al 100% en un JSON válido estructurando los campos correspondientes. Está TERMINANTEMENTE PROHIBIDO alucinar, inventar, omitir campos o rellenar de forma diferente a lo que el usuario ha redactado en su texto. Debes mapear los datos exactamente igual a como vienen descritos.

REGLA DE CONSERVACIÓN TOTAL:
Debes procesar y extraer todos y cada uno de los campos presentes en el texto del usuario (tanto de películas convencionales, colección Centauro como de series de televisión). No tienes permitido omitir ningún atributo ni dejarlo en blanco o como "No disponible" si el texto de origen sí tiene un valor concreto para ese campo.

DICCIONARIO DE MAPEO OBLIGATORIO DE ENTRADA A CAMPOS JSON:
Deberás mapear exactamente los siguientes campos presentes en la entrada a sus respectivas propiedades JSON indicadas:
1. "Póster" o "🖼️ Póster" (URL o enlace de imagen TMDB/IMDb) -> mapéalo a "poster" (conserva la URL íntegra).
2. "Título Mediateca" o "Título Español" o "Título Videoteca" o "🎬 Título Mediateca" o "🎬 Título Español" o "🎬 Título Videoteca" o encabezados con "### [NÚMERO] [TÍTULO] (TEMPORADA X)" -> mapéalo a "title" (IMPORTANTE: si incluye temporada o subtítulo en la entrada, consérvalo tal cual; ELIMINA el emoji "⚠️" si está presente, dejando el título limpio).
3. "Título Original" o "🏷️ Título Original" -> mapéalo a "originalTitle".
4. "Año" o "📅 Año" -> mapéalo a "year" (extrae el número entero).
5. "Rating Global" o "⭐ Rating Global" -> mapéalo a "rating" (extrae el número decimal de calificación, por ejemplo de "8.5 /10 IMDb" extrae 8.5).
6. "Género" o "🎭 Género" -> mapéalo a "genre" (conserva el listado o redacción del usuario).
7. "Temporadas :" o "Temporadas:" o "Temporadas" o "Temporada:" o "Temporada" o "📺 Temporadas :" o "📺 Temporadas:" o "📺 Temporada:" o "📺 Temporada" -> mapéalo obligatoriamente a "season" (conserva exactamente el texto literal tras los dos puntos, ej: "Primera y única", "Temporada 1", "Temporadas 1 a 3", "2 Temporadas", etc. NUNCA lo omitas si el texto lo menciona).
8. "Capítulos y Duración" o "⏱️ Capítulos y Duración" o "Temporada y Duración" o "📺 Temporada y Duración" o "Duración" o "⏱️ Duración" -> mapéalo a "duration" (conserva el texto literal original, ej: "13 Capítulos / 45 min", "Temporada 1 / 8 Capítulos / 50 min" o "155 minutos").
9. "País" o "🌍 País" -> mapéalo a "country" (conserva el texto literal).
10. "Clasificación" o "🔞 Clasificación" -> mapéalo a "ageRating" (ej: "A", "B", "B15", "C").
11. "Guion" o "Guión" o "✍️ Guion" -> mapéalo a "script" (conserva los nombres de guionistas de forma literal).
12. "Formato y Edición" o "Formato" o "📀 Formato y Edición" o "📺 Formato" -> mapéalo a "format" (ej: "BLU-RAY (1 Original)", "DVD (4 discos - Copia)", "DVD (3 Copia)", "BLU-RAY Original", "DVD Copia" o "No disponible").
13. "Dirección" o "🎬 Dirección" -> mapéalo a "director" (conserva el nombre literal. Elimina cualquier "Nota:" o "Nota de consistencia:").
14. "Banda Sonora" o "Música" o "🎵 Banda Sonora" -> mapéalo a "music" (conserva el compositor literal).
15. "Fotografía" o "📸 Fotografía" -> mapéalo a "photography" (conserva el director de foto literal).
16. "Estudio / Productora" o "Estudio" o "🏢 Estudio / Productora" o "🏢 Estudio" -> mapéalo a "companies" (conserva el estudio/productora literal).
17. "Sección (Localización)" o "Estante (Localización)" o "Estante" o "📚 Sección (Localización)" o "📚 Estante (Localización)" -> mapéalo a "estante" (conserva la localización/sección literal).
18. "Elenco Principal" o "Elenco" o "👥 Elenco Principal" o "👥 Elenco" -> mapéalo a "cast" (ponlo en array de strings. Extrae EXCLUSIVAMENTE los nombres literales que te proporciono).
19. "Sinopsis" o "Sinopsis:" -> mapéalo a "synopsis" (conserva la redacción íntegra).
20. "Reseñas críticas" o "Reseñas críticas:" -> mapéalo a "reviews" (conserva el consenso íntegro).
21. "Premios históricos" o "Premios históricos:" -> mapéalo a "awards" (conserva los premios íntegros).
22. "Pestaña destino" / "section": Si en la entrada se indica [PESTAÑA DESTINO: SERIES] o si los datos corresponden a una serie con temporadas/capítulos, asigna "section": "series" (o "centauro" si se especifica CENTAURO, o "peliculas").

REGLA DE NOTAS:
IMPORTANTE: Elimina y descarta cualquier texto que empiece con "Nota:", "Notas:", o "(Nota de consistencia:" en cualquiera de los campos. Extrae EXCLUSIVAMENTE el valor correspondiente del atributo.

Cada objeto del array dentro del JSON final debe tener EXACTAMENTE la siguiente estructura y tipos de campos:
[
  {
    "title": "...",
    "originalTitle": "...",
    "year": 0,
    "rating": 0,
    "season": "...",
    "duration": "...",
    "country": "...",
    "director": "...",
    "script": "...",
    "cast": ["..."],
    "music": "...",
    "photography": "...",
    "companies": "...",
    "genre": "...",
    "synopsis": "...",
    "poster": "...",
    "reviews": "...",
    "awards": "...",
    "ageRating": "...",
    "format": "...",
    "estante": "...",
    "section": "peliculas"
  }
]

Responde ÚNICAMENTE con un array de JSON válido. Cero texto o explicaciones antes o después del JSON.

Texto a procesar:
${text}`;

      let jsonText = "";
      let batchSuccess = false;
      let lastError = "Exhausted all batch-parse providers";

      const executeGemini = async () => {
        const responseSchema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Título en español / México" },
              originalTitle: { type: Type.STRING, description: "Título original" },
              year: { type: Type.INTEGER, description: "Año de lanzamiento" },
              rating: { type: Type.NUMBER, description: "Calificación de la obra de 0 a 10" },
              season: { type: Type.STRING, description: "Temporada de la serie (ej: Primera y única, Temporada 1)" },
              duration: { type: Type.STRING, description: "Duración o Capítulos y Duración (ej: 13 Capítulos / 45 min o 120 min)" },
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
              estante: { type: Type.STRING, description: "Ubicación o estante físico de la mediateca" },
              section: { type: Type.STRING, description: "Pestaña de destino: 'series', 'centauro' o 'peliculas'" }
            },
            required: ["title", "originalTitle", "year", "rating", "duration", "country", "director", "script", "cast", "music", "photography", "companies", "genre", "synopsis", "poster", "reviews", "awards", "ageRating", "format", "estante"]
          }
        };

        const nativePriority = currentPriorityModel === "google/gemini-2.5-flash:free"
          ? "gemini-2.5-flash"
          : (currentPriorityModel === "google/gemini-2.5-flash-lite:free" ? "gemini-3.1-flash-lite" : currentPriorityModel);

        const nativeToTry = [
          nativePriority,
          ...NATIVE_MODELS.filter(m => m !== nativePriority)
        ].filter(m => NATIVE_MODELS.includes(m));

        let localError = "No native models could respond";
        for (const gModel of nativeToTry) {
          let retryCount = 0;
          const maxRetries = 1;
          while (retryCount <= maxRetries) {
            try {
              console.log(`Intentando Gemini Nativo (${gModel}) en batch-parse`);
              const ai = new GoogleGenAI({
                apiKey: geminiKey,
                httpOptions: {
                  headers: { 'User-Agent': 'aistudio-build' }
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
              currentPriorityModel = gModel;
              console.log(`¡Éxito! El modelo [${gModel}] en batch responded correctamente. Establecido como nueva prioridad.`);
              return response.text.replace(/```json/g, "").replace(/```/g, "").trim();
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

              console.error(`Batch parsing with Gemini (${gModel}) failed:`, err.message);
              localError = err.message;

              if (isQuotaExceeded) {
                console.warn("Cuota de Gemini nativo agotada en batch-parse. Saltando fase Gemini...");
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
              break; // Mover al siguiente modelo nativo
            }
          }
        }
        throw new Error(localError);
      };

      const executeGroq = async () => {
        const callGroq = async (model: string) => {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${groqKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: "user", content: prompt }],
              response_format: { type: "json_object" }
            })
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Groq Error ${response.status}`);
          }
          const result = await response.json();
          if (result.error) {
            throw new Error(result.error.message || "Groq internal provider error");
          }
          return result;
        };

        const groqPriority = GROQ_MODELS.includes(currentPriorityModel)
          ? currentPriorityModel
          : "llama-3.3-70b-versatile";

        const groqToTry = [
          groqPriority,
          ...GROQ_MODELS.filter(m => m !== groqPriority)
        ].filter(m => GROQ_MODELS.includes(m));

        let localError = "No Groq models could respond";
        for (const model of groqToTry) {
          try {
            console.log(`Intentando modelo Groq en batch: ${model}`);
            const completion = await callGroq(model);
            const textResponse = completion.choices?.[0]?.message?.content;
            if (!textResponse || textResponse.trim() === "" || textResponse.trim() === "[]" || textResponse.trim() === "{}") {
              throw new Error("Vacío o resultado inválido de Groq");
            }
            currentPriorityModel = model;
            console.log(`¡Éxito! El modelo [${model}] en Groq respondió correctamente en batch. Establecido como nueva prioridad.`);
            return textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
          } catch (err: any) {
            console.warn(`Modelo Groq ${model} falló en batch:`, err.message);
            localError = err.message;
          }
        }
        throw new Error(localError);
      };

      const executeOpenRouter = async () => {
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

        const openRouterPriority = currentPriorityModel === "gemini-2.5-flash" || currentPriorityModel === "gemini-3.5-flash"
          ? "google/gemini-2.5-flash:free"
          : (currentPriorityModel === "gemini-3.1-flash-lite" ? "google/gemini-2.5-flash-lite:free" : currentPriorityModel);

        const openRouterToTry = [
          openRouterPriority,
          ...OPENROUTER_MODELS.filter(m => m !== openRouterPriority)
        ].filter(m => OPENROUTER_MODELS.includes(m));
        
        let localError = "No OpenRouter models could respond";
        for (const model of openRouterToTry) {
          try {
            console.log(`Intentando modelo OpenRouter en batch: ${model}`);
            const completion = await callOpenRouter(model);
            const textResponse = completion.choices?.[0]?.message?.content;
            if (!textResponse || textResponse.trim() === "" || textResponse.trim() === "[]" || textResponse.trim() === "{}") {
               throw new Error("Vacío o resultado inválido de OpenRouter");
            }
            currentPriorityModel = model;
            console.log(`¡Éxito! El modelo [${model}] respondió correctamente en OpenRouter. Establecido como nueva prioridad.`);
            return textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
          } catch (err: any) {
            console.warn(`Modelo OpenRouter ${model} falló en batch:`, err.message);
            localError = err.message;
          }
        }
        throw new Error(localError);
      };

      const executeSambaNova = async () => {
        const callSambaNova = async (model: string) => {
          const response = await fetch("https://api.sambanova.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${sambanovaKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "user", content: prompt }
              ],
              temperature: 0.1
            })
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `SambaNova Error ${response.status}`);
          }
          const result = await response.json();
          if (result.error) {
            throw new Error(result.error.message || "SambaNova internal provider error");
          }
          return result;
        };

        const sambanovaPriority = SAMBANOVA_MODELS.includes(currentPriorityModel)
          ? currentPriorityModel
          : "Meta-Llama-3.3-70B-Instruct";

        const sambanovaToTry = [
          sambanovaPriority,
          ...SAMBANOVA_MODELS.filter(m => m !== sambanovaPriority)
        ].filter(m => SAMBANOVA_MODELS.includes(m));

        let localError = "No SambaNova models could respond";
        for (const model of sambanovaToTry) {
          try {
            console.log(`Intentando modelo SambaNova en batch: ${model}`);
            const completion = await callSambaNova(model);
            const textResponse = completion.choices?.[0]?.message?.content;
            if (!textResponse || textResponse.trim() === "" || textResponse.trim() === "[]" || textResponse.trim() === "{}") {
               throw new Error("Vacío o resultado inválido de SambaNova");
            }
            currentPriorityModel = model;
            console.log(`¡Éxito! El modelo [${model}] en SambaNova respondió correctamente en batch. Establecido como nueva prioridad.`);
            return textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
          } catch (err: any) {
            console.warn(`Modelo SambaNova ${model} falló en batch:`, err.message);
            localError = err.message;
          }
        }
        throw new Error(localError);
      };

      const phases: { name: string; hasKey: boolean; execute: () => Promise<string> }[] = [
        {
          name: "gemini",
          hasKey: !!geminiKey,
          execute: executeGemini
        },
        {
          name: "groq",
          hasKey: !!groqKey,
          execute: executeGroq
        },
        {
          name: "sambanova",
          hasKey: !!sambanovaKey,
          execute: executeSambaNova
        },
        {
          name: "openrouter",
          hasKey: !!openRouterKey,
          execute: executeOpenRouter
        }
      ];

      phases.sort((a, b) => {
        if (!a.hasKey && b.hasKey) return 1;
        if (a.hasKey && !b.hasKey) return -1;
        if (!a.hasKey && !b.hasKey) return 0;

        const isAPriority = 
          (a.name === "gemini" && NATIVE_MODELS.includes(currentPriorityModel)) ||
          (a.name === "groq" && GROQ_MODELS.includes(currentPriorityModel)) ||
          (a.name === "sambanova" && SAMBANOVA_MODELS.includes(currentPriorityModel)) ||
          (a.name === "openrouter" && OPENROUTER_MODELS.includes(currentPriorityModel));

        const isBPriority = 
          (b.name === "gemini" && NATIVE_MODELS.includes(currentPriorityModel)) ||
          (b.name === "groq" && GROQ_MODELS.includes(currentPriorityModel)) ||
          (b.name === "sambanova" && SAMBANOVA_MODELS.includes(currentPriorityModel)) ||
          (b.name === "openrouter" && OPENROUTER_MODELS.includes(currentPriorityModel));

        if (isAPriority && !isBPriority) return -1;
        if (!isAPriority && isBPriority) return 1;
        return 0;
      });

      for (const phase of phases) {
        if (!phase.hasKey) continue;
        try {
          console.log(`Iniciando Batch-Parse en Fase secuencial: ${phase.name}`);
          jsonText = await phase.execute();
          console.log(`¡Fase exitosa! ${phase.name} retornó texto original:`, jsonText);
          batchSuccess = true;
          break;
        } catch (phaseError: any) {
          console.warn(`Batch-Parse Fase ${phase.name} falló:`, phaseError.message);
          lastError = phaseError.message;
        }
      }

      if (!jsonText || !batchSuccess) {
         if (lastError && (lastError.includes("quota") || lastError.includes("RESOURCE_EXHAUSTED") || lastError.includes("429"))) {
            throw new Error("La IA de Google ha agotado su cuota gratuita. Por favor, intenta de nuevo en 1 minuto.");
         }
         throw new Error(lastError || "No se generó respuesta de ninguna IA.");
      }

      let parsedResult;
      try {
         parsedResult = extractAndParseJSON(jsonText);
         console.log("Parsed result básico pre-sanitize en backend:", JSON.stringify(parsedResult, null, 2));
      } catch (parseErr: any) {
         console.warn("JSON Parse Error en texto de IA:", parseErr.message);
         throw new Error("No se pudo extraer un JSON estructurado de la respuesta de la Inteligencia Artificial.");
      }

      // Desempaquetado inteligente si la IA envolvió el array en un objeto raíz (ej. {"array": [...]})
      if (parsedResult && typeof parsedResult === 'object' && !Array.isArray(parsedResult)) {
        const arrayKey = Object.keys(parsedResult).find(key => Array.isArray(parsedResult[key]));
        if (arrayKey) {
          console.log(`Desempaquetando array interior de la propiedad raíz: "${arrayKey}"`);
          parsedResult = parsedResult[arrayKey];
        }
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
      let clientErrorMsg = error.message || "Unknown error";
      if (clientErrorMsg.includes("429") || clientErrorMsg.includes("quota") || clientErrorMsg.includes("RESOURCE_EXHAUSTED")) {
        clientErrorMsg = "La Inteligencia Artificial base (Gemini) ha agotado su cuota gratuita comercial. Para multi-pegado o continuos registros, debes esperar 1 minuto a que se restablezca el límite, o agregar otra APi Key en la configuración.";
      }
      res.status(500).json({ error: clientErrorMsg });
    }
  });

  app.post("/api/director-filter", async (req, res) => {
    try {
      const { sala, tono, genero, tiempo, movies } = req.body;

      const cleanKey = (k: string) => {
        if (!k) return "";
        const stripped = k.trim().replace(/^['"]|['"]$/g, "");
        if (stripped === "MY_GEMINI_API_KEY" || stripped === "undefined" || stripped === '""') return "";
        return stripped;
      };

      const finalGemini = cleanKey(process.env.GEMINI_API_KEY || "");
      const finalOpenRouter = cleanKey(process.env.OPENROUTER_API_KEY || "");
      const finalGroq = cleanKey(process.env.GROQ_API_KEY || "");
      const finalSambaNova = cleanKey(process.env.SAMBANOVA_API_KEY || "");
      const finalUser = cleanKey(process.env.USER_API_KEY || "");

      let geminiKey = finalGemini;
      let openRouterKey = finalOpenRouter;
      let groqKey = finalGroq;
      let sambanovaKey = finalSambaNova;

      if (finalUser) {
        if (finalUser.startsWith("AIza")) {
          if (!geminiKey) geminiKey = finalUser;
        } else if (finalUser.startsWith("gsk_")) {
          if (!groqKey) groqKey = finalUser;
        } else if (finalUser.startsWith("sn-") || (finalUser.length === 36 && finalUser.includes("-"))) {
          if (!sambanovaKey) sambanovaKey = finalUser;
        } else {
          if (!openRouterKey) openRouterKey = finalUser;
        }
      }

      if (!sambanovaKey && !geminiKey && !groqKey && !openRouterKey) {
        return res.status(500).json({ error: "No se ha configurado ninguna API Key para curar con el Filtro del Director." });
      }

      // Preparación del input minimalista de las películas locales
      // Usar hasta 400 enviadas por el frontend
      const lightweightMovies = (movies || []).slice(0, 400).map((m: any) => ({
        id: m.id || "",
        title: m.title || "",
        originalTitle: m.originalTitle || "",
        year: Number(m.year) || 0,
        genre: m.genre || "",
        synopsis: m.synopsis || ""
      }));

      const systemInstruction = `Eres El Director de la Mediateca de Alto Nivel, un curador premium y erudito del séptimo arte con un gusto exquisito, de autor y sofisticado (estilo MUBI o Apple TV).
Tu tarea es recomendar exactamente un TOP 3 de películas seleccionadas SOLAMENTE de la base de datos local proporcionada, basándote en la calibración actual de los diales del usuario:
- LA SALA: ${sala || "Solo"}
- EL TONO: ${tono || "Trama"}
- EL GÉNERO: ${genero || "Cualquier género"}
- EL TIEMPO: ${tiempo || "Estándar"}

REGLAS DE SELECCIÓN Y FILTRADO:
1. Analiza con cuidado cada película en la base de datos suministrada. Selecciona exactamente 3 películas de la lista proporcionada que mejor se adapten mística y temáticamente a las 4 variables seleccionadas.
2. Está ESTRICTAMENTE PROHIBIDO inventar o alucinar películas. Las películas recomendadas deben existir sí o sí en el listado recibido.
3. El Género: Si el dial de género es distinto de "Cualquier género" (seleccionó "${genero || "Cualquier género"}"), DEBES filtrar estrictamente para responder solo con películas que pertenezcan o sean muy afines a ese género exacto. Si no hay suficientes, infiere por sinopsis.
4. El Tiempo: Si es "Corto (<90 min)", busca historias más concisas; si es "Maratón (+2 hrs)", busca obras más largas y profundas.
5. Ordena las 3 películas seleccionadas priorizando la recencia (las añadidas más recientemente u orden basándote en id/año aparecen primero).
6. REGLA DE TRADUCCIÓN Y TÍTULOS LIMPIOS: En el campo "title", copia EXACTAMENTE el título de la película de la lista provista de forma 100% pura y limpia en español. Está TOTALMENTE PROHIBIDO incluir notas parentéticas, subtítulos, aclaraciones del tipo "(Subtitulada)", traducciones dobles, notas del editor u opiniones. Por ejemplo: escribe "El Padrino", jamás "El Padrino (Nota oficial de la web...)".
7. Proporciona una explicación breve, sutil, sofisticada y mística (máximo 2 líneas) de por qué esta obra encaja magistralmente con la combinación elegida, empleando una prosa de autor elegante y sugerente.

Devuelve ÚNICAMENTE un JSON válido con la siguiente estructura:
{
  "recommendations": [
    {
      "id": "ID_DE_LA_PELICULA_SISTEMA",
      "title": "TITULO_LIMPIO_DE_LA_PELICULA",
      "reason": "Explicación sutil, mística y de autor en español."
    }
  ]
}
Responde únicamente con el objeto JSON, sin formato markdown de bloques de código (no agregues \`\`\`json ni texto introductorio).`;

      const promptUser = `Aquí está la base de datos local de películas para analizar y filtrar:
${JSON.stringify(lightweightMovies, null, 2)}`;

      // Ejecutar modelo con retry y fallback
      const tryModel = async () => {
        // 1. OpenRouter (Intenta varios modelos gratuitos de alto límite de forma rotativa)
        if (openRouterKey) {
          const freeModels = [
            "google/gemini-2.5-flash:free",
            "google/gemini-2.5-flash-lite:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "qwen/qwen-2.5-72b-instruct:free"
          ];

          for (const model of freeModels) {
            try {
              console.log(`Intentando OpenRouter con modelo gratuito: [${model}] para Filtro de Director...`);
              const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${openRouterKey}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  model: model,
                  messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: promptUser }
                  ],
                  temperature: 0.2
                })
              });
              if (response.ok) {
                const data = await response.json();
                if (data.choices?.[0]?.message?.content) {
                  return { text: data.choices[0].message.content, provider: `OpenRouter (${model})` };
                }
              } else {
                const errText = await response.text();
                console.warn(`OpenRouter modelo [${model}] retornó status ${response.status}:`, errText);
              }
            } catch (e) {
              console.log(`Error intentando OpenRouter con [${model}]:`, e);
            }
          }
        }
        
        // 2. Gemini Nativo
        if (geminiKey) {
          try {
            console.log("Intentando Gemini Nativo para Filtro de Director...");
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: `${systemInstruction}\n\n${promptUser}`,
              config: { responseMimeType: "application/json" }
            });
            if (response.text) return { text: response.text, provider: "Gemini Nativo" };
          } catch (e: any) {
            console.log("Gemini Nativo falló:", e?.message);
          }
        }
        
        // 3. Groq
        if (groqKey) {
          try {
            console.log("Intentando Groq para Filtro de Director...");
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${groqKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                  { role: "system", content: systemInstruction },
                  { role: "user", content: promptUser }
                ],
                temperature: 0.2,
                response_format: { type: "json_object" }
              })
            });
            if (response.ok) {
              const data = await response.json();
              if (data.choices?.[0]?.message?.content) {
                return { text: data.choices[0].message.content, provider: "Groq" };
              }
            }
          } catch (e) {
            console.log("Groq falló:", e);
          }
        }

        // 4. SambaNova
        if (sambanovaKey) {
          try {
            console.log("Intentando SambaNova para Filtro de Director...");
            const response = await fetch("https://api.sambanova.ai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${sambanovaKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "Meta-Llama-3.3-70B-Instruct",
                messages: [
                  { role: "system", content: systemInstruction },
                  { role: "user", content: promptUser }
                ],
                temperature: 0.2
              })
            });
            if (response.ok) {
              const data = await response.json();
              if (data.choices?.[0]?.message?.content) {
                return { text: data.choices[0].message.content, provider: "SambaNova" };
              }
            }
          } catch (e) {
            console.log("SambaNova falló:", e);
          }
        }
        
        throw new Error("No se pudo obtener respuesta de ningún proveedor de IA configurado. Por favor, revisa tus API Keys.");
      };

      const result = await tryModel();
      const parsed = extractAndParseJSON(result.text);

      // Sanitización ultra robusta del resultado del filtro del director
      let rawRecommendations: any[] = [];
      if (Array.isArray(parsed)) {
        rawRecommendations = parsed;
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.recommendations)) {
          rawRecommendations = parsed.recommendations;
        } else {
          // Buscar cualquier propiedad que sea un array
          const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
          if (arrayKey) {
            rawRecommendations = parsed[arrayKey];
          } else {
            // Intento alternativo por si devolvió un solo objeto
            rawRecommendations = [parsed];
          }
        }
      }

      // Mapear y limpiar las recomendaciones para asegurar la estructura { id, title, reason }
      const finalRecommendations = rawRecommendations.map((item: any) => {
        if (!item || typeof item !== "object") return null;
        
        const id = item.id || item.movie_id || item.id_pelicula || "";
        const title = item.title || item.titulo || item.name || item.nombre || "";
        const reason = item.reason || item.reasoning || item.porque || item.por_que || item.explicacion || item.motivo || item.comentario || "";
        
        return {
          id: String(id).trim(),
          title: String(title).trim(),
          reason: String(reason).trim()
        };
      }).filter(Boolean);

      console.log(`Curación exitosa usando ${result.provider}. Recomendaciones encontradas: ${finalRecommendations.length}`);
      return res.json({ recommendations: finalRecommendations });

    } catch (err: any) {
      console.error("Error completo en Filtro del Director:", err);
      res.status(500).json({ error: err.message || "Error procesando filtro" });
    }
  });

// Setup Vite and Listen only when not on Vercel
async function setupViteAndListen() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vitePkg = await import("vite");
    const vite = await vitePkg.createServer({
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

if (!process.env.VERCEL) {
  setupViteAndListen();
}

export default app;
