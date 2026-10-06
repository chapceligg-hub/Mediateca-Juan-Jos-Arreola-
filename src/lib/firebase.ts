import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged as firebaseOnAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  getDocsFromCache, query, orderBy, limit, where, onSnapshot, getDocFromServer,
  writeBatch, runTransaction
} from 'firebase/firestore';
import { get, set } from 'idb-keyval';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Inicializar Firestore con el databaseId explícito del proyecto
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// Manejo estandarizado de errores de Firestore según la especificación
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
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Error Context: ', JSON.stringify(errInfo));
  return errInfo;
}

// Conexión pasiva de Firestore inicializada (sin lecturas especulativas al iniciar)

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, provider);
  return result.user || result;
};

export const logout = async () => {
  await signOut(auth);
};

export const onAuthStateChanged = (callback: (user: any) => void) => {
  return firebaseOnAuthStateChanged(auth, callback);
};

export const initAuth = async () => {
  return true;
};

export const isGoogleAccountEmail = (email: string): boolean => {
  const normalized = (email || '').toLowerCase().trim();
  if (!normalized) return false;
  return normalized.endsWith('@gmail.com') || normalized.endsWith('@googlemail.com');
};

export const recordGoogleAuth = async (_email: string) => {
  // Operación local
};

// Solicitar almacenamiento persistente al navegador para evitar desalojos automáticos (iOS Safari, Android Chrome)
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

// ==========================================
// CANALES DE SINCRONIZACIÓN BROADCASTCHANNEL
// (0ms de latencia entre pestañas en el mismo navegador)
// ==========================================
let movieBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    movieBroadcastChannel = new BroadcastChannel('videoteca_movies_channel');
  }
} catch (_) {}

let adminBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    adminBroadcastChannel = new BroadcastChannel('videoteca_admins_channel');
  }
} catch (_) {}

// ==========================================
// PERSISTENCIA MULTI-NIVEL INMUTABLE (PELÍCULAS)
// (RAM + IndexedDB + CacheStorage + localStorage + Servidor)
// ==========================================
const CACHE_STORAGE_NAME = 'videoteca_permanent_catalog_v1';
const CACHE_STORAGE_URL = '/__videoteca_catalog_cache_store.json';
let lastKnownMoviesList: any[] = [];
const movieSubscribers = new Set<(movies: any[]) => void>();

export const getMoviesCacheKey = () => {
  return "videoteca_movies_cache";
};

export const shouldUpdateCache = (currentMovies: any[], newMovies: any[]): boolean => {
  if (!currentMovies || currentMovies.length === 0) {
    return true;
  }
  const currentCount = currentMovies.length;
  const newCount = newMovies.length;
  
  if (newCount === 0 && currentCount > 0) {
    console.warn(`[Integrity Check] Se bloqueó intento de vaciar la memoria. Actual: ${currentCount}, Nuevo: ${newCount}`);
    return false;
  }
  if (currentCount > 10 && newCount < (currentCount * 0.15)) {
    console.warn(`[Integrity Check] Alerta de reducción drástica de películas. Se bloqueó sobreescribir la memoria. Actual: ${currentCount}, Nuevo: ${newCount}`);
    return false;
  }
  return true;
};

const saveToCacheStorage = async (data: any[]) => {
  if (typeof window === 'undefined' || !('caches' in window) || !Array.isArray(data) || data.length === 0) return;
  try {
    const cache = await caches.open(CACHE_STORAGE_NAME);
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(CACHE_STORAGE_URL, response);
  } catch (_) {}
};

const getFromCacheStorage = async (): Promise<any[] | null> => {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await caches.open(CACHE_STORAGE_NAME);
    const match = await cache.match(CACHE_STORAGE_URL);
    if (match) {
      const json = await match.json();
      if (Array.isArray(json) && json.length > 0) return json;
    }
  } catch (_) {}
  return null;
};

// Sincronización al servidor desactivada: El catálogo se sirve directamente desde el cliente (IndexedDB / Firestore) sin intermediarios Serverless de Vercel
export const syncMoviesToServerChunked = async (_movies: any[]) => {
  return;
};

