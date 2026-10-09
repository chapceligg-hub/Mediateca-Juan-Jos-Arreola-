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
export const IDB_SETTINGS_KEY = "videoteca_settings_cache";
const LOCAL_SYNC_KEY = "lastLocalSyncTimestamp";

let movieBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    movieBroadcastChannel = new BroadcastChannel('videoteca_movies_channel');
  }
} catch (_) {}

let lastKnownMoviesList: Movie[] = [];
let lastKnownFavoritesOrder: string[] = [];
let lastKnownSettings: Record<string, any> = {};

const movieSubscribers = new Set<(movies: Movie[]) => void>();
const favoritesOrderSubscribers = new Set<(order: string[]) => void>();

type SettingsListener = (settings: Record<string, any>, changedKey?: string, changedValue?: any) => void;
const settingsSubscribers = new Set<SettingsListener>();

type SystemKeysListener = (keys: { masterKey: string; editorPin: string }) => void;
const systemKeysSubscribers = new Set<SystemKeysListener>();

type AuthSessionListener = (role: 'owner' | 'editor' | 'viewer') => void;
const authSessionSubscribers = new Set<AuthSessionListener>();

export const subscribeToSettings = (callback: SettingsListener): (() => void) => {
  settingsSubscribers.add(callback);
  return () => {
    settingsSubscribers.delete(callback);
  };
};

export const subscribeToSystemKeys = (callback: SystemKeysListener): (() => void) => {
  systemKeysSubscribers.add(callback);
  return () => {
    systemKeysSubscribers.delete(callback);
  };
};

export const subscribeToAuthSession = (callback: AuthSessionListener): (() => void) => {
  authSessionSubscribers.add(callback);
  return () => {
    authSessionSubscribers.delete(callback);
  };
};

export const notifySettingsSubscribers = (settings: Record<string, any>, changedKey?: string, changedValue?: any) => {
  for (const cb of settingsSubscribers) {
    try { cb(settings, changedKey, changedValue); } catch (_) {}
  }
};

export const notifySystemKeysSubscribers = (keys: { masterKey: string; editorPin: string }) => {
  for (const cb of systemKeysSubscribers) {
    try { cb(keys); } catch (_) {}
  }
};

export const notifyAuthSessionSubscribers = (role: 'owner' | 'editor' | 'viewer') => {
  for (const cb of authSessionSubscribers) {
    try { cb(role); } catch (_) {}
  }
};

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

export const getCachedSettings = async (): Promise<Record<string, any>> => {
  if (lastKnownSettings && Object.keys(lastKnownSettings).length > 0) {
    return lastKnownSettings;
  }
  try {
    const cached = await get(IDB_SETTINGS_KEY);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      if (parsed && typeof parsed === 'object') {
        lastKnownSettings = parsed;
        return parsed;
      }
    }
  } catch (_) {}

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(IDB_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          lastKnownSettings = parsed;
          return parsed;
        }
      }
    } catch (_) {}
  }

  return {};
};

export const setCachedSettings = async (settings: Record<string, any>): Promise<void> => {
  if (!settings || typeof settings !== 'object') return;
  lastKnownSettings = { ...lastKnownSettings, ...settings };
  try {
    await set(IDB_SETTINGS_KEY, lastKnownSettings);
  } catch (_) {}
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(IDB_SETTINGS_KEY, JSON.stringify(lastKnownSettings));
    } catch (_) {}
  }
};

export const setCachedSetting = async (key: string, value: any): Promise<void> => {
  const current = await getCachedSettings();
  current[key] = value;
  await setCachedSettings(current);
};

