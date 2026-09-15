import * as XLSX from 'xlsx';
import { Movie } from '../types';
import { getCachedMovies } from './firebase';

export interface ExportSummary {
  total: number;
  peliculas: number;
  series: number;
  centauro: number;
  revision: number;
}

const MAX_EXCEL_CELL_LENGTH = 32000; // El estándar estricto de Excel OpenXML es de 32,767 caracteres por celda

/**
 * Sanitiza cualquier valor de celda para evitar el error:
 * "Text length must not exceed 32767 characters" y asegurar compatibilidad total con Excel/Google Sheets.
 */
export const safeExcelText = (value: any, isPosterField = false): string | number => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return isNaN(value) ? "" : value;

  let str = String(value).trim();

  // Si es un póster o imagen Base64 (data:image/... o contiene ;base64,),
  // evitamos volcar decenas o cientos de kilobytes de texto crudo en la celda de Excel
  if (isPosterField) {
    if (str.startsWith("data:") || str.includes(";base64,")) {
      return "[Imagen Base64 almacenada en Videoteca]";
    }
  }

  // Eliminar caracteres de control ASCII invisibles (excepto saltos de línea \n y retornos \r)
  // que corrompen el XML de Excel (.xlsx)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Si por sinopsis, reseñas u otro campo el texto sobrepasa los 32,000 caracteres, truncar limpiamente
  if (str.length > MAX_EXCEL_CELL_LENGTH) {
    str = str.slice(0, MAX_EXCEL_CELL_LENGTH) + "… [Texto truncado por límite de Excel (32,767 caracteres)]";
  }

  return str;
};

/**
 * Clasifica si una ficha requiere revisión técnica.
 */
export const isReviewPending = (m: any): boolean => {
  if (!m) return false;
  return Boolean(
    m.needsReview === true ||
    (m.title && m.title.includes("⚠️")) ||
    (m.notes && m.notes.toLowerCase().includes("revisar")) ||
    (!m.duration || m.duration === "No disponible" || m.duration === "No encontrado") ||
    (!m.country || m.country === "No disponible" || m.country === "No encontrado") ||
    (!m.director || m.director === "No disponible" || m.director === "No encontrado") ||
    (!m.poster || m.poster === "No disponible" || m.poster === "No encontrado" || String(m.poster).includes("placeholder"))
  );
};

export const getMovieSection = (m: Movie): 'series' | 'centauro' | 'peliculas' => {
  const sec = String(m?.section || '').toLowerCase().trim();
  if (sec === 'series') return 'series';
  if (sec === 'centauro') return 'centauro';
  return 'peliculas';
};

/**
 * Consolida todas las películas asegurando que ningún título subido quede fuera.
 * Combina el estado en memoria con la caché persistente (IndexedDB) de Firestore.
 */
export const consolidateAllMovies = async (movies: Movie[]): Promise<Movie[]> => {
  const map = new Map<string, Movie>();

  // 1. Películas del estado activo
  if (Array.isArray(movies)) {
    for (const m of movies) {
      if (m && (m.id || m.title)) {
        const key = m.id || `${m.title}_${m.year || 0}`;
        map.set(key, m);
      }
    }
  }

  // 2. Complementar con la base local de IndexedDB para detectar todo lo subido
  try {
    const cached = await getCachedMovies();
    if (Array.isArray(cached)) {
      for (const m of cached) {
        if (m && (m.id || m.title)) {
          const key = m.id || `${m.title}_${m.year || 0}`;
          if (!map.has(key)) {
            map.set(key, m);
          } else {
            const prev = map.get(key)!;
            // Preservar la versión con más datos
            map.set(key, { ...prev, ...m });
          }
        }
      }
    }
  } catch (err) {
    console.warn("Consolidación de caché finalizada con datos disponibles:", err);
  }

  return Array.from(map.values());
};