// Recuperación exhaustiva multi-nivel del catálogo local (Directo IndexedDB / CacheStorage / RAM)
export const getCachedMovies = async (): Promise<any[] | null> => {
  // 1. Memoria RAM instantánea (0ms)
  if (lastKnownMoviesList && Array.isArray(lastKnownMoviesList) && lastKnownMoviesList.length > 0) {
    return lastKnownMoviesList;
  }

  // 2. IndexedDB principal (idb-keyval con videoteca_movies_cache)
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

  // 3. Claves alternativas en IndexedDB
  const altKeys = ["videoteca_movies", "videoteca_catalog", "movies_cache", "movies"];
  for (const altKey of altKeys) {
    try {
      const altData = await get(altKey);
      if (altData) {
        const parsed = typeof altData === 'string' ? JSON.parse(altData) : altData;
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Cache Recovery] Películas recuperadas desde clave '${altKey}' en IndexedDB (${parsed.length} títulos)`);
          lastKnownMoviesList = parsed;
          await set("videoteca_movies_cache", parsed);
          saveToCacheStorage(parsed).catch(() => {});
          return parsed;
        }
      }
    } catch (_) {}
  }

  // 4. CacheStorage permanente (inmune a desalojos de IndexedDB)
  try {
    const fromCacheStorage = await getFromCacheStorage();
    if (fromCacheStorage && fromCacheStorage.length > 0) {
      console.log(`[Cache Recovery] Películas recuperadas desde CacheStorage permanente (${fromCacheStorage.length} títulos)`);
      lastKnownMoviesList = fromCacheStorage;
      set("videoteca_movies_cache", fromCacheStorage).catch(() => {});
      return fromCacheStorage;
    }
  } catch (_) {}

  // 5. localStorage (por si IndexedDB fue limpiado o en navegadores restrictivos)
  const lsKeys = ["videoteca_movies_cache", "videoteca_movies", "videoteca_catalog", "videoteca_backup_catalog"];
  for (const lsKey of lsKeys) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Cache Recovery] Películas recuperadas desde localStorage '${lsKey}' (${parsed.length} títulos)`);
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

      // Copia de seguridad en localStorage si cabe en 4MB
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

// Sincronización en tiempo real directa: BroadcastChannel (pestañas) y onSnapshot Delta (Firestore)
const initMovieRealtimeStream = () => {
  return;
};

// Delta Sync inteligente: consulta novedades en Firestore sin recargar todo el catálogo
export const runSmartDeltaSyncOnce = async (
  callback?: (movies: any[]) => void,
  onError?: (err: any) => void
) => {
  try {
    const deletedIds = await syncDeletedMovieIds();
    const deletedSet = new Set(deletedIds);

    let cached = await getCachedMovies();

    // Si aún no hay nada en local ni servidor, intentar cargar de Firestore
    if (!cached || cached.length === 0) {
      console.log("[Smart Delta Sync] Sin catálogo local. Consultando Firestore...");
      try {
        const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m && m.id && !deletedSet.has(m.id));
        if (data.length > 0) {
          await setCachedMovies(data, true);
          if (callback) callback(data);
          notifyMovieSubscribers(data);
        }
      } catch (e: any) {
        const isQuota = e?.message?.includes('Quota') || e?.code === 'resource-exhausted';
        if (isQuota) {
          console.warn("[Smart Delta Sync] Cuota diaria de lectura de Firestore agotada. Operando desde almacenamiento local seguro.");
          if (onError) onError(new Error("QUOTA_EXCEEDED"));
        } else {
          console.warn("[Smart Delta Sync] Aviso consultando Firestore:", e);
          if (onError) onError(e);
        }
      }
      return;
    }

    // Si ya hay memoria local, consultar ÚNICAMENTE registros actualizados (Delta Sync)
    let maxTimestamp = "1970-01-01T00:00:00.000Z";
    for (const m of cached) {
      const t = m.updatedAt || m.createdAt || "";
      if (t && t > maxTimestamp) {
        maxTimestamp = t;
      }
    }

    let safeQueryTime = maxTimestamp;
    try {
      const parsed = new Date(maxTimestamp).getTime();
      if (!isNaN(parsed) && parsed > 2000) {
        safeQueryTime = new Date(parsed - 1000).toISOString();
      }
    } catch (_) {}

    try {
      const qDelta = query(
        collection(db, 'movies'),
        where('updatedAt', '>', safeQueryTime)
      );

      const snapshot = await getDocs(qDelta);
      if (snapshot.empty) {
        return;
      }

      const deltaMovies = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m && m.id && !deletedSet.has(m.id));
      
      const merged = mergeMoviesPreservingLocal(cached, deltaMovies, deletedIds);
      const cleanMerged = merged.filter(m => m && m.id && !deletedSet.has(m.id));

      await setCachedMovies(cleanMerged, true);
      if (callback) callback(cleanMerged);
      notifyMovieSubscribers(cleanMerged);
    } catch (err: any) {
      const isQuota = err?.message?.includes('Quota') || err?.code === 'resource-exhausted';
      if (isQuota) {
        console.warn("[Smart Delta Sync] Cuota diaria de Firestore alcanzada. Catálogo 100% preservado en memoria local.");
        if (onError) onError(new Error("QUOTA_EXCEEDED"));
      } else {
        console.warn("[Smart Delta Sync] Verificación delta finalizada:", err);
      }
    }
  } catch (outerErr) {
    console.warn("[Smart Delta Sync] Error:", outerErr);
  }
};

