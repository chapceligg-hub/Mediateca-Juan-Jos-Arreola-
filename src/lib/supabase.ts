import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { get, set } from 'idb-keyval';
import { Movie } from '../types';

export const cleanSupabaseUrl = (url?: string): string => {
  const fallback = 'https://hwvxmcpgrgdjyxofsmll.supabase.co';
  if (!url || typeof url !== 'string' || !url.trim()) return fallback;
  let cleaned = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  return cleaned || fallback;
};

export const SUPABASE_URL = cleanSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || 'https://hwvxmcpgrgdjyxofsmll.supabase.co');
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3dnhtY3Bncmdkanl4b2ZzbWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODMyNDAsImV4cCI6MjEwNjM1OTI0MH0.zJqiD6bELLGrKLer7N6dLCOAYLMxvPLw277xa1Y26EA';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 20
    }
  }
});

const IDB_MOVIES_KEY = "videoteca_movies_cache";
const IDB_FAV_ORDER_KEY = "videoteca_favorites_order_cache";
const LOCAL_SYNC_KEY = "lastLocalSyncTimestamp";

let movieBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    movieBroadcastChannel = new BroadcastChannel('videoteca_movies_channel');
  }
} catch (_) {}

let lastKnownMoviesList: Movie[] = [];
let lastKnownFavoritesOrder: string[] = [];
const movieSubscribers = new Set<(movies: Movie[]) => void>();
const favoritesOrderSubscribers = new Set<(order: string[]) => void>();

export const getCachedFavoritesOrder = async (): Promise<string[]> => {
  if (lastKnownFavoritesOrder && lastKnownFavoritesOrder.length > 0) {
    return lastKnownFavoritesOrder;
  }
  try {
    const cached = await get(IDB_FAV_ORDER_KEY);
    if (Array.isArray(cached) && cached.length > 0) {
      lastKnownFavoritesOrder = cached;
      return cached;
    }
  } catch (_) {}

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(IDB_FAV_ORDER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          lastKnownFavoritesOrder = parsed;
          return parsed;
        }
      }
    } catch (_) {}
  }
  return [];
};

export const setCachedFavoritesOrder = async (order: string[]) => {
  if (!Array.isArray(order)) return;
  lastKnownFavoritesOrder = order;
  try {
    await set(IDB_FAV_ORDER_KEY, order);
  } catch (_) {}
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(IDB_FAV_ORDER_KEY, JSON.stringify(order));
    } catch (_) {}
  }
  for (const cb of favoritesOrderSubscribers) {
    try {
      cb(order);
    } catch (_) {}
  }
};

export const fetchFavoritesOrderFromSupabase = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'favorites_order')
      .single();

    if (!error && data?.value?.order && Array.isArray(data.value.order)) {
      const order = data.value.order as string[];
      await setCachedFavoritesOrder(order);
      return order;
    }
  } catch (_) {}

  // Fallback a proxy del servidor si fallara
  try {
    const res = await fetch('/api/settings/favorites-order');
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.order)) {
        await setCachedFavoritesOrder(json.order);
        return json.order;
      }
    }
  } catch (_) {}

  return await getCachedFavoritesOrder();
};