export const fetchSettingsFromSupabase = async (): Promise<Record<string, any>> => {
  let rows: Array<{ key: string; value: any; updated_at?: string }> = [];

  try {
    const { data, error } = await supabase.from('settings').select('*');
    if (!error && Array.isArray(data)) {
      rows = data;
    }
  } catch (_) {}

  // Fallback al endpoint proxy del servidor
  if (rows.length === 0) {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          rows = json;
        }
      }
    } catch (e) {
      console.warn("Aviso leyendo settings vía proxy:", e);
    }
  }

  if (rows.length > 0) {
    const cached = await getCachedSettings();
    const remoteMap: Record<string, any> = {};
    for (const r of rows) {
      remoteMap[r.key] = r.value;
    }

    // Comprobar cambios clave por clave
    for (const [k, v] of Object.entries(remoteMap)) {
      if (JSON.stringify(cached[k]) !== JSON.stringify(v)) {
        if (k === 'auth' && v) {
          notifySystemKeysSubscribers({
            masterKey: v.masterKey || '',
            editorPin: v.editorPin || ''
          });

          // Verificar si la sesión activa del usuario sigue siendo válida
          if (typeof window !== 'undefined') {
            const currentAccessKey = (localStorage.getItem('app_key') || '').trim();
            if (currentAccessKey) {
              if (currentAccessKey === v.masterKey) {
                notifyAuthSessionSubscribers('owner');
              } else if (currentAccessKey === v.editorPin) {
                notifyAuthSessionSubscribers('editor');
              } else {
                // Clave modificada en settings: revocar sesión
                localStorage.removeItem('app_key');
                notifyAuthSessionSubscribers('viewer');
              }
            }
          }
        } else if (k === 'favorites_order' && v?.order && Array.isArray(v.order)) {
          await setCachedFavoritesOrder(v.order);
        }
      }
    }

    const merged = { ...cached, ...remoteMap };
    await setCachedSettings(merged);
    notifySettingsSubscribers(merged);
    return merged;
  }

  return await getCachedSettings();
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
    } else if (event.data?.type === 'SETTINGS_UPDATED' && event.data.settings) {
      lastKnownSettings = event.data.settings;
      await set(IDB_SETTINGS_KEY, event.data.settings).catch(() => {});
      notifySettingsSubscribers(event.data.settings, event.data.key, event.data.value);
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

/**
 * Consulta ligera (Delta Sync) de una tabla:
 * Pide ÚNICAMENTE los registros cuyo updatedAt sea superior a sinceIsoString.
 */
export const fetchTableDelta = async (
  tableName: 'peliculas' | 'series' | 'centauro',
  sinceIsoString: string
): Promise<Movie[]> => {
  const accumulated: Movie[] = [];
  const CHUNK_SIZE = 1000;
  let from = 0;

  const fetchDeltaFromProxy = async (start: number, end: number): Promise<Movie[]> => {
    const res = await fetch(`/api/movies?table=${tableName}&since=${encodeURIComponent(sinceIsoString)}&from=${start}&to=${end}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al consultar proxy delta: ${await res.text().catch(() => '')}`);
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
        .gt('updatedAt', sinceIsoString)
        .range(from, to);
      data = (supaRes.data as Movie[]) || null;
      error = supaRes.error;
    } catch (e: any) {
      error = e;
    }

    if (error) {
      const isNetworkOrFetchError =
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('Load failed');

      if (isNetworkOrFetchError) {
        try {
          data = await fetchDeltaFromProxy(from, to);
          error = null;
        } catch (proxyErr) {
          console.warn(`Aviso proxy delta en ${tableName} (${from}-${to}):`, proxyErr);
        }
      }
    }

    if (error) {
      console.warn(`Aviso en delta sync de ${tableName}:`, error.message);
      break;
    }

    if (data && data.length > 0) {
      accumulated.push(...data);
    }

    if (!data || data.length < CHUNK_SIZE) {
      break;
    }

    from += CHUNK_SIZE;
  }

  return accumulated;
};