export const getExportSummary = (movies: Movie[]): ExportSummary => {
  const peliculas = movies.filter(m => getMovieSection(m) === 'peliculas').length;
  const series = movies.filter(m => getMovieSection(m) === 'series').length;
  const centauro = movies.filter(m => getMovieSection(m) === 'centauro').length;
  const revision = movies.filter(m => isReviewPending(m)).length;
  return {
    total: movies.length,
    peliculas,
    series,
    centauro,
    revision
  };
};

const EXPORT_HEADERS = [
  "N°",
  "Pestaña / Sección",
  "Título en Español",
  "Título Original",
  "Año",
  "Rating Global",
  "Duración",
  "Género",
  "País",
  "Clasificación",
  "Formato",
  "Estante (Ubicación)",
  "Dirección",
  "Elenco Principal",
  "Guion",
  "Banda Sonora",
  "Fotografía",
  "Estudio / Productora",
  "Sinopsis / Argumento",
  "Reseñas Críticas",
  "Premios",
  "Enlace de Póster",
  "ID Registro"
];

const COLUMN_WIDTHS = [
  { wch: 6 },   // N°
  { wch: 20 },  // Pestaña / Sección
  { wch: 36 },  // Título en Español
  { wch: 32 },  // Título Original
  { wch: 8 },   // Año
  { wch: 15 },  // Rating Global
  { wch: 14 },  // Duración
  { wch: 28 },  // Género
  { wch: 20 },  // País
  { wch: 14 },  // Clasificación
  { wch: 22 },  // Formato
  { wch: 14 },  // Estante
  { wch: 26 },  // Dirección
  { wch: 42 },  // Elenco
  { wch: 26 },  // Guion
  { wch: 26 },  // Banda Sonora
  { wch: 26 },  // Fotografía
  { wch: 30 },  // Estudio
  { wch: 65 },  // Sinopsis
  { wch: 50 },  // Reseñas
  { wch: 38 },  // Premios
  { wch: 45 },  // Póster
  { wch: 18 }   // ID Registro
];

const formatMovieToRow = (m: Movie, index: number): any[] => {
  const sec = getMovieSection(m);
  const sectionLabel = sec === 'series' 
    ? 'Series' 
    : sec === 'centauro' 
      ? 'Colección Centauro' 
      : 'Películas';

  const castStr = Array.isArray(m.cast) 
    ? m.cast.join(" / ") 
    : (m.cast || "");

  const ratingStr = m.rating 
    ? (String(m.rating).includes('/10') ? String(m.rating) : `${m.rating} / 10 IMDb`) 
    : "No disponible";

  const durationStr = m.duration 
    ? (String(m.duration).toLowerCase().includes('min') ? String(m.duration) : `${m.duration} min`) 
    : "No disponible";

  const rawRow = [
    index + 1,
    safeExcelText(sectionLabel),
    safeExcelText(m.title || ""),
    safeExcelText(m.originalTitle || ""),
    safeExcelText(m.year || ""),
    safeExcelText(ratingStr),
    safeExcelText(durationStr),
    safeExcelText(m.genre || ""),
    safeExcelText(m.country || ""),
    safeExcelText(m.ageRating || ""),
    safeExcelText(m.format || ""),
    safeExcelText(m.estante || ""),
    safeExcelText(m.director || ""),
    safeExcelText(castStr),
    safeExcelText(m.script || ""),
    safeExcelText(m.music || ""),
    safeExcelText(m.photography || ""),
    safeExcelText(m.companies || ""),
    safeExcelText(m.synopsis || ""),
    safeExcelText(m.reviews || ""),
    safeExcelText(m.awards || ""),
    safeExcelText(m.poster || "", true),
    safeExcelText(m.id || "")
  ];

  // Doble capa de seguridad para garantizar que NINGUNA celda exceda los 32,000 caracteres
  return rawRow.map((cell, colIdx) => {
    if (colIdx === 0 && typeof cell === 'number') return cell;
    return safeExcelText(cell, colIdx === 21);
  });
};

