import * as XLSX from 'xlsx';
import { Movie } from '../types';

export interface ExportSummary {
  total: number;
  peliculas: number;
  series: number;
  centauro: number;
  revision: number;
}

export const isReviewPending = (m: any): boolean => {
  if (!m) return false;
  return Boolean(
    (m.title && m.title.includes("⚠️")) ||
    (m.notes && m.notes.toLowerCase().includes("revisar")) ||
    (!m.duration || m.duration === "No disponible" || m.duration === "No encontrado") ||
    (!m.country || m.country === "No disponible" || m.country === "No encontrado") ||
    (!m.director || m.director === "No disponible" || m.director === "No encontrado") ||
    (!m.poster || m.poster === "No disponible" || m.poster === "No encontrado" || String(m.poster).includes("placeholder"))
  );
};

export const getExportSummary = (movies: Movie[]): ExportSummary => {
  const peliculas = movies.filter(m => !m.section || m.section === 'peliculas').length;
  const series = movies.filter(m => m.section === 'series').length;
  const centauro = movies.filter(m => m.section === 'centauro').length;
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
  const sectionLabel = m.section === 'series' 
    ? 'Series' 
    : m.section === 'centauro' 
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

  return [
    index + 1,
    sectionLabel,
    m.title || "",
    m.originalTitle || "",
    m.year || "",
    ratingStr,
    durationStr,
    m.genre || "",
    m.country || "",
    m.ageRating || "",
    m.format || "",
    m.estante || "",
    m.director || "",
    castStr,
    m.script || "",
    m.music || "",
    m.photography || "",
    m.companies || "",
    m.synopsis || "",
    m.reviews || "",
    m.awards || "",
    m.poster || "",
    m.id || ""
  ];
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
 */
export const exportToExcelWithTabs = (movies: Movie[], filteredMovies?: Movie[]): boolean => {
  if (!movies || movies.length === 0) {
    alert("No hay películas registradas en la videoteca para exportar.");
    return false;
  }

  try {
    const wb = XLSX.utils.book_new();

    // 1. Pestaña: Películas
    const peliculasList = movies.filter(m => !m.section || m.section === 'peliculas');
    if (peliculasList.length > 0) {
      const wsPeliculas = createSheetFromList(peliculasList);
      XLSX.utils.book_append_sheet(wb, wsPeliculas, "Películas");
    }

    // 2. Pestaña: Series
    const seriesList = movies.filter(m => m.section === 'series');
    if (seriesList.length > 0) {
      const wsSeries = createSheetFromList(seriesList);
      XLSX.utils.book_append_sheet(wb, wsSeries, "Series");
    }

    // 3. Pestaña: Colección Centauro
    const centauroList = movies.filter(m => m.section === 'centauro');
    if (centauroList.length > 0) {
      const wsCentauro = createSheetFromList(centauroList);
      XLSX.utils.book_append_sheet(wb, wsCentauro, "Colección Centauro");
    }

    // 4. Pestaña: Para Revisión
    const revisionList = movies.filter(m => isReviewPending(m));
    if (revisionList.length > 0) {
      const wsRevision = createSheetFromList(revisionList);
      XLSX.utils.book_append_sheet(wb, wsRevision, "Para Revisión");
    }

    // 5. Pestaña: Catálogo Completo
    const wsAll = createSheetFromList(movies);
    XLSX.utils.book_append_sheet(wb, wsAll, "Catálogo Completo");

    // 6. Si el usuario tenía un filtro activo diferente al total, agregar pestaña de filtro
    if (filteredMovies && filteredMovies.length > 0 && filteredMovies.length !== movies.length) {
      const wsFiltered = createSheetFromList(filteredMovies);
      XLSX.utils.book_append_sheet(wb, wsFiltered, "Filtro Seleccionado");
    }

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Videoteca_Catalogo_Pestanas_${dateStr}.xlsx`);
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
export const exportToCleanCSV = (movies: Movie[], filenameSuffix = "catalogo"): boolean => {
  if (!movies || movies.length === 0) {
    alert("No hay elementos para exportar en CSV.");
    return false;
  }

  try {
    const rows = [
      EXPORT_HEADERS,
      ...movies.map((m, idx) => formatMovieToRow(m, idx))
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
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err: any) {
    console.error("Error al exportar CSV:", err);
    alert("Ocurrió un error al generar el CSV: " + (err?.message || err));
    return false;
  }
};
