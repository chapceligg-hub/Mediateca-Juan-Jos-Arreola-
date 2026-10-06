import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc,
  getDocsFromCache, query, orderBy, onSnapshot
} from 'firebase/firestore';
import { get, set } from 'idb-keyval';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Inicializar Firestore con el databaseId explícito del proyecto (Solo para películas)
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

// Manejo estandarizado de errores de Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.warn('Firestore Error Context: ', JSON.stringify(errInfo));
  return errInfo;
}

// ==========================================
// SISTEMA PURO DE DOS LLAVES (Clave Maestra & PIN de Editor)
// Sin correos, sin Google Auth, sin usuarios
// ==========================================

export type UserRole = 'owner' | 'editor' | 'viewer';

export const getStoredAccessKey = (): string => {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('app_key') || '').trim();
};

export const setStoredAccessKey = (key: string): void => {
  if (typeof window === 'undefined') return;
  const clean = (key || '').trim();
  if (clean) {
    localStorage.setItem('app_key', clean);
  } else {
    localStorage.removeItem('app_key');
  }
};

export const clearStoredAccessKey = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('app_key');
};

export const getAuthHeaders = (): Record<string, string> => {
  const key = getStoredAccessKey();
  if (!key) return {};
  return { 'x-access-key': key };
};

// Event listener global para capturar respuestas 401/403 en peticiones
type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export const onAuthExpiredOrDenied = (listener: AuthExpiredListener) => {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
};

export const notifyAuthExpiredOrDenied = () => {
  for (const listener of authExpiredListeners) {
    try {
      listener();
    } catch (_) {}
  }
};

// Validar clave directamente con el servidor
export const loginWithAccessKey = async (key: string): Promise<{ valid: boolean; role?: 'owner' | 'editor'; message?: string }> => {
  const clean = (key || '').trim();
  if (!clean) {
    return { valid: false, message: 'CLAVE_VACIA' };
  }

  try {
    const res = await fetch('/api/auth/login-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: clean })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.valid && (data.role === 'owner' || data.role === 'editor')) {
        setStoredAccessKey(clean);
        return { valid: true, role: data.role };
      }
    }

    return { valid: false, message: 'CLAVE_INVALIDA' };
  } catch (err) {
    console.error('Error al verificar clave de acceso:', err);
    return { valid: false, message: 'ERROR_CONEXION' };
  }
};

// Verificar estado de la clave almacenada en localStorage
export const verifyStoredKey = async (): Promise<{ valid: boolean; role: UserRole }> => {
  const savedKey = getStoredAccessKey();
  if (!savedKey) {
    return { valid: false, role: 'viewer' };
  }

  const result = await loginWithAccessKey(savedKey);
  if (result.valid && result.role) {
    return { valid: true, role: result.role };
  }

  // Si la clave ya no es válida (ej. fue cambiada en el servidor), limpiarla
  clearStoredAccessKey();
  return { valid: false, role: 'viewer' };
};

// Obtener claves del sistema (Solo Dueño / 'owner')
export const fetchSystemKeys = async (): Promise<{ masterKey: string; editorPin: string } | null> => {
  try {
    const res = await fetch('/api/auth/keys', {
      headers: {
        ...getAuthHeaders()
      }
    });

    if (res.status === 401 || res.status === 403) {
      notifyAuthExpiredOrDenied();
      return null;
    }

    if (!res.ok) return null;
    const data = await res.json();
    return {
      masterKey: data.masterKey || '',
      editorPin: data.editorPin || ''
    };
  } catch (err) {
    console.error('Error al obtener claves del sistema:', err);
    return null;
  }
};

// Modificar claves del sistema (Solo Dueño / 'owner')
export const changeSystemKeys = async (
  newMasterKey: string,
  newEditorPin: string
): Promise<{ success: boolean; masterKey?: string; editorPin?: string; error?: string }> => {
  try {
    const res = await fetch('/api/auth/change-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        newMasterKey: newMasterKey.trim(),
        newEditorPin: newEditorPin.trim()
      })
    });

    if (res.status === 401 || res.status === 403) {
      notifyAuthExpiredOrDenied();
      return { success: false, error: 'NO_ACCESS' };
    }

    const data = await res.json();
    if (res.ok && data.success) {
      // Actualizar la clave local con la nueva clave maestra
      setStoredAccessKey(newMasterKey.trim());
      return {
        success: true,
        masterKey: data.masterKey,
        editorPin: data.editorPin
      };
    }

    return { success: false, error: data.error || 'Error al cambiar las claves' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de conexión con el servidor' };
  }
};