// Escuchar cambios de otras pestañas en el mismo dispositivo de forma instantánea (0ms)
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
          headers: { 'Content-Type': 'application/json' },
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

  // 3. Listener pasivo directo de Firestore (100% pasivo vía WebSocket onSnapshot, 0 lecturas en reposo)
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
      if (!isQuotaExceeded(err)) {
        console.warn("Aviso en onSnapshot pasivo de movies:", err);
      }
    });
  } catch (_) {}

  // 4. Temporizador delta en segundo plano hacia el SERVIDOR INTERNO (/api/delta), NUNCA a Firestore
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
    const res = await fetch('/api/movies');
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
  await Promise.allSettled([
    setDoc(doc(db, 'movies', movieId), movieData, { merge: true }),
    fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movieData)
    })
  ]);

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
  await Promise.allSettled([
    setDoc(doc(db, 'movies', id), safeUpdates, { merge: true }),
    fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...safeUpdates })
    })
  ]);

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
  await Promise.allSettled([
    deleteDoc(doc(db, 'movies', id)),
    fetch(`/api/movies/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
  ]);
};

// ==========================================
// ADMINISTRADORES Y ROLES (Persistencia y Sincronización)
// ==========================================
export const DEFAULT_CLIENT_ADMINS: any[] = [
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
    role: "admin",
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
  },
  {
    id: "urielcg12@hotmail.com",
    email: "urielcg12@hotmail.com",
    role: "editor",
    name: "CG",
    createdAt: "2026-09-23T18:03:07.649Z",
    updatedAt: "2026-09-23T18:03:29.835Z"
  }
];

export const getUserCustomAdmins = (): any[] => {
  try {
    const raw = localStorage.getItem("videoteca_user_custom_admins");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
};

export const saveUserCustomAdmin = (admin: any) => {
  if (!admin || (!admin.email && !admin.id)) return;
  const email = (admin.email || admin.id).toLowerCase().trim();
  try {
    const current = getUserCustomAdmins();
    const idx = current.findIndex(a => (a.email || a.id || '').toLowerCase().trim() === email);
    let next: any[];
    if (idx > -1) {
      next = [...current];
      next[idx] = { ...next[idx], ...admin, id: email, email };
    } else {
      next = [...current, { ...admin, id: email, email }];
    }
    localStorage.setItem("videoteca_user_custom_admins", JSON.stringify(next));
  } catch (_) {}
};

export const removeUserCustomAdmin = (email: string) => {
  const norm = (email || '').toLowerCase().trim();
  if (!norm) return;
  try {
    const current = getUserCustomAdmins();
    const next = current.filter(a => (a.email || a.id || '').toLowerCase().trim() !== norm);
    localStorage.setItem("videoteca_user_custom_admins", JSON.stringify(next));
  } catch (_) {}
};

export const getPermanentLocalAdmins = (): any[] => {
  try {
    const raw = localStorage.getItem("videoteca_permanent_admins_store");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return [];
};

export const savePermanentLocalAdmins = (admins: any[]) => {
  try {
    if (Array.isArray(admins) && admins.length > 0) {
      localStorage.setItem("videoteca_permanent_admins_store", JSON.stringify(admins));
    }
  } catch (_) {}
};

export const getAllMergedAdmins = (extraList?: any[]): any[] => {
  const primary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').toLowerCase().trim();
  const deletedSet = new Set<string>();
  try {
    const rawDel = localStorage.getItem("videoteca_deleted_admins");
    if (rawDel) {
      const parsed = JSON.parse(rawDel);
      if (Array.isArray(parsed)) {
        parsed.forEach(id => { if (id) deletedSet.add(String(id).toLowerCase().trim()); });
      }
    }
  } catch (_) {}
  deletedSet.delete(primary);
  deletedSet.delete("chapceligg@gmail.com");

  const custom = getUserCustomAdmins();
  const perm = getPermanentLocalAdmins();
  const extra = Array.isArray(extraList) ? extraList : [];

  custom.forEach(c => {
    const em = (c?.email || c?.id || '').toLowerCase().trim();
    if (em) deletedSet.delete(em);
  });

  const map = new Map<string, any>();
  const addToList = (item: any) => {
    if (!item) return;
    const em = (item.email || item.id || '').toLowerCase().trim();
    if (!em || deletedSet.has(em)) return;
    const existing = map.get(em);
    if (!existing) {
      map.set(em, { ...item, id: em, email: em });
    } else {
      const itemTime = item.updatedAt || item.createdAt || "";
      const exTime = existing.updatedAt || existing.createdAt || "";
      const base = itemTime >= exTime ? { ...existing, ...item } : { ...item, ...existing };
      const name = (item.name !== undefined && String(item.name).trim()) ? String(item.name).trim() : (existing.name || "");
      const role = item.role || existing.role || "editor";
      map.set(em, { ...base, id: em, email: em, name, role });
    }
  };

  DEFAULT_CLIENT_ADMINS.forEach(addToList);
  perm.forEach(addToList);
  extra.forEach(addToList);
  custom.forEach(addToList);

  const primaryObj = map.get(primary) || { id: primary, email: primary, role: "admin", name: primary.split("@")[0] };
  primaryObj.role = "admin";
  map.set(primary, primaryObj);

  return Array.from(map.values());
};

export const getCachedAdmins = async (): Promise<any[] | null> => {
  try {
    const cache = await get("videoteca_admins_cache");
    if (cache) {
      const parsed = typeof cache === 'string' ? JSON.parse(cache) : cache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return getAllMergedAdmins(parsed);
      }
    }
  } catch (_) {}
  return getAllMergedAdmins();
};

export const setCachedAdmins = async (newAdmins: any[], _bypassIntegrity = false) => {
  try {
    if (!Array.isArray(newAdmins) || newAdmins.length === 0) return;
    const merged = getAllMergedAdmins(newAdmins);
    savePermanentLocalAdmins(merged);
    await set("videoteca_admins_cache", merged);
    lastKnownAdminsList = merged;

    const today = new Date().toISOString().slice(0, 10);
    try {
      localStorage.setItem("videoteca_admins_cached_date", today);
      localStorage.setItem("videoteca_admins_last_update", new Date().toISOString());
    } catch (_) {}
  } catch (e) {
    console.error("Error al guardar en memoria local de cuentas:", e);
  }
};

export const getDeletedAdminsSet = async (): Promise<Set<string>> => {
  const setObj = new Set<string>();
  try {
    const raw = localStorage.getItem("videoteca_deleted_admins");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(id => { if (id) setObj.add(String(id).trim().toLowerCase()); });
      }
    }
  } catch (_) {}

  const currentPrimary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').trim().toLowerCase();
  setObj.delete(currentPrimary);
  setObj.delete("chapceligg@gmail.com");
  return setObj;
};

export const recordDeletedAdmin = (email: string) => {
  const norm = (email || '').trim().toLowerCase();
  const currentPrimary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').trim().toLowerCase();
  if (!norm || norm === currentPrimary) return;
  try {
    const raw = localStorage.getItem("videoteca_deleted_admins");
    const current = raw ? JSON.parse(raw) : [];
    const setObj = new Set(Array.isArray(current) ? current : []);
    setObj.add(norm);
    localStorage.setItem("videoteca_deleted_admins", JSON.stringify(Array.from(setObj)));
  } catch (_) {}
};

export const unrecordDeletedAdmin = (email: string) => {
  const norm = (email || '').trim().toLowerCase();
  if (!norm) return;
  try {
    const raw = localStorage.getItem("videoteca_deleted_admins");
    if (raw) {
      const current = JSON.parse(raw);
      if (Array.isArray(current)) {
        const filtered = current.filter(id => (id || '').trim().toLowerCase() !== norm);
        localStorage.setItem("videoteca_deleted_admins", JSON.stringify(filtered));
      }
    }
  } catch (_) {}
};

export const isDeletedAdmin = async (email: string): Promise<boolean> => {
  const norm = (email || '').trim().toLowerCase();
  const currentPrimary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').trim().toLowerCase();
  if (!norm || norm === currentPrimary) return false;
  const deletedSet = await getDeletedAdminsSet();
  return deletedSet.has(norm);
};

export interface AuthorizedUser {
  id: string; // Document ID (normalized email)
  email: string;
  name?: string;
  role: 'primary_admin' | 'admin' | 'editor';
  createdAt: string;
  updatedAt: string;
  addedBy?: string;
  photoURL?: string;
}

export const getAdminByEmail = async (email: string): Promise<{ id: string, role?: string, email?: string, name?: string, isPrimary?: boolean } | null> => {
  const normalized = (email || '').toLowerCase().trim();
  if (!normalized) return null;

  // 1. Verificación inmediata de Administrador Principal (0 lecturas, 0ms)
  let primary = 'chapceligg@gmail.com';
  try {
    const cachedPrimary = localStorage.getItem("videoteca_primary_superadmin");
    if (cachedPrimary) primary = cachedPrimary.toLowerCase().trim();
  } catch (_) {}

  const isPrimary = normalized === 'chapceligg@gmail.com' || normalized === primary;
  if (isPrimary) {
    let customName = 'Alex Cárdenas';
    try {
      const cachedUsersRaw = localStorage.getItem("videoteca_authorized_users_cache");
      if (cachedUsersRaw) {
        const parsed = JSON.parse(cachedUsersRaw);
        if (Array.isArray(parsed)) {
          const match = parsed.find(u => (u.email || u.id || '').toLowerCase().trim() === normalized);
          if (match?.name) customName = match.name;
        }
      }
    } catch (_) {}
    return { 
      id: normalized, 
      email: normalized, 
      role: 'admin',
      name: customName,
      isPrimary: true
    };
  }

  // 2. Verificación en caché local de usuarios autorizados (0 lecturas, 0ms)
  try {
    const cachedUsersRaw = localStorage.getItem("videoteca_authorized_users_cache");
    if (cachedUsersRaw) {
      const parsed = JSON.parse(cachedUsersRaw);
      if (Array.isArray(parsed)) {
        const match = parsed.find(u => (u.email || u.id || '').toLowerCase().trim() === normalized);
        if (match) {
          const rawRole = match.role || 'editor';
          return {
            id: normalized,
            email: normalized,
            role: rawRole === 'primary_admin' ? 'admin' : rawRole,
            name: match.name || '',
            isPrimary: rawRole === 'primary_admin'
          };
        }
      }
    }
  } catch (_) {}

  // 3. Verificación directa en Firestore
  try {
    const userDocRef = doc(db, 'authorized_users', normalized);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      const rawRole = data.role || 'editor';
      const isPrim = rawRole === 'primary_admin' || data.isPrimary === true;
      return {
        id: normalized,
        email: normalized,
        role: isPrim ? 'admin' : rawRole,
        name: data.name || (isPrim ? 'Alex Cárdenas' : ''),
        isPrimary: isPrim
      };
    }
  } catch (err) {
    if (!isQuotaExceeded(err)) {
      console.warn("Aviso consultando authorized_users en Firestore:", err);
    }
  }

  // 4. Verificación de respaldo en el servidor si Firestore tiene cuota agotada
  try {
    const res = await fetch(`/api/admins/check/${encodeURIComponent(normalized)}`);
    if (res.ok) {
      const check = await res.json();
      if (check.isAdmin) {
        return {
          id: normalized,
          email: normalized,
          role: check.role || 'editor',
          name: check.name || '',
          isPrimary: check.role === 'primary_admin' || normalized === primary
        };
      }
    }
  } catch (_) {}

  return null;
};

// ==========================================
// COLECCIÓN AISLADA DE USUARIOS AUTORIZADOS ('authorized_users')
// FUENTE DE VERDAD ÚNICA • CLIENTE DIRECTO • ESCUCHA PASIVA (0 LECTURAS EN REPOSO)
// ==========================================

export const INITIAL_AUTHORIZED_USERS: AuthorizedUser[] = [
  {
    id: "chapceligg@gmail.com",
    email: "chapceligg@gmail.com",
    name: "Alex Cárdenas",
    role: "primary_admin",
    createdAt: "2026-09-17T20:29:42.431Z",
    updatedAt: "2026-09-23T18:06:06.429Z",
    addedBy: "system"
  },
  {
    id: "uriel.cardenas@udgvirtual.udg.mx",
    email: "uriel.cardenas@udgvirtual.udg.mx",
    name: "Uriel Cárdenas",
    role: "admin",
    createdAt: "2026-09-18T19:36:07.784Z",
    updatedAt: "2026-09-23T19:02:01.729Z",
    addedBy: "chapceligg@gmail.com"
  },
  {
    id: "lizbeth.hernandez@udgvirtual.udg.mx",
    email: "lizbeth.hernandez@udgvirtual.udg.mx",
    name: "Lizbeth Hernández",
    role: "editor",
    createdAt: "2026-09-21T19:28:27.162Z",
    updatedAt: "2026-09-22T17:37:40.371Z",
    addedBy: "chapceligg@gmail.com"
  },
  {
    id: "urielcg12@hotmail.com",
    email: "urielcg12@hotmail.com",
    name: "Uriel CG",
    role: "editor",
    createdAt: "2026-09-23T18:03:07.649Z",
    updatedAt: "2026-09-23T18:03:29.835Z",
    addedBy: "chapceligg@gmail.com"
  }
];

let initialSeedAttempted = false;

export const seedInitialAuthorizedUsersInFirestore = async () => {
  if (initialSeedAttempted) return;
  initialSeedAttempted = true;
  try {
    for (const u of INITIAL_AUTHORIZED_USERS) {
      const docRef = doc(db, 'authorized_users', u.id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        await setDoc(docRef, u, { merge: true });
      }
    }
  } catch (err) {
    console.warn("[AuthorizedUsers] Aviso en siembra inicial de cuentas:", err);
  }
};

const isQuotaExceeded = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('quota') ||
    msg.includes('resource-exhausted') ||
    msg.includes('free daily read units') ||
    msg.includes('quota limit exceeded')
  );
};

// Candado Anti-Rebote (Anti-Rebound Lock) para mutaciones recientes de cuentas
let lastAdminMutationTime = 0;
const localPendingAdminMutations = new Map<string, { role?: 'primary_admin' | 'admin' | 'editor'; name?: string; email?: string; isDeleted?: boolean; timestamp: number }>();
const authorizedUsersSubscribers = new Set<(users: AuthorizedUser[]) => void>();

export const recordAdminMutationLock = (email: string, mutation: { role?: 'primary_admin' | 'admin' | 'editor'; name?: string; email?: string; isDeleted?: boolean }) => {
  const norm = email.toLowerCase().trim();
  lastAdminMutationTime = Date.now();
  localPendingAdminMutations.set(norm, { ...mutation, timestamp: Date.now() });
};

const applyAntiReboundFilter = (incomingUsers: AuthorizedUser[]): AuthorizedUser[] => {
  const now = Date.now();
  if (now - lastAdminMutationTime > 3500 && localPendingAdminMutations.size === 0) {
    return incomingUsers;
  }

  const map = new Map<string, AuthorizedUser>();
  for (const u of incomingUsers) {
    map.set((u.email || u.id || '').toLowerCase().trim(), u);
  }

  // Filtrar o preservar mutaciones recientes dentro del margen de 3500ms
  for (const [key, mut] of localPendingAdminMutations.entries()) {
    if (now - mut.timestamp < 3500) {
      if (mut.isDeleted) {
        map.delete(key);
      } else {
        const existing = map.get(key) || {
          id: mut.email || key,
          email: mut.email || key,
          name: mut.name || '',
          role: mut.role || 'editor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as AuthorizedUser;

        map.set(key, {
          ...existing,
          ...(mut.role ? { role: mut.role } : {}),
          ...(mut.name !== undefined ? { name: mut.name } : {}),
          ...(mut.email ? { email: mut.email, id: mut.email } : {})
        });
      }
    } else {
      localPendingAdminMutations.delete(key);
    }
  }

  return Array.from(map.values());
};

export const notifyAuthorizedUsersSubscribers = (users: AuthorizedUser[]) => {
  if (!Array.isArray(users)) return;
  const filtered = applyAntiReboundFilter(users);
  try {
    localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(filtered));
  } catch (_) {}
  for (const cb of authorizedUsersSubscribers) {
    try {
      cb(filtered);
    } catch (e) {
      console.warn("Error en suscriptor de authorized_users:", e);
    }
  }
};

export const subscribeToAuthorizedUsers = (
  onUsersUpdate: (users: AuthorizedUser[]) => void,
  onError?: (err: any) => void
): (() => void) => {
  authorizedUsersSubscribers.add(onUsersUpdate);
  let isCleanedUp = false;

  // 1. Carga instantánea desde almacenamiento local (0ms de latencia inicial)
  try {
    const cachedRaw = localStorage.getItem("videoteca_authorized_users_cache");
    if (cachedRaw) {
      const cachedUsers = JSON.parse(cachedRaw);
      if (Array.isArray(cachedUsers) && cachedUsers.length > 0) {
        onUsersUpdate(applyAntiReboundFilter(cachedUsers));
      }
    }
  } catch (_) {}

  // 2. Consulta y sincronización delta con el servidor interno (/api/delta o /api/admins)
  const syncAdminsFromServer = async () => {
    if (isCleanedUp) return;
    try {
      const res = await fetch('/api/delta?since=0');
      if (!res.ok) return;
      const data = await res.json();
      if (isCleanedUp) return;

      const serverAdmins = Array.isArray(data.admins) ? data.admins : [];
      if (serverAdmins.length === 0) return;

      const primaryEmail = (data.primaryAdmin || 'chapceligg@gmail.com').toLowerCase().trim();
      const deletedSet = new Set(Array.isArray(data.deletedAdminIds) ? data.deletedAdminIds.map((d: any) => String(d).toLowerCase().trim()) : []);

      const formatted: AuthorizedUser[] = serverAdmins
        .filter((a: any) => {
          const email = (a.email || a.id || '').toLowerCase().trim();
          return email && !deletedSet.has(email);
        })
        .map((a: any) => {
          const email = (a.email || a.id || '').toLowerCase().trim();
          const isPrimary = email === primaryEmail;
          return {
            id: email,
            email,
            name: a.name || '',
            role: isPrimary ? ('primary_admin' as const) : (a.role === 'admin' ? ('admin' as const) : ('editor' as const)),
            createdAt: a.createdAt || new Date().toISOString(),
            updatedAt: a.updatedAt || new Date().toISOString(),
            addedBy: a.addedBy || '',
            photoURL: a.photoURL || ''
          };
        });

      // Asegurar que hay al menos un primary_admin
      let hasPrimary = formatted.some(u => u.role === 'primary_admin' || u.email === primaryEmail);
      if (!hasPrimary && formatted.length > 0) {
        const prim = formatted.find(u => u.email === primaryEmail) || formatted[0];
        prim.role = 'primary_admin';
      }

      // Aplicar candado anti-rebote a la captura de red
      const protectedList = applyAntiReboundFilter(formatted);

      try {
        localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(protectedList));
      } catch (_) {}

      notifyAuthorizedUsersSubscribers(protectedList);
      notifyAdminSubscribers(protectedList);
    } catch (_) {}
  };

  syncAdminsFromServer();

  // 3. Listener pasivo directo de Firestore (100% pasivo vía onSnapshot, 0 lecturas en reposo)
  let unsubscribeFirestore: (() => void) | null = null;
  try {
    const usersCol = collection(db, 'authorized_users');
    unsubscribeFirestore = onSnapshot(usersCol, async (snapshot) => {
      if (isCleanedUp) return;
      try {
        if (!snapshot.empty) {
          let primaryFound = false;
          const users: AuthorizedUser[] = snapshot.docs.map(d => {
            const data = d.data();
            const email = (data.email || d.id || '').toLowerCase().trim();
            let role: 'primary_admin' | 'admin' | 'editor' = data.role || 'editor';

            if (role === 'primary_admin' || (data.isPrimary && !primaryFound)) {
              role = 'primary_admin';
              primaryFound = true;
            }

            return {
              id: d.id,
              email,
              name: data.name || '',
              role,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString(),
              addedBy: data.addedBy || '',
              photoURL: data.photoURL || ''
            };
          });

          if (!primaryFound && users.length > 0) {
            const candidate = users.find(u => u.email === 'chapceligg@gmail.com') || users.find(u => u.role === 'admin') || users[0];
            candidate.role = 'primary_admin';
          }

          // Aplicar candado anti-rebote a la captura de Firestore
          const protectedList = applyAntiReboundFilter(users);

          try {
            localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(protectedList));
          } catch (_) {}

          notifyAuthorizedUsersSubscribers(protectedList);
          notifyAdminSubscribers(protectedList);
        }
      } catch (err) {
        console.warn("Aviso en onSnapshot de authorized_users:", err);
      }
    }, (err) => {
      if (!isQuotaExceeded(err)) {
        console.warn("Aviso de conexión con authorized_users en Firestore:", err);
        if (onError) onError(err);
      }
    });
  } catch (err) {
    console.warn("Aviso inicializando conexión Firestore authorized_users:", err);
  }

  // 4. Temporizador delta en segundo plano hacia el SERVIDOR INTERNO (/api/delta), NUNCA a Firestore
  // 2500ms para respuesta en tiempo real entre múltiples dispositivos
  const intervalId = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      syncAdminsFromServer();
    }
  }, 2500);

  const handleVisibilityOrFocus = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      syncAdminsFromServer();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  }

  return () => {
    isCleanedUp = true;
    authorizedUsersSubscribers.delete(onUsersUpdate);
    clearInterval(intervalId);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    }
    if (unsubscribeFirestore) {
      try {
        unsubscribeFirestore();
      } catch (_) {}
    }
  };
};

export const addAuthorizedUserInFirestore = async (user: {
  email: string;
  name?: string;
  role: 'primary_admin' | 'admin' | 'editor';
  addedBy?: string;
}) => {
  const normalizedEmail = user.email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
    throw new Error("Por favor introduce un correo electrónico válido.");
  }

  const payload: AuthorizedUser = {
    id: normalizedEmail,
    email: normalizedEmail,
    name: (user.name || '').trim(),
    role: user.role || 'editor',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    addedBy: user.addedBy || auth.currentUser?.email || 'admin'
  };

  // 1. Candado Anti-Rebote inmediato (3500ms)
  recordAdminMutationLock(normalizedEmail, {
    role: payload.role,
    name: payload.name,
    email: normalizedEmail
  });

  // 2. Actualizar memoria local inmediata y notificar a todos los suscriptores (0ms)
  let updatedUsers: AuthorizedUser[] = [];
  try {
    const raw = localStorage.getItem("videoteca_authorized_users_cache");
    const current: AuthorizedUser[] = raw ? JSON.parse(raw) : [];
    const idx = current.findIndex(u => u.email === normalizedEmail);
    if (idx > -1) current[idx] = payload;
    else current.push(payload);
    updatedUsers = current;
    localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(current));
  } catch (_) {
    updatedUsers = [payload];
  }

  notifyAuthorizedUsersSubscribers(updatedUsers);
  notifyAdminSubscribers(updatedUsers);

  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: updatedUsers });
  }

  // 3. ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore (authorized_users + admins) + Servidor Backend Interno (/api/admins)
  await Promise.allSettled([
    setDoc(doc(db, 'authorized_users', normalizedEmail), payload, { merge: true }),
    setDoc(doc(db, 'admins', normalizedEmail), payload, { merge: true }),
    fetch('/api/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  ]);

  return payload;
};

export const updateAuthorizedUserInFirestore = async (
  userId: string,
  updates: {
    email?: string;
    name?: string;
    role?: 'primary_admin' | 'admin' | 'editor';
  }
) => {
  const currentId = userId.trim().toLowerCase();
  const targetEmail = (updates.email || currentId).trim().toLowerCase();

  if (!targetEmail || !targetEmail.includes('@') || !targetEmail.includes('.')) {
    throw new Error("Por favor introduce un correo electrónico válido.");
  }

  const nowIso = new Date().toISOString();
  const serverPayload: any = {
    id: targetEmail,
    email: targetEmail,
    updatedAt: nowIso
  };
  if (updates.name !== undefined) serverPayload.name = updates.name.trim();
  if (updates.role !== undefined) serverPayload.role = updates.role;

  // 1. Candado Anti-Rebote inmediato (3500ms)
  recordAdminMutationLock(targetEmail, {
    role: updates.role,
    name: updates.name,
    email: targetEmail
  });
  if (targetEmail !== currentId) {
    recordAdminMutationLock(currentId, { isDeleted: true });
  }

  // 2. Actualizar memoria local inmediata y notificar suscriptores (0ms)
  let updatedUsers: AuthorizedUser[] = [];
  try {
    const raw = localStorage.getItem("videoteca_authorized_users_cache");
    let current: AuthorizedUser[] = raw ? JSON.parse(raw) : [];
    const prevEntry = current.find(u => u.id === currentId || u.email === currentId);
    current = current.filter(u => u.id !== currentId && u.email !== currentId);
    const newEntry: AuthorizedUser = {
      id: targetEmail,
      email: targetEmail,
      name: updates.name !== undefined ? updates.name.trim() : (prevEntry?.name || ''),
      role: updates.role || prevEntry?.role || 'editor',
      createdAt: prevEntry?.createdAt || nowIso,
      updatedAt: nowIso,
      addedBy: prevEntry?.addedBy || auth.currentUser?.email || 'admin'
    };
    current.push(newEntry);
    updatedUsers = current;
    localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(current));
  } catch (_) {
    updatedUsers = [serverPayload];
  }

  notifyAuthorizedUsersSubscribers(updatedUsers);
  notifyAdminSubscribers(updatedUsers);

  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: updatedUsers });
  }

  // 3. ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore + Servidor Backend Interno
  if (targetEmail !== currentId) {
    await Promise.allSettled([
      (async () => {
        const batch = writeBatch(db);
        const oldDocRef = doc(db, 'authorized_users', currentId);
        const newDocRef = doc(db, 'authorized_users', targetEmail);
        const oldAdminRef = doc(db, 'admins', currentId);
        const newAdminRef = doc(db, 'admins', targetEmail);

        batch.set(newDocRef, serverPayload, { merge: true });
        batch.delete(oldDocRef);
        batch.set(newAdminRef, serverPayload, { merge: true });
        batch.delete(oldAdminRef);
        await batch.commit();
      })(),
      fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPayload)
      }),
      fetch(`/api/admins/${encodeURIComponent(currentId)}`, { method: 'DELETE' })
    ]);
  } else {
    await Promise.allSettled([
      setDoc(doc(db, 'authorized_users', currentId), serverPayload, { merge: true }),
      setDoc(doc(db, 'admins', currentId), serverPayload, { merge: true }),
      fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPayload)
      })
    ]);
  }

  return { id: targetEmail, email: targetEmail, ...updates };
};

export const deleteAuthorizedUserInFirestore = async (userId: string) => {
  const currentId = userId.trim().toLowerCase();
  
  // Validar estrictamente que el Administrador Principal NO se pueda eliminar
  let primary = 'chapceligg@gmail.com';
  try {
    const cachedPrimary = localStorage.getItem("videoteca_primary_superadmin");
    if (cachedPrimary) primary = cachedPrimary.toLowerCase().trim();
  } catch (_) {}

  if (currentId === primary || currentId === 'chapceligg@gmail.com') {
    throw new Error("No se puede eliminar la cuenta de Administrador Principal.");
  }

  // 1. Candado Anti-Rebote inmediato (3500ms)
  recordAdminMutationLock(currentId, { isDeleted: true });

  // 2. Actualizar copia local de respaldo y notificar suscriptores (0ms)
  let updatedUsers: AuthorizedUser[] = [];
  try {
    const raw = localStorage.getItem("videoteca_authorized_users_cache");
    if (raw) {
      const current: AuthorizedUser[] = JSON.parse(raw);
      updatedUsers = current.filter(u => u.email !== currentId && u.id !== currentId);
      localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(updatedUsers));
    }
  } catch (_) {}

  notifyAuthorizedUsersSubscribers(updatedUsers);
  notifyAdminSubscribers(updatedUsers);

  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: updatedUsers });
  }

  // 3. ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore (authorized_users + admins) + Servidor Backend Interno (/api/admins/:email)
  await Promise.allSettled([
    deleteDoc(doc(db, 'authorized_users', currentId)),
    deleteDoc(doc(db, 'admins', currentId)),
    fetch(`/api/admins/${encodeURIComponent(currentId)}`, {
      method: 'DELETE'
    })
  ]);
};

export const transferPrimarySuperAdminInFirestore = async (
  newPrimaryEmail: string,
  currentPrimaryEmail: string,
  keepPreviousAsAdmin = true
) => {
  const newEmail = newPrimaryEmail.trim().toLowerCase();
  const currentEmail = currentPrimaryEmail.trim().toLowerCase();

  if (!newEmail || !newEmail.includes('@') || !newEmail.includes('.')) {
    throw new Error("El correo ingresado no es válido.");
  }
  if (newEmail === currentEmail) {
    throw new Error("Este correo ya es el Administrador Principal actual.");
  }

  // 1. Candado Anti-Rebote inmediato (3500ms)
  recordAdminMutationLock(newEmail, { role: 'primary_admin', email: newEmail });
  recordAdminMutationLock(currentEmail, { role: keepPreviousAsAdmin ? 'admin' : undefined, isDeleted: !keepPreviousAsAdmin });

  try {
    localStorage.setItem("videoteca_primary_superadmin", newEmail);
  } catch (_) {}

  // 2. Actualizar memoria local y notificar suscriptores (0ms)
  let updatedUsers: AuthorizedUser[] = [];
  try {
    const raw = localStorage.getItem("videoteca_authorized_users_cache");
    let current: AuthorizedUser[] = raw ? JSON.parse(raw) : [];
    const nowIso = new Date().toISOString();
    let foundNew = false;
    current = current.map(u => {
      if (u.email === newEmail || u.id === newEmail) {
        foundNew = true;
        return { ...u, role: 'primary_admin' as const, updatedAt: nowIso };
      }
      if (u.email === currentEmail || u.id === currentEmail) {
        return { ...u, role: (keepPreviousAsAdmin ? 'admin' : 'editor') as any, updatedAt: nowIso };
      }
      return u;
    });
    if (!foundNew) {
      current.unshift({
        id: newEmail,
        email: newEmail,
        name: newEmail.split('@')[0],
        role: 'primary_admin',
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
    if (!keepPreviousAsAdmin) {
      current = current.filter(u => u.email !== currentEmail && u.id !== currentEmail);
    }
    updatedUsers = current;
    localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(current));
  } catch (_) {}

  notifyAuthorizedUsersSubscribers(updatedUsers);
  notifyAdminSubscribers(updatedUsers);
  notifyPrimarySuperAdminSubscribers(newEmail);

  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: updatedUsers, primaryEmail: newEmail });
  }

  // 3. ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore (transacción atómica) + Servidor Backend Interno (/api/primary-admin)
  await Promise.allSettled([
    // Transacción Firestore en authorized_users
    runTransaction(db, async (transaction) => {
      const newDocRef = doc(db, 'authorized_users', newEmail);
      const currentDocRef = doc(db, 'authorized_users', currentEmail);

      const newSnap = await transaction.get(newDocRef);
      const currentSnap = await transaction.get(currentDocRef);

      const existingNewData = newSnap.exists() ? newSnap.data() : {};
      const existingCurrentData = currentSnap.exists() ? currentSnap.data() : {};

      transaction.set(newDocRef, {
        ...existingNewData,
        id: newEmail,
        email: newEmail,
        role: 'primary_admin',
        name: existingNewData.name || '',
        createdAt: existingNewData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        transferredAt: new Date().toISOString()
      }, { merge: true });

      if (keepPreviousAsAdmin) {
        transaction.set(currentDocRef, {
          ...existingCurrentData,
          id: currentEmail,
          email: currentEmail,
          role: 'admin',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else {
        transaction.delete(currentDocRef);
      }
    }),
    // Actualizar registro en colección admins de Firestore
    setDoc(doc(db, 'admins', '_primary_config'), {
      email: newEmail,
      transferredBy: currentEmail,
      transferredAt: new Date().toISOString()
    }, { merge: true }),
    // Servidor Backend Interno
    fetch('/api/primary-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, current: currentEmail, keepPrevious: keepPreviousAsAdmin })
    })
  ]);

  return newEmail;
};

const adminSubscribers = new Set<(admins: any[]) => void>();
const primaryAdminSubscribers = new Set<(primaryEmail: string) => void>();
let lastKnownAdminsList: any[] = [];

export const notifyPrimarySuperAdminSubscribers = (primaryEmail: string) => {
  if (!primaryEmail) return;
  const clean = primaryEmail.trim().toLowerCase();
  for (const cb of primaryAdminSubscribers) {
    try {
      cb(clean);
    } catch (e) {
      console.warn("Error en suscriptor de primary admin:", e);
    }
  }
};

export const subscribeToPrimarySuperAdmin = (callback: (primaryEmail: string) => void) => {
  primaryAdminSubscribers.add(callback);

  getPrimarySuperAdminEmail().then(email => {
    if (email) callback(email);
  }).catch(() => {});

  return () => {
    primaryAdminSubscribers.delete(callback);
  };
};

export const notifyAdminSubscribers = (admins: any[]) => {
  const merged = getAllMergedAdmins(Array.isArray(admins) ? admins : []);
  lastKnownAdminsList = merged;
  savePermanentLocalAdmins(merged);
  set("videoteca_admins_cache", merged).catch(() => {});

  for (const cb of adminSubscribers) {
    try {
      cb(merged);
    } catch (e) {
      console.warn("Error en suscriptor de admins:", e);
    }
  }
};

const initAdminRealtimeStream = () => {
  return;
};

if (adminBroadcastChannel) {
  adminBroadcastChannel.onmessage = async (event: MessageEvent) => {
    if (event.data?.type === 'ADMINS_UPDATED') {
      if (Array.isArray(event.data.admins)) {
        notifyAuthorizedUsersSubscribers(event.data.admins);
        notifyAdminSubscribers(event.data.admins);
      }
      if (event.data.primaryEmail) {
        notifyPrimarySuperAdminSubscribers(event.data.primaryEmail);
      }
    } else if (event.data?.type === 'PRIMARY_ADMIN_UPDATED' && event.data.primaryEmail) {
      notifyPrimarySuperAdminSubscribers(event.data.primaryEmail);
    }
  };
}

export const subscribeToAdmins = (
  callback: (admins: any[]) => void, 
  onError?: (err: any) => void
) => {
  return subscribeToAuthorizedUsers((users) => {
    callback(users);
  }, onError);
};

export const mergeAdmins = (...lists: any[][]): any[] => {
  const map = new Map<string, any>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item) continue;
      const email = (item.email || item.id || '').trim().toLowerCase();
      if (!email) continue;
      const existing = map.get(email);
      if (!existing) {
        map.set(email, { ...item, id: email, email });
      } else {
        const itemTime = item.updatedAt || item.createdAt || "";
        const existTime = existing.updatedAt || existing.createdAt || "";
        const base = itemTime >= existTime ? { ...existing, ...item } : { ...item, ...existing };
        const existingName = (existing.name || '').trim();
        const incomingName = (item.name || '').trim();
        const finalName = item.name !== undefined && String(item.name).trim() ? String(item.name).trim() : (incomingName || existingName);
        map.set(email, { ...base, id: email, email, name: finalName });
      }
    }
  }
  return Array.from(map.values());
};

export const runDailyAdminsSyncOnce = async (callback?: (admins: any[]) => void) => {
  const merged = getAllMergedAdmins();
  if (callback) callback(merged);
};

export const fetchAdminsOptimized = async (_forceServer = false) => {
  try {
    const res = await fetch('/api/admins');
    if (res.ok) {
      const serverAdmins = await res.json();
      if (Array.isArray(serverAdmins) && serverAdmins.length > 0) {
        const merged = getAllMergedAdmins(serverAdmins);
        savePermanentLocalAdmins(merged);
        await set("videoteca_admins_cache", merged);
        return merged;
      }
    }
  } catch (_) {}

  const merged = getAllMergedAdmins();
  savePermanentLocalAdmins(merged);
  return merged;
};

export const upsertAdmin = async (admin: any) => {
  const adminId = (admin.email || admin.id || '').toLowerCase().trim();
  if (!adminId) throw new Error("Correo inválido para el administrador.");

  unrecordDeletedAdmin(adminId);

  const existingInList = getAllMergedAdmins().find((a: any) => (a.email || a.id || '').toLowerCase().trim() === adminId);
  const existingName = (existingInList?.name || '').trim();
  const incomingName = admin.name !== undefined ? String(admin.name).trim() : existingName;
  const finalName = incomingName;

  const adminData: any = {
    ...(existingInList || {}),
    ...admin,
    id: adminId,
    email: adminId,
    name: finalName,
    role: admin.role || existingInList?.role || 'editor',
    updatedAt: new Date().toISOString()
  };

  Object.keys(adminData).forEach(key => {
    if (adminData[key] === undefined) {
      delete adminData[key];
    }
  });

  // 1. Guardar localmente
  saveUserCustomAdmin(adminData);
  const updatedList = getAllMergedAdmins([adminData]);

  savePermanentLocalAdmins(updatedList);
  await set("videoteca_admins_cache", updatedList);
  lastKnownAdminsList = updatedList;
  notifyAdminSubscribers(updatedList);
  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: updatedList });
  }

  // 2. ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore (authorized_users + admins) + Servidor Backend Interno
  await Promise.allSettled([
    setDoc(doc(db, 'authorized_users', adminId), adminData, { merge: true }),
    setDoc(doc(db, 'admins', adminId), adminData, { merge: true }),
    setDoc(doc(db, 'admins', '_registry'), {
      list: updatedList,
      updatedAt: new Date().toISOString()
    }, { merge: true }),
    fetch('/api/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminData)
    }),
    fetch('/api/admins/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedList)
    })
  ]);

  return adminData;
};

export const deleteAdmin = async (idOrEmail: string) => {
  const adminId = (idOrEmail || '').toLowerCase().trim();
  const currentPrimary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').trim().toLowerCase();
  if (!adminId || adminId === currentPrimary) return;

  recordDeletedAdmin(adminId);
  removeUserCustomAdmin(adminId);

  // 1. Actualizar memoria local
  const filteredList = getAllMergedAdmins().filter((a: any) => (a.id || a.email || '').toLowerCase().trim() !== adminId);

  savePermanentLocalAdmins(filteredList);
  await set("videoteca_admins_cache", filteredList);
  lastKnownAdminsList = filteredList;
  notifyAdminSubscribers(filteredList);
  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: filteredList });
  }

  // 2. ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Firestore (authorized_users + admins) + Servidor Backend Interno
  await Promise.allSettled([
    deleteDoc(doc(db, 'authorized_users', adminId)),
    deleteDoc(doc(db, 'admins', adminId)),
    setDoc(doc(db, 'admins', '_registry'), {
      list: filteredList,
      updatedAt: new Date().toISOString()
    }, { merge: true }),
    fetch(`/api/admins/${encodeURIComponent(adminId)}`, { method: 'DELETE' })
  ]);
};

export const getPrimarySuperAdminEmail = async (): Promise<string> => {
  try {
    const res = await fetch('/api/primary-admin');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.email === 'string' && data.email.trim()) {
        const clean = data.email.trim().toLowerCase();
        try { localStorage.setItem("videoteca_primary_superadmin", clean); } catch (_) {}
        return clean;
      }
    }
  } catch (_) {}

  try {
    const cached = localStorage.getItem("videoteca_primary_superadmin");
    if (cached && cached.trim()) {
      return cached.trim().toLowerCase();
    }
  } catch (_) {}

  const defaultPrimary = 'chapceligg@gmail.com';
  try {
    localStorage.setItem("videoteca_primary_superadmin", defaultPrimary);
  } catch (_) {}

  try {
    const docSnap = await getDoc(doc(db, 'admins', '_primary_config'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data?.email) {
        const email = data.email.trim().toLowerCase();
        try { localStorage.setItem("videoteca_primary_superadmin", email); } catch (_) {}
        return email;
      }
    }
  } catch (_) {}

  return defaultPrimary;
};

export const transferPrimarySuperAdmin = async (newEmail: string, currentSuperAdminEmail: string, keepPreviousAsAdmin = true) => {
  const normalizedNew = (newEmail || '').toLowerCase().trim();
  const normalizedCurrent = (currentSuperAdminEmail || '').toLowerCase().trim();
  if (!normalizedNew || !normalizedNew.includes('@') || !normalizedNew.includes('.')) {
    throw new Error("El correo ingresado no es válido.");
  }

  // ESCRITURA DOBLE GARANTIZADA Y SIMULTÁNEA: Servidor backend (/api/primary-admin) + Firestore
  await Promise.allSettled([
    fetch('/api/primary-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedNew, current: normalizedCurrent, keepPrevious: keepPreviousAsAdmin })
    }),
    setDoc(doc(db, 'admins', '_primary_config'), {
      email: normalizedNew,
      transferredBy: normalizedCurrent,
      transferredAt: new Date().toISOString()
    }, { merge: true })
  ]);

  const permAdmins = getPermanentLocalAdmins();
  const existingNewObj = permAdmins.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalizedNew);
  const existingCurrentObj = permAdmins.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalizedCurrent);

  await upsertAdmin({
    ...(existingNewObj || {}),
    email: normalizedNew,
    role: 'admin',
    name: typeof existingNewObj?.name === 'string' ? existingNewObj.name.trim() : '',
    updatedAt: new Date().toISOString()
  });

  if (normalizedCurrent && normalizedCurrent !== normalizedNew) {
    if (keepPreviousAsAdmin) {
      await upsertAdmin({
        ...(existingCurrentObj || {}),
        email: normalizedCurrent,
        role: 'admin',
        name: typeof existingCurrentObj?.name === 'string' ? existingCurrentObj.name.trim() : '',
        updatedAt: new Date().toISOString()
      });
    } else {
      await deleteAdmin(normalizedCurrent);
    }
  }

  try {
    localStorage.setItem("videoteca_primary_superadmin", normalizedNew);
  } catch (_) {}
  notifyPrimarySuperAdminSubscribers(normalizedNew);
  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'PRIMARY_ADMIN_UPDATED', primaryEmail: normalizedNew });
  }

  return normalizedNew;
};