export const fetchAllMoviesFromSupabase = async (
  onProgress?: (accumulated: Movie[]) => void
): Promise<Movie[]> => {
  try {
    const tables: Array<'peliculas' | 'series' | 'centauro'> = ['peliculas', 'series', 'centauro'];
    const allItems: Movie[] = [];

    // Bucle SECUENCIAL con await sin Promise.all para prevenir timeout 57014 de Postgres
    for (const tableName of tables) {
      const tableData = await fetchTableWithRange(tableName);
      if (Array.isArray(tableData) && tableData.length > 0) {
        allItems.push(...tableData);
        onProgress?.([...allItems]);
      }
    }

    return allItems;
  } catch (err) {
    console.error("Error al consultar tablas paginadas secuenciales en Supabase:", err);
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

  // 1. CARGA INICIAL Y DELTA SYNC UNIFICADO
  (async () => {
    try {
      // Sincronización de configuración y claves (settings) primero en segundo plano
      // Lee primero los valores de settings desde IndexedDB / localStorage (0 ms)
      await getCachedSettings();
      // Consulta Supabase para verificar si hay cambios en la tabla settings
      fetchSettingsFromSupabase().catch((e) => {
        console.warn("Aviso sincronizando settings en inicio:", e);
      });

      // 1. Verificar si existen datos en la caché de IndexedDB
      const localCached = await getCachedMovies();
      const hasCache = Array.isArray(localCached) && localCached.length > 0;

      if (hasCache) {
        // B. USUARIOS RECURRENTES (Ya existen datos en caché):
        // Muestra inmediatamente los datos de IndexedDB a 0 ms
        dispatchMovies(localCached);

        // Buscar la fecha más reciente de la caché (updatedAt o createdAt)
        let latestCachedDate = '';
        for (const m of localCached) {
          const t = m.updatedAt || m.createdAt || '';
          if (t && t > latestCachedDate) {
            latestCachedDate = t;
          }
        }

        if (latestCachedDate) {
          // Ejecuta una consulta ligera (Delta Sync) pidiendo a Supabase ÚNICAMENTE
          // los registros cuyo updatedAt sea superior a la fecha más reciente de la caché
          const deltaItems: Movie[] = [];
          const tables: Array<'peliculas' | 'series' | 'centauro'> = ['peliculas', 'series', 'centauro'];

          for (const tableName of tables) {
            try {
              const tableDeltas = await fetchTableDelta(tableName, latestCachedDate);
              if (tableDeltas.length > 0) {
                deltaItems.push(...tableDeltas);
              }
            } catch (dErr) {
              console.warn(`Aviso consultando delta en ${tableName}:`, dErr);
            }
          }

          // Si hay registros nuevos o modificados, sobreescribe/agrega SOLAMENTE los modificados
          if (deltaItems.length > 0) {
            const currentList = (await getCachedMovies()) || localCached;
            const movieMap = new Map<string, Movie>();
            for (const m of currentList) {
              if (m?.id) movieMap.set(m.id, m);
            }
            for (const delta of deltaItems) {
              if (delta?.id) {
                const existing = movieMap.get(delta.id);
                movieMap.set(delta.id, { ...existing, ...delta });
              }
            }
            const mergedList = Array.from(movieMap.values());
            await setCachedMovies(mergedList);
            dispatchMovies(mergedList);
            if (movieBroadcastChannel) {
              movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: mergedList });
            }
            if (typeof window !== 'undefined') {
              localStorage.setItem(LOCAL_SYNC_KEY, Date.now().toString());
            }
          }
        } else {
          // Si no había marcas de tiempo válidas, refrescar de fondo secuencialmente
          const remoteData = await fetchAllMoviesFromSupabase();
          if (remoteData && remoteData.length > 0) {
            await setCachedMovies(remoteData);
            dispatchMovies(remoteData);
          }
        }
      } else {
        // A. PRIMERA VISITA O INCÓGNITO (Caché VACÍA):
        // Descarga COMPLETA usando bucle while SECUENCIAL con await y .range(desde, desde + 999)
        // en bloques de 1,000 registros (NO usar Promise.all para evitar timeout 57014).
        const remoteData = await fetchAllMoviesFromSupabase((progressiveList) => {
          dispatchMovies(progressiveList);
        });

        if (remoteData && remoteData.length > 0) {
          // Acumula los bloques, asígnalos al estado de React y guárdalos completos en IndexedDB
          await setCachedMovies(remoteData);
          dispatchMovies(remoteData);
          if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_SYNC_KEY, Date.now().toString());
          }
        } else {
          dispatchMovies([]);
        }
      }
    } catch (fetchErr: any) {
      console.warn("Aviso en sincronización inicial desde Supabase:", fetchErr);
      onError?.(fetchErr);
    }
  })();

  // 3. TIEMPO REAL (SUPABASE REALTIME) PARA LAS 4 TABLAS:
  // Escucha los eventos INSERT, UPDATE y DELETE para: peliculas, series, centauro y settings
  const movieTables: Array<'peliculas' | 'series' | 'centauro'> = ['peliculas', 'series', 'centauro'];
  const movieChannels = movieTables.map(tableName => {
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
              const exists = updatedList.some(m => m.id === updatedRow.id);
              if (exists) {
                updatedList = updatedList.map(m => m.id === updatedRow.id ? { ...m, ...updatedRow } : m);
              } else {
                updatedList.unshift(updatedRow);
              }
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
    .channel('public:settings-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'settings' },
      async (payload) => {
        if (isCleanedUp) return;
        try {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const record: any = payload.new || {};
            const key = record.key;
            const val = record.value;
            if (!key) return;

            // Actualizar caché de settings en memoria, IndexedDB y localStorage
            const currentSettings = await getCachedSettings();
            const updatedSettings = { ...currentSettings, [key]: val };
            await setCachedSettings(updatedSettings);

            // Reaccionar según la clave modificada
            if (key === 'auth' && val) {
              const mKey = val.masterKey || '';
              const ePin = val.editorPin || '';
              notifySystemKeysSubscribers({ masterKey: mKey, editorPin: ePin });

              // Verificar si el usuario conectado sigue teniendo credenciales válidas
              if (typeof window !== 'undefined') {
                const currentAccessKey = (localStorage.getItem('app_key') || '').trim();
                if (currentAccessKey) {
                  if (currentAccessKey === mKey) {
                    notifyAuthSessionSubscribers('owner');
                  } else if (currentAccessKey === ePin) {
                    notifyAuthSessionSubscribers('editor');
                  } else {
                    // Clave revocada o cambiada: invalidar sesión y notificar
                    localStorage.removeItem('app_key');
                    notifyAuthSessionSubscribers('viewer');
                  }
                }
              }
            } else if (key === 'favorites_order' && val?.order && Array.isArray(val.order)) {
              await setCachedFavoritesOrder(val.order);
            } else if (key === 'sync' && val?.action === 'delete' && val.movieId) {
              const current = (await getCachedMovies()) || [];
              const filtered = current.filter(m => m.id !== val.movieId);
              if (filtered.length !== current.length) {
                await setCachedMovies(filtered);
                dispatchMovies(filtered);
              }
            }

            notifySettingsSubscribers(updatedSettings, key, val);
          } else if (payload.eventType === 'DELETE') {
            const oldKey = payload.old?.key;
            if (oldKey) {
              const currentSettings = await getCachedSettings();
              delete currentSettings[oldKey];
              await setCachedSettings(currentSettings);
              notifySettingsSubscribers(currentSettings, oldKey, null);
            }
          }
        } catch (e) {
          console.warn("Error procesando realtime en tabla settings:", e);
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