// ==========================================
// PERSISTENCIA Y SINCRONIZACIÓN DE PELÍCULAS
// (Local-First 0ms IndexedDB + Servidor + Firestore)
// ==========================================

export const requestPersistentStorage = async () => {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        await navigator.storage.persist();
      }
    } catch (_) {}
  }
};
requestPersistentStorage();

let movieBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    movieBroadcastChannel = new BroadcastChannel('videoteca_movies_channel');
  }
} catch (_) {}

const CACHE_STORAGE_NAME = 'videoteca_permanent_catalog_v1';
const CACHE_STORAGE_URL = '/__videoteca_catalog_cache_store.json';
let lastKnownMoviesList: any[] = [];
const movieSubscribers = new Set<(movies: any[]) => void>();

export const getMoviesCacheKey = () => "videoteca_movies_cache";

export const shouldUpdateCache = (currentMovies: any[], newMovies: any[]): boolean => {
  if (!currentMovies || currentMovies.length === 0) return true;
  if (newMovies.length === 0 && currentMovies.length > 0) {
    console.warn(`[Integrity Check] Se bloqueó intento de vaciar la memoria. Actual: ${currentMovies.length}, Nuevo: ${newMovies.length}`);
    return false;
  }
  return true;
};

const saveToCacheStorage = async (movies: any[]) => {
  try {
    if (typeof window !== 'undefined' && 'caches' in window && Array.isArray(movies) && movies.length > 0) {
      const cache = await window.caches.open(CACHE_STORAGE_NAME);
      const response = new Response(JSON.stringify(movies), {
        headers: { 'Content-Type': 'application/json', 'X-Cache-Date': new Date().toISOString() }
      });
      await cache.put(CACHE_STORAGE_URL, response);
    }
  } catch (_) {}
};

const getFromCacheStorage = async (): Promise<any[] | null> => {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await window.caches.open(CACHE_STORAGE_NAME);
      const response = await cache.match(CACHE_STORAGE_URL);
      if (response) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    }
  } catch (_) {}
  return null;
};

export const getCachedMovies = async (): Promise<any[] | null> => {
  if (lastKnownMoviesList && Array.isArray(lastKnownMoviesList) && lastKnownMoviesList.length > 0) {
    return lastKnownMoviesList;
  }

  try {
    const cache = await get("videoteca_movies_cache");
    if (cache) {
      const parsed = typeof cache === 'string' ? JSON.parse(cache) : cache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        lastKnownMoviesList = parsed;
        saveToCacheStorage(parsed).catch(() => {});
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
          await set("videoteca_movies_cache", parsed);
          saveToCacheStorage(parsed).catch(() => {});
          return parsed;
        }
      }
    } catch (_) {}
  }

  try {
    const fromCacheStorage = await getFromCacheStorage();
    if (fromCacheStorage && fromCacheStorage.length > 0) {
      lastKnownMoviesList = fromCacheStorage;
      set("videoteca_movies_cache", fromCacheStorage).catch(() => {});
      return fromCacheStorage;
    }
  } catch (_) {}

  const lsKeys = ["videoteca_movies_cache", "videoteca_movies", "videoteca_catalog", "videoteca_backup_catalog"];
  for (const lsKey of lsKeys) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          lastKnownMoviesList = parsed;
          await set("videoteca_movies_cache", parsed);
          saveToCacheStorage(parsed).catch(() => {});
          return parsed;
        }
      }
    } catch (_) {}
  }

  return null;
};

export const setCachedMovies = async (newMovies: any[], bypassIntegrity = false) => {
  try {
    if (!Array.isArray(newMovies) || newMovies.length === 0) return;
    const currentCache = await getCachedMovies();
    let currentMovies: any[] = currentCache || [];
    
    if (bypassIntegrity || shouldUpdateCache(currentMovies, newMovies)) {
      lastKnownMoviesList = newMovies;
      await set("videoteca_movies_cache", newMovies);
      await saveToCacheStorage(newMovies);

      try {
        const serialized = JSON.stringify(newMovies);
        if (serialized.length < 3.5 * 1024 * 1024) {
          localStorage.setItem("videoteca_movies_cache", serialized);
        }
      } catch (_) {}
    }
  } catch (e) {
    console.error("Error al escribir en la memoria local:", e);
  }
};