export const saveFavoritesOrderToSupabase = async (order: string[]): Promise<void> => {
  await setCachedFavoritesOrder(order);
  if (movieBroadcastChannel) {
    try {
      movieBroadcastChannel.postMessage({ type: 'FAVORITES_ORDER_UPDATED', order });
    } catch (_) {}
  }

  // 1. Guardar en Supabase
  try {
    await supabase.from('settings').upsert({
      key: 'favorites_order',
      value: { order, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
  } catch (_) {}

  // 2. Notificar al servidor Express como respaldo
  try {
    const authKey = typeof window !== 'undefined' ? localStorage.getItem('app_key') || '' : '';
    await fetch('/api/settings/favorites-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authKey ? { 'x-access-key': authKey } : {})
      },
      body: JSON.stringify({ order })
    });
  } catch (_) {}
};

export const getMoviesCacheKey = () => IDB_MOVIES_KEY;

export const notifyMovieSubscribers = (movies: Movie[]) => {
  if (!Array.isArray(movies)) return;
  lastKnownMoviesList = movies;
  for (const cb of movieSubscribers) {
    try {
      cb(movies);
    } catch (e) {
      console.warn("Error en suscriptor de películas (Supabase):", e);
    }
  }
};

export const subscribeToFavoritesOrder = (callback: (order: string[]) => void): (() => void) => {
  favoritesOrderSubscribers.add(callback);
  (async () => {
    const cached = await getCachedFavoritesOrder();
    if (cached.length > 0) callback(cached);
    const remote = await fetchFavoritesOrderFromSupabase();
    if (remote.length > 0) callback(remote);
  })();
  return () => {
    favoritesOrderSubscribers.delete(callback);
  };
};

if (movieBroadcastChannel) {
  movieBroadcastChannel.onmessage = async (event: MessageEvent) => {
    if (event.data?.type === 'MOVIES_UPDATED' && Array.isArray(event.data.movies)) {
      lastKnownMoviesList = event.data.movies;
      await set(IDB_MOVIES_KEY, event.data.movies).catch(() => {});
      notifyMovieSubscribers(event.data.movies);
    } else if (event.data?.type === 'FAVORITES_ORDER_UPDATED' && Array.isArray(event.data.order)) {
      lastKnownFavoritesOrder = event.data.order;
      await set(IDB_FAV_ORDER_KEY, event.data.order).catch(() => {});
      for (const cb of favoritesOrderSubscribers) {
        try {
          cb(event.data.order);
        } catch (_) {}
      }
    }
  };
}

export const getCachedMovies = async (): Promise<Movie[] | null> => {
  if (lastKnownMoviesList && Array.isArray(lastKnownMoviesList) && lastKnownMoviesList.length > 0) {
    return lastKnownMoviesList;
  }


  try {
    const cached = await get(IDB_MOVIES_KEY);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      if (Array.isArray(parsed) && parsed.length > 0) {
        lastKnownMoviesList = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Aviso leyendo IndexedDB de películas:", e);
  }

  const altKeys = ["videoteca_movies", "videoteca_catalog", "movies_cache", "movies"];
  for (const altKey of altKeys) {
    try {
      const altData = await get(altKey);
      if (altData) {
        const parsed = typeof altData === 'string' ? JSON.parse(altData) : altData;
        if (Array.isArray(parsed) && parsed.length > 0) {
          lastKnownMoviesList = parsed;
          await set(IDB_MOVIES_KEY, parsed);
          return parsed;
        }
      }
    } catch (_) {}
  }

  if (typeof window !== 'undefined') {
    const lsKeys = ["videoteca_movies_cache", "videoteca_movies", "videoteca_catalog"];
    for (const lsKey of lsKeys) {
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            lastKnownMoviesList = parsed;
            await set(IDB_MOVIES_KEY, parsed);
            return parsed;
          }
        }
      } catch (_) {}
    }
  }

  return null;
};

export const setCachedMovies = async (newMovies: Movie[]) => {
  try {
    if (!Array.isArray(newMovies)) return;
    lastKnownMoviesList = newMovies;
    await set(IDB_MOVIES_KEY, newMovies);
  } catch (e) {
    console.error("Error guardando películas en IndexedDB:", e);
  }
};

export const fetchMoviesOptimized = getCachedMovies;

export const getTableNameForSection = (section?: string): 'peliculas' | 'series' | 'centauro' => {
  const clean = (section || 'peliculas').toLowerCase().trim();
  if (clean === 'series') return 'series';
  if (clean === 'centauro') return 'centauro';
  return 'peliculas';
};