const createSheetFromList = (list: Movie[]) => {
  const rows = [
    EXPORT_HEADERS,
    ...list.map((m, idx) => formatMovieToRow(m, idx))
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = COLUMN_WIDTHS;
  return ws;
};

/**
 * Genera un archivo Excel (.xlsx) con pestañas organizadas por sección:
 * - 🎬 Películas
 * - 📺 Series
 * - 🏛️ Colección Centauro
 * - ⚠️ Para Revisión
 * - 📚 Catálogo Completo
 * Protegido contra desbordamiento de celdas y con detección total de registros.
 */
export const exportToExcelWithTabs = async (movies: Movie[], filteredMovies?: Movie[]): Promise<boolean> => {
  try {
    // Consolidar todos los registros subidos (memoria + almacenamiento local)
    const allMovies = await consolidateAllMovies(movies);

    if (!allMovies || allMovies.length === 0) {
      alert("No hay películas registradas en la videoteca para exportar.");
      return false;
    }

    const wb = XLSX.utils.book_new();

    // 1. Pestaña: Películas
    const peliculasList = allMovies.filter(m => getMovieSection(m) === 'peliculas');
    if (peliculasList.length > 0) {
      const wsPeliculas = createSheetFromList(peliculasList);
      XLSX.utils.book_append_sheet(wb, wsPeliculas, "Películas");
    }

    // 2. Pestaña: Series
    const seriesList = allMovies.filter(m => getMovieSection(m) === 'series');
    if (seriesList.length > 0) {
      const wsSeries = createSheetFromList(seriesList);
      XLSX.utils.book_append_sheet(wb, wsSeries, "Series");
    }

    // 3. Pestaña: Colección Centauro
    const centauroList = allMovies.filter(m => getMovieSection(m) === 'centauro');
    if (centauroList.length > 0) {
      const wsCentauro = createSheetFromList(centauroList);
      XLSX.utils.book_append_sheet(wb, wsCentauro, "Colección Centauro");
    }

    // 4. Pestaña: Para Revisión
    const revisionList = allMovies.filter(m => isReviewPending(m));
    if (revisionList.length > 0) {
      const wsRevision = createSheetFromList(revisionList);
      XLSX.utils.book_append_sheet(wb, wsRevision, "Para Revisión");
    }

    // 5. Pestaña: Catálogo Completo
    const wsAll = createSheetFromList(allMovies);
    XLSX.utils.book_append_sheet(wb, wsAll, "Catálogo Completo");

    // 6. Si el usuario tenía un filtro activo diferente al total, agregar pestaña de filtro
    if (filteredMovies && filteredMovies.length > 0 && filteredMovies.length !== allMovies.length) {
      const wsFiltered = createSheetFromList(filteredMovies);
      XLSX.utils.book_append_sheet(wb, wsFiltered, "Filtro Seleccionado");
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Videoteca_Catalogo_Pestanas_${dateStr}.xlsx`);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 300);
    return true;
  } catch (err: any) {
    console.error("Error al exportar libro Excel con pestañas:", err);
    alert("Ocurrió un error al generar el archivo Excel: " + (err?.message || err));
    return false;
  }
};

/**
 * Genera un archivo CSV con codificación UTF-8 BOM y columnas organizadas por sección.
 */
export const exportToCleanCSV = async (movies: Movie[], filenameSuffix = "catalogo"): Promise<boolean> => {
  try {
    const allMovies = await consolidateAllMovies(movies);

    if (!allMovies || allMovies.length === 0) {
      alert("No hay elementos para exportar en CSV.");
      return false;
    }

    const rows = [
      EXPORT_HEADERS,
      ...allMovies.map((m, idx) => formatMovieToRow(m, idx))
    ];

    const csvLines = rows.map(row => 
      row.map(val => {
        const str = String(val ?? "").replace(/"/g, '""');
        return `"${str}"`;
      }).join(",")
    );

    // Agregar UTF-8 BOM (\uFEFF) para que Excel respete tildes, ñ y caracteres especiales sin deformaciones
    const csvContent = "\uFEFF" + csvLines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `Videoteca_${filenameSuffix}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 300);
    return true;
  } catch (err: any) {
    console.error("Error al exportar CSV:", err);
    alert("Ocurrió un error al generar el CSV: " + (err?.message || err));
    return false;
  }
};