export const mergeMoviesPreservingLocal = (localList: any[], incomingList: any[], deletedIds: string[] = []): any[] => {
  const map = new Map<string, any>();
  const deletedSet = new Set(deletedIds);

  for (const m of localList) {
    if (m && m.id && !deletedSet.has(m.id)) {
      map.set(m.id, m);
    }
  }

  for (const inc of incomingList) {
    if (!inc || !inc.id || deletedSet.has(inc.id)) continue;
    const existing = map.get(inc.id);
    if (!existing) {
      map.set(inc.id, inc);
    } else {
      const localTime = existing.updatedAt || existing.createdAt || "";
      const incomingTime = inc.updatedAt || inc.createdAt || "";

      if (incomingTime >= localTime || !localTime) {
        const finalPoster = (inc.poster && inc.poster !== "No disponible" && inc.poster !== "No encontrado")
          ? inc.poster
          : (existing.poster || inc.poster);
        map.set(inc.id, { ...existing, ...inc, poster: finalPoster });
      } else {
        const finalPoster = (existing.poster && existing.poster !== "No disponible" && existing.poster !== "No encontrado")
          ? existing.poster
          : (inc.poster || existing.poster);
        map.set(inc.id, { ...inc, ...existing, poster: finalPoster });
      }
    }
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const timeA = a.createdAt || a.updatedAt || "";
    const timeB = b.createdAt || b.updatedAt || "";
    return timeB.localeCompare(timeA);
  });

  return merged;
};

export const syncDeletedMovieIds = async (): Promise<string[]> => {
  let localDeleted: string[] = [];
  try {
    const raw = await get("videoteca_deleted_ids");
    if (raw) {
      localDeleted = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(localDeleted)) localDeleted = [];
    }
  } catch (_) {}

  return localDeleted;
};

export const notifyMovieSubscribers = (movies: any[]) => {
  if (!Array.isArray(movies)) return;
  lastKnownMoviesList = movies;
  for (const cb of movieSubscribers) {
    try {
      cb(movies);
    } catch (e) {
      console.warn("Error en suscriptor de películas:", e);
    }
  }
};

if (movieBroadcastChannel) {
  movieBroadcastChannel.onmessage = async (event: MessageEvent) => {
    if (event.data?.type === 'MOVIES_UPDATED' && Array.isArray(event.data.movies)) {
      await setCachedMovies(event.data.movies, true);
      notifyMovieSubscribers(event.data.movies);
    }
  };
}