export const formatMovieForSupabase = (m: any): any => {
  const table = getTableNameForSection(m.section);
  return {
    id: String(m.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`),
    title: String(m.title || ''),
    originalTitle: String(m.originalTitle || ''),
    year: Number(m.year) || 0,
    rating: Number(m.rating) || 0,
    duration: String(m.duration || ''),
    country: String(m.country || ''),
    director: String(m.director || ''),
    genre: String(m.genre || ''),
    ageRating: String(m.ageRating || ''),
    format: String(m.format || ''),
    poster: String(m.poster || ''),
    synopsis: String(m.synopsis || ''),
    cast: Array.isArray(m.cast) ? m.cast : [],
    script: String(m.script || ''),
    music: String(m.music || ''),
    photography: String(m.photography || ''),
    companies: String(m.companies || ''),
    reviews: String(m.reviews || ''),
    awards: String(m.awards || ''),
    estante: String(m.estante || ''),
    season: String(m.season || ''),
    section: table,
    needsReview: Boolean(m.needsReview),
    favoriteOfMonth: Boolean(m.favoriteOfMonth),
    filmaffinityId: String(m.filmaffinityId || ''),
    tmdbId: String(m.tmdbId || ''),
    posterCandidates: Array.isArray(m.posterCandidates) ? m.posterCandidates : [],
    isLatestSaved: Boolean(m.isLatestSaved),
    latestSavedAt: String(m.latestSavedAt || ''),
    createdAt: String(m.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };
};

/**
 * Consulta una tabla de Supabase paginada en bloques de 1,000 en 1,000
 * utilizando .range(desde, desde + 999) sin reglas de ordenamiento (.order())
 * para conservar el orden natural de la tabla.
 */
export const fetchTableWithRange = async (tableName: 'peliculas' | 'series' | 'centauro'): Promise<Movie[]> => {
  const accumulated: Movie[] = [];
  const CHUNK_SIZE = 1000;
  let from = 0;

  // Helper para consultar el endpoint proxy del servidor en caso de bloqueo de red/CORS en iframe
  const fetchFromProxy = async (start: number, end: number): Promise<Movie[]> => {
    const res = await fetch(`/api/movies?table=${tableName}&from=${start}&to=${end}`);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} al consultar proxy: ${errText}`);
    }
    return (await res.json()) || [];
  };

  while (true) {
    const to = from + CHUNK_SIZE - 1;
    let data: Movie[] | null = null;
    let error: any = null;

    try {
      const supaRes = await supabase
        .from(tableName)
        .select('*')
        .range(from, to);
      data = (supaRes.data as Movie[]) || null;
      error = supaRes.error;
    } catch (e: any) {
      error = e;
    }

    // Si falló por red/CORS o error en cliente, probar a través del proxy del servidor
    if (error) {
      const isNetworkOrFetchError =
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('Load failed');

      if (isNetworkOrFetchError) {
        try {
          data = await fetchFromProxy(from, to);
          error = null;
        } catch (proxyErr) {
          console.warn(`Aviso proxy en ${tableName} (${from}-${to}):`, proxyErr);
        }
      }
    }

    // Manejo adaptativo en caso de timeout de Postgres (57014) o carga pesada
    if (error) {
      console.warn(`Aviso en bloque ${from}-${to} de ${tableName} (${error.message || 'error'}). Intentando sub-bloques adaptativos...`);
      let subFrom = from;
      let reachEnd = false;
      while (subFrom <= to) {
        const subTo = Math.min(to, subFrom + 199);
        let subData: Movie[] | null = null;

        try {
          const subRes = await supabase
            .from(tableName)
            .select('*')
            .range(subFrom, subTo);
          if (!subRes.error && subRes.data) {
            subData = subRes.data as Movie[];
          }
        } catch (_) {}

        if (!subData) {
          // Reintentar por el proxy del servidor
          try {
            subData = await fetchFromProxy(subFrom, subTo);
          } catch (e: any) {
            console.error(`Error al consultar ${tableName} en rango ${subFrom}-${subTo}:`, e);
            throw new Error(`Error en ${tableName} (${subFrom}-${subTo}): ${e?.message || 'Error de conexión'}`);
          }
        }

        if (subData && subData.length > 0) {
          accumulated.push(...subData);
        }

        if (!subData || subData.length < (subTo - subFrom + 1)) {
          reachEnd = true;
          break;
        }

        subFrom += 200;
      }

      if (reachEnd) {
        break;
      }

      from += CHUNK_SIZE;
      continue;
    }

    // Acumula el lote descargado
    if (data && data.length > 0) {
      accumulated.push(...data);
    }

    // Si devolvió menos de 1,000 registros, alcanzamos el final de la tabla
    if (!data || data.length < CHUNK_SIZE) {
      break;
    }

    from += CHUNK_SIZE;
  }

  return accumulated;
};

export const fetchAllMoviesFromSupabase = async (): Promise<Movie[]> => {
  try {
    // Consultar peliculas en bloques paginados de 1,000 en 1,000 con .range()
    const [peliculasList, seriesList, centauroList] = await Promise.all([
      fetchTableWithRange('peliculas'),
      fetchTableWithRange('series'),
      fetchTableWithRange('centauro')
    ]);

    const allItems: Movie[] = [...peliculasList, ...seriesList, ...centauroList];
    return allItems;
  } catch (err) {
    console.error("Error al consultar tablas paginadas en Supabase:", err);
    throw err;
  }
};

