import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://hwvxmcpgrgdjyxofsmll.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3dnhtY3Bncmdkanl4b2ZzbWxsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDc4MzI0MCwiZXhwIjoyMTA2MzU5MjQwfQ.cmWiZhZ7PYLA50FkKQAArgjdBYf4YDw9vF-yCafPLa8";

async function populateFromJSON(jsonFilePath: string) {
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`No se encontró el archivo: ${jsonFilePath}`);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const rawData = JSON.parse(fs.readFileSync(jsonFilePath, "utf-8"));

  // Detectar formato: ¿es array plano de películas o estructura con tablas?
  let peliculasList: any[] = [];
  let seriesList: any[] = [];
  let centauroList: any[] = [];

  if (Array.isArray(rawData)) {
    // Es un export plano de la app
    for (const item of rawData) {
      const sec = (item.section || "peliculas").toLowerCase().trim();
      if (sec === "series") seriesList.push(item);
      else if (sec === "centauro") centauroList.push(item);
      else peliculasList.push(item);
    }
  } else if (rawData.tables) {
    peliculasList = rawData.tables.peliculas || [];
    seriesList = rawData.tables.series || [];
    centauroList = rawData.tables.centauro || [];
  }

  console.log(`Cargando en Supabase:`);
  console.log(`- Películas: ${peliculasList.length}`);
  console.log(`- Series: ${seriesList.length}`);
  console.log(`- Centauro: ${centauroList.length}`);

  const insertBatch = async (table: string, items: any[]) => {
    if (items.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE).map((m) => ({
        id: String(m.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`),
        title: String(m.title || ""),
        originalTitle: String(m.originalTitle || ""),
        year: Number(m.year) || 0,
        rating: Number(m.rating) || 0,
        duration: String(m.duration || ""),
        country: String(m.country || ""),
        director: String(m.director || ""),
        genre: String(m.genre || ""),
        ageRating: String(m.ageRating || ""),
        format: String(m.format || ""),
        poster: String(m.poster || ""),
        synopsis: String(m.synopsis || ""),
        cast: Array.isArray(m.cast) ? m.cast : [],
        script: String(m.script || ""),
        music: String(m.music || ""),
        photography: String(m.photography || ""),
        companies: String(m.companies || ""),
        reviews: String(m.reviews || ""),
        awards: String(m.awards || ""),
        estante: String(m.estante || ""),
        season: String(m.season || ""),
        section: table,
        needsReview: Boolean(m.needsReview),
        favoriteOfMonth: Boolean(m.favoriteOfMonth),
        filmaffinityId: String(m.filmaffinityId || ""),
        tmdbId: String(m.tmdbId || ""),
        posterCandidates: Array.isArray(m.posterCandidates) ? m.posterCandidates : [],
        isLatestSaved: Boolean(m.isLatestSaved),
        latestSavedAt: String(m.latestSavedAt || ""),
        createdAt: String(m.createdAt || new Date().toISOString()),
        updatedAt: new Date().toISOString()
      }));

      const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
      if (error) {
        console.error(`Error insertando en ${table} (lote ${i} - ${i + chunk.length}):`, error);
      } else {
        console.log(`Insertado en ${table}: ${i + chunk.length} / ${items.length}`);
      }
    }
  };

  await insertBatch("peliculas", peliculasList);
  await insertBatch("series", seriesList);
  await insertBatch("centauro", centauroList);

  console.log("✅ Carga masiva en Supabase completada con éxito.");
}

const targetFile = process.argv[2] || "backup_database_complete.json";
populateFromJSON(path.resolve(process.cwd(), targetFile)).catch(console.error);