export const subscribeToMovies = (
  callback: (movies: any[]) => void, 
  onError?: (err: any) => void
) => {
  movieSubscribers.add(callback);
  let isCleanedUp = false;
  let lastDeltaTime = "1970-01-01T00:00:00.000Z";
  let lastMovieRevision = 0;

  // 1. Cargar instantáneamente la memoria local (0ms de latencia inicial)
  getCachedMovies().then(async (offlineData) => {
    if (isCleanedUp) return;
    const deletedIds = await syncDeletedMovieIds();
    const deletedSet = new Set(deletedIds);
    if (offlineData && offlineData.length > 0) {
      const cleaned = offlineData.filter(m => m && m.id && !deletedSet.has(m.id));
      callback(cleaned);
      notifyMovieSubscribers(cleaned);
      for (const m of cleaned) {
        const t = m.updatedAt || m.createdAt || "";
        if (t > lastDeltaTime) lastDeltaTime = t;
        if (typeof m._rev === 'number' && m._rev > lastMovieRevision) {
          lastMovieRevision = m._rev;
        }
      }
    }
    // 2. Consulta delta inmediata con el servidor
    syncDelta();
  }).catch(() => {
    syncDelta();
  });

  // Sincronizador Delta (Funciona entre todos los dispositivos sin consumir cuota de Firestore)
  const syncDelta = async () => {
    if (isCleanedUp) return;
    try {
      const url = `/api/delta?since=${encodeURIComponent(lastDeltaTime)}&rev=${lastMovieRevision}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (isCleanedUp) return;

      if (data.timestamp) lastDeltaTime = data.timestamp;
      if (typeof data.movieRevision === 'number' && data.movieRevision > lastMovieRevision) {
        lastMovieRevision = data.movieRevision;
      }

      const currentCached = (await getCachedMovies()) || [];

      // Auto-hidratación del servidor si la memoria del servidor está vacía pero el cliente tiene títulos locales
      if (currentCached.length > 0 && data.totalMoviesCount === 0) {
        fetch('/api/movies/sync', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(currentCached)
        }).catch(() => {});
      }

      const serverDeletedIds = Array.isArray(data.deletedMovieIds) ? data.deletedMovieIds : [];
      const localDeletedIds = (await get("videoteca_deleted_ids")) || [];
      const allDeletedIds = Array.from(new Set([...serverDeletedIds, ...localDeletedIds]));
      await set("videoteca_deleted_ids", allDeletedIds);

      let hasChanges = false;
      let workingList = [...currentCached];

      if (Array.isArray(data.deltaMovies) && data.deltaMovies.length > 0) {
        hasChanges = true;
        const map = new Map<string, any>();
        for (const m of workingList) {
          if (m && m.id) map.set(m.id, m);
        }
        for (const dm of data.deltaMovies) {
          if (!dm || !dm.id) continue;
          const existing = map.get(dm.id);
          if (!existing) {
            map.set(dm.id, dm);
          } else {
            const existT = existing.updatedAt || existing.createdAt || "";
            const deltaT = dm.updatedAt || dm.createdAt || "";
            if (deltaT >= existT || (dm._rev && (!existing._rev || dm._rev >= existing._rev))) {
              map.set(dm.id, { ...existing, ...dm });
            }
          }
        }
        workingList = Array.from(map.values());
      }

      const delSet = new Set(allDeletedIds);
      const beforeFilterCount = workingList.length;
      workingList = workingList.filter(m => m && m.id && !delSet.has(m.id));
      if (workingList.length !== beforeFilterCount) {
        hasChanges = true;
      }

      if (currentCached.length === 0 && workingList.length > 0) {
        hasChanges = true;
      }

      if (hasChanges) {
        workingList.sort((a, b) => {
          const timeA = a.createdAt || a.updatedAt || "";
          const timeB = b.createdAt || b.updatedAt || "";
          return timeB.localeCompare(timeA);
        });
        await setCachedMovies(workingList, true);
        callback(workingList);
        notifyMovieSubscribers(workingList);
      }
    } catch (_) {}
  };

  // 3. Listener pasivo directo de Firestore (100% pasivo vía WebSocket onSnapshot)
  let unsubFirestore: (() => void) | null = null;
  try {
    unsubFirestore = onSnapshot(collection(db, 'movies'), async (snap) => {
      if (isCleanedUp) return;
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const currentCached = (await getCachedMovies()) || [];
        const deletedIds = (await get("videoteca_deleted_ids")) || [];
        const merged = mergeMoviesPreservingLocal(currentCached, docs, deletedIds);
        await setCachedMovies(merged, true);
        callback(merged);
        notifyMovieSubscribers(merged);
      }
    }, (err: any) => {
      console.warn("Aviso en onSnapshot pasivo de movies:", err);
    });
  } catch (_) {}

  // 4. Temporizador delta en segundo plano hacia el servidor interno
  const intervalId = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      syncDelta();
    }
  }, 2500);

  const handleVisibilityOrFocus = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      syncDelta();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  }

  return () => {
    isCleanedUp = true;
    movieSubscribers.delete(callback);
    clearInterval(intervalId);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    }
    if (unsubFirestore) {
      try { unsubFirestore(); } catch (_) {}
    }
  };
};

export const fetchMoviesOptimized = async (forceServer = false) => {
  const offlineData = await getCachedMovies();
  if (!forceServer && offlineData && offlineData.length > 0) {
    return offlineData;
  }

  // Consulta al servidor backend primero
  try {
    const res = await fetch('/api/movies', {
      headers: { ...getAuthHeaders() }
    });
    if (res.ok) {
      const serverData = await res.json();
      if (Array.isArray(serverData) && serverData.length > 0) {
        await setCachedMovies(serverData, true);
        return serverData;
      }
    }
  } catch (_) {}

  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));

  if (!forceServer) {
    try {
      const cachedSnap = await getDocsFromCache(q);
      if (!cachedSnap.empty) {
        const data = cachedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await setCachedMovies(data);
        return data;
      }
    } catch (_) {}
  }

  try {
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    await setCachedMovies(data, true);
    return data;
  } catch (err) {
    if (offlineData && offlineData.length > 0) {
      return offlineData;
    }
    return [];
  }
};

export const generateMovieId = () => {
  return doc(collection(db, 'movies')).id;
};

export const upsertMovie = async (movie: any) => {
  const movieId = movie.id || generateMovieId();
  const nowIso = new Date().toISOString();
  const movieData = { 
    ...movie, 
    id: movieId,
    createdAt: movie.createdAt || nowIso,
    updatedAt: nowIso
  };
  
  // 1. Guardar de inmediato en la memoria local persistente y notificar pestañas (0ms)
  try {
    const offlineData = await getCachedMovies();
    let list: any[] = [];
    if (offlineData) {
      list = [...offlineData];
    }
    const index = list.findIndex((m: any) => m.id === movieId);
    if (index > -1) {
      list[index] = { ...list[index], ...movieData };
    } else {
      list.unshift(movieData);
    }
    list.sort((a, b) => {
      const timeA = a.createdAt || a.updatedAt || "";
      const timeB = b.createdAt || b.updatedAt || "";
      return timeB.localeCompare(timeA);
    });
    await setCachedMovies(list, true);
    notifyMovieSubscribers(list);
    if (movieBroadcastChannel) {
      movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: list });
    }

    const deletedList: string[] = (await get("videoteca_deleted_ids")) || [];
    if (deletedList.includes(movieId)) {
      await set("videoteca_deleted_ids", deletedList.filter(id => id !== movieId));
    }
  } catch (e) {
    console.error("Error actualizando la memoria local tras upsertMovie:", e);
  }

  // 2. ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore + Servidor Backend Interno
  const results = await Promise.allSettled([
    setDoc(doc(db, 'movies', movieId), movieData, { merge: true }),
    fetch('/api/movies', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(movieData)
    })
  ]);

  // Verificar si el servidor devolvió 401/403
  const serverResult = results[1];
  if (serverResult.status === 'fulfilled') {
    const res = serverResult.value;
    if (res.status === 401 || res.status === 403) {
      notifyAuthExpiredOrDenied();
      throw new Error('AUTH_DENIED');
    }
  }

  return movieData;
};

export const updateMovie = async (id: string, updates: any) => {
  const nowIso = new Date().toISOString();
  const safeUpdates = {
    ...updates,
    updatedAt: updates.updatedAt || nowIso
  };

  try {
    const offlineData = await getCachedMovies();
    if (offlineData) {
      let list: any[] = [...offlineData];
      const index = list.findIndex((m: any) => m.id === id);
      if (index > -1) {
        list[index] = { ...list[index], ...safeUpdates };
        list.sort((a, b) => {
          const timeA = a.createdAt || a.updatedAt || "";
          const timeB = b.createdAt || b.updatedAt || "";
          return timeB.localeCompare(timeA);
        });
        await setCachedMovies(list, true);
        notifyMovieSubscribers(list);
        if (movieBroadcastChannel) {
          movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: list });
        }
      }
    }
  } catch (_) {}

  // ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore + Servidor Backend Interno
  const results = await Promise.allSettled([
    setDoc(doc(db, 'movies', id), safeUpdates, { merge: true }),
    fetch('/api/movies', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ id, ...safeUpdates })
    })
  ]);

  const serverResult = results[1];
  if (serverResult.status === 'fulfilled') {
    const res = serverResult.value;
    if (res.status === 401 || res.status === 403) {
      notifyAuthExpiredOrDenied();
      throw new Error('AUTH_DENIED');
    }
  }

  return { id, ...updates };
};

export const deleteMovie = async (id: string) => {
  try {
    const offlineData = await getCachedMovies();
    if (offlineData) {
      let list: any[] = offlineData.filter((m: any) => m.id !== id);
      await setCachedMovies(list, true);
      notifyMovieSubscribers(list);
      if (movieBroadcastChannel) {
        movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: list });
      }
    }
    const deletedList: string[] = (await get("videoteca_deleted_ids")) || [];
    if (!deletedList.includes(id)) {
      deletedList.push(id);
      await set("videoteca_deleted_ids", deletedList.slice(-1000));
    }
  } catch (_) {}

  // ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore + Servidor Backend Interno
  const results = await Promise.allSettled([
    deleteDoc(doc(db, 'movies', id)),
    fetch(`/api/movies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders()
      }
    })
  ]);

  const serverResult = results[1];
  if (serverResult.status === 'fulfilled') {
    const res = serverResult.value;
    if (res.status === 401 || res.status === 403) {
      notifyAuthExpiredOrDenied();
      throw new Error('AUTH_DENIED');
    }
  }
};