export const subscribeToMovies = (
  callback: (movies: Movie[]) => void,
  onError?: (err: any) => void
) => {
  movieSubscribers.add(callback);
  let isCleanedUp = false;

  const dispatchMovies = (movies: Movie[]) => {
    if (isCleanedUp || !Array.isArray(movies)) return;
    callback(movies);
    notifyMovieSubscribers(movies);
  };

  (async () => {
    try {
      // 1. Mostrar de inmediato la caché local en 0ms
      const localCached = await getCachedMovies();
      if (localCached && localCached.length > 0) {
        dispatchMovies(localCached);
      }

      // 2. Consulta en segundo plano a Supabase
      const remoteData = await fetchAllMoviesFromSupabase();
      if (remoteData && remoteData.length > 0) {
        await setCachedMovies(remoteData);
        dispatchMovies(remoteData);
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_SYNC_KEY, Date.now().toString());
        }
      } else if (!localCached || localCached.length === 0) {
        // Ninguno tiene datos
        dispatchMovies([]);
      }
    } catch (fetchErr: any) {
      console.warn("Aviso en carga inicial desde Supabase:", fetchErr);
      onError?.(fetchErr);
    }
  })();

  // 3. Suscripción en Tiempo Real (Realtime postgres_changes)
  const movieChannels = ['peliculas', 'series', 'centauro'].map(tableName => {
    return supabase
      .channel(`public:${tableName}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        async (payload) => {
          if (isCleanedUp) return;
          try {
            const current = (await getCachedMovies()) || [];
            let updatedList = [...current];

            if (payload.eventType === 'INSERT') {
              const newRow = payload.new as Movie;
              const exists = updatedList.some(m => m.id === newRow.id);
              if (!exists) {
                updatedList.unshift(newRow);
              } else {
                updatedList = updatedList.map(m => m.id === newRow.id ? { ...m, ...newRow } : m);
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedRow = payload.new as Movie;
              updatedList = updatedList.map(m => m.id === updatedRow.id ? { ...m, ...updatedRow } : m);
            } else if (payload.eventType === 'DELETE') {
              const oldId = payload.old?.id;
              if (oldId) {
                updatedList = updatedList.filter(m => m.id !== oldId);
              }
            }

            await setCachedMovies(updatedList);
            dispatchMovies(updatedList);
            if (movieBroadcastChannel) {
              movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: updatedList });
            }
          } catch (e) {
            console.warn(`Error procesando realtime en tabla ${tableName}:`, e);
          }
        }
      )
      .subscribe();
  });

  const settingsChannel = supabase
    .channel('public:settings-fav-order')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'settings' },
      async (payload) => {
        if (isCleanedUp) return;
        const record: any = payload.new || {};
        if (record.key === 'favorites_order' && record.value?.order && Array.isArray(record.value.order)) {
          await setCachedFavoritesOrder(record.value.order);
        }
      }
    )
    .subscribe();

  const channels = [...movieChannels, settingsChannel];

  return () => {
    isCleanedUp = true;
    movieSubscribers.delete(callback);
    for (const ch of channels) {
      try {
        supabase.removeChannel(ch);
      } catch (_) {}
    }
  };
};

export const generateMovieId = (): string => {
  return `mv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const upsertMovie = async (movie: any): Promise<Movie> => {
  const movieId = movie.id || generateMovieId();
  const formatted = formatMovieForSupabase({ ...movie, id: movieId });
  const targetTable = formatted.section as 'peliculas' | 'series' | 'centauro';

  // 1. Optimistic UI local instantáneo a 0ms en IndexedDB
  try {
    const current = (await getCachedMovies()) || [];
    const map = new Map<string, Movie>();
    for (const m of current) {
      if (m && m.id) map.set(m.id, m);
    }
    map.set(movieId, { ...(map.get(movieId) || {}), ...formatted });
    const updatedList = Array.from(map.values()).sort((a, b) => {
      const timeA = a.createdAt || a.updatedAt || '';
      const timeB = b.createdAt || b.updatedAt || '';
      return timeB.localeCompare(timeA);
    });
    await setCachedMovies(updatedList);
    notifyMovieSubscribers(updatedList);
    if (movieBroadcastChannel) {
      movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: updatedList });
    }
  } catch (e) {
    console.error("Error actualizando memoria local tras upsertMovie en Supabase:", e);
  }

  // 2. Persistencia en Supabase
  try {
    // Si la obra cambió de sección, eliminarla de las otras tablas
    const otherTables = ['peliculas', 'series', 'centauro'].filter(t => t !== targetTable);
    for (const other of otherTables) {
      try {
        await supabase.from(other).delete().eq('id', movieId);
      } catch (_) {}
    }

    const { error } = await supabase.from(targetTable).upsert(formatted, { onConflict: 'id' });
    if (error) {
      console.error(`Error guardando en Supabase tabla ${targetTable}:`, error);
    }

    // Registrar evento de sincronización en settings
    try {
      await supabase.from('settings').upsert({
        key: 'sync',
        value: {
          lastUpdate: new Date().toISOString(),
          action: 'upsert',
          table: targetTable,
          movieId
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    } catch (_) {}

    // Notificar al servidor Express como respaldo
    const authKey = typeof window !== 'undefined' ? localStorage.getItem('app_key') || '' : '';
    fetch('/api/movies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authKey ? { 'x-access-key': authKey } : {})
      },
      body: JSON.stringify(formatted)
    }).catch(() => {});
  } catch (err) {
    console.warn("Aviso escribiendo en Supabase (los datos persisten en la memoria local):", err);
  }

  return formatted;
};

export const updateMovie = async (id: string, updates: any): Promise<any> => {
  const current = (await getCachedMovies()) || [];
  const existing = current.find(m => m.id === id);
  const targetSection = updates.section || existing?.section || 'peliculas';
  const targetTable = getTableNameForSection(targetSection);

  const safeUpdates = {
    ...updates,
    id,
    updatedAt: new Date().toISOString()
  };

  // 1. Optimistic UI local instantáneo
  try {
    const idx = current.findIndex(m => m.id === id);
    if (idx > -1) {
      current[idx] = { ...current[idx], ...safeUpdates };
      current.sort((a, b) => {
        const timeA = a.createdAt || a.updatedAt || '';
        const timeB = b.createdAt || b.updatedAt || '';
        return timeB.localeCompare(timeA);
      });
      await setCachedMovies(current);
      notifyMovieSubscribers(current);
      if (movieBroadcastChannel) {
        movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: current });
      }
    }
  } catch (e) {
    console.error("Error actualizando memoria local tras updateMovie:", e);
  }

  // 2. Persistencia en Supabase
  try {
    const formatted = formatMovieForSupabase({ ...existing, ...safeUpdates });
    await supabase.from(targetTable).upsert(formatted, { onConflict: 'id' });

    try {
      await supabase.from('settings').upsert({
        key: 'sync',
        value: {
          lastUpdate: new Date().toISOString(),
          action: 'upsert',
          table: targetTable,
          movieId: id
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    } catch (_) {}
  } catch (err) {
    console.warn("Aviso actualizando en Supabase:", err);
  }

  return { id, ...updates };
};

export const deleteMovie = async (id: string, section?: string): Promise<void> => {
  // 1. Optimistic UI local instantáneo
  try {
    const current = (await getCachedMovies()) || [];
    const filtered = current.filter(m => m.id !== id);
    await setCachedMovies(filtered);
    notifyMovieSubscribers(filtered);
    if (movieBroadcastChannel) {
      movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: filtered });
    }
  } catch (e) {
    console.error("Error eliminando de la memoria local:", e);
  }

  // 2. Persistencia en Supabase (eliminamos de las 3 tablas por seguridad)
  try {
    await Promise.all([
      supabase.from('peliculas').delete().eq('id', id),
      supabase.from('series').delete().eq('id', id),
      supabase.from('centauro').delete().eq('id', id)
    ]);

    try {
      await supabase.from('settings').upsert({
        key: 'sync',
        value: {
          lastUpdate: new Date().toISOString(),
          action: 'delete',
          movieId: id
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    } catch (_) {}

    const authKey = typeof window !== 'undefined' ? localStorage.getItem('app_key') || '' : '';
    fetch(`/api/movies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...(authKey ? { 'x-access-key': authKey } : {})
      }
    }).catch(() => {});
  } catch (err) {
    console.warn("Aviso eliminando en Supabase:", err);
  }
};

export interface MigrationProgress {
  current: number;
  total: number;
  table: string;
  percent: number;
  status: 'starting' | 'migrating' | 'success' | 'error';
  message: string;
}

export const migrateIndexedDBToSupabase = async (
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ success: boolean; total: number; peliculas: number; series: number; centauro: number; error?: string }> => {
  try {
    onProgress?.({
      current: 0,
      total: 0,
      table: 'inicio',
      percent: 0,
      status: 'starting',
      message: 'Leyendo catálogo local de IndexedDB...'
    });

    const localCached = await getCachedMovies();
    if (!localCached || localCached.length === 0) {
      throw new Error("No hay películas en la base de datos local (IndexedDB) para migrar.");
    }

    const peliculasList: any[] = [];
    const seriesList: any[] = [];
    const centauroList: any[] = [];

    for (const item of localCached) {
      const table = getTableNameForSection(item.section);
      if (table === 'series') seriesList.push(formatMovieForSupabase(item));
      else if (table === 'centauro') centauroList.push(formatMovieForSupabase(item));
      else peliculasList.push(formatMovieForSupabase(item));
    }

    const total = localCached.length;
    let processed = 0;

    const uploadTable = async (tableName: 'peliculas' | 'series' | 'centauro', items: any[]) => {
      const BATCH_SIZE = 50;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        let uploadSucceeded = false;

        // 1. Intentar directamente desde el cliente con supabase
        try {
          const { error } = await supabase.from(tableName).upsert(batch, { onConflict: 'id' });
          if (!error) {
            uploadSucceeded = true;
          } else {
            console.warn(`Aviso RLS/cliente en ${tableName}, probando fallback por servidor de servicio:`, error.message);
          }
        } catch (clientErr: any) {
          console.warn(`Error cliente en lote de ${tableName}:`, clientErr?.message);
        }

        // 2. Si falla por RLS o permisos del anon key, usar el endpoint de migración del servidor (Service Role)
        if (!uploadSucceeded) {
          const authKey = typeof window !== 'undefined' ? localStorage.getItem('app_key') || '' : '';
          const response = await fetch('/api/movies/batch-migrate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authKey ? { 'x-access-key': authKey } : {})
            },
            body: JSON.stringify({
              table: tableName,
              items: batch
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error || `HTTP ${response.status} en migración de ${tableName}`;
            console.error(`Error en fallback servidor para ${tableName}:`, errMsg);
            throw new Error(errMsg);
          }
        }

        processed += batch.length;
        const percent = Math.min(100, Math.round((processed / total) * 100));
        onProgress?.({
          current: processed,
          total,
          table: tableName,
          percent,
          status: 'migrating',
          message: `Migrando ${tableName}: ${processed}/${total} (${percent}%)`
        });
      }
    };

    if (peliculasList.length > 0) {
      await uploadTable('peliculas', peliculasList);
    }
    if (seriesList.length > 0) {
      await uploadTable('series', seriesList);
    }
    if (centauroList.length > 0) {
      await uploadTable('centauro', centauroList);
    }

    // Inicializar o actualizar registro de sync en settings
    try {
      await supabase.from('settings').upsert({
        key: 'sync',
        value: {
          lastUpdate: new Date().toISOString(),
          action: 'full_migration',
          totalMigrated: total,
          counts: {
            peliculas: peliculasList.length,
            series: seriesList.length,
            centauro: centauroList.length
          }
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    } catch (_) {}

    onProgress?.({
      current: total,
      total,
      table: 'completado',
      percent: 100,
      status: 'success',
      message: `¡Migración completada! ${total} obras aseguradas en Supabase.`
    });

    return {
      success: true,
      total,
      peliculas: peliculasList.length,
      series: seriesList.length,
      centauro: centauroList.length
    };
  } catch (err: any) {
    onProgress?.({
      current: 0,
      total: 0,
      table: 'error',
      percent: 0,
      status: 'error',
      message: `Error en la migración: ${err?.message || 'Error desconocido'}`
    });
    return {
      success: false,
      total: 0,
      peliculas: 0,
      series: 0,
      centauro: 0,
      error: err?.message || 'Error desconocido'
    };
  }
};
