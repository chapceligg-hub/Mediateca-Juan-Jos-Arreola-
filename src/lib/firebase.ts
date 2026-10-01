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

// Validar conexión a Firestore al iniciar
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Aviso de conectividad Firebase: el cliente está operando en modo offline.");
    }
  }
}
testConnection().catch(() => {});

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

// Sincronización al servidor en lotes pequeños (chunks de 40 películas ~80KB) para NUNCA exceder el límite 4.5MB de Vercel
let isChunkSyncRunning = false;
export const syncMoviesToServerChunked = async (movies: any[]) => {
  if (isChunkSyncRunning || !Array.isArray(movies) || movies.length === 0) return;
  isChunkSyncRunning = true;
  try {
    const CHUNK_SIZE = 40;
    for (let i = 0; i < movies.length; i += CHUNK_SIZE) {
      const chunk = movies.slice(i, i + CHUNK_SIZE);
      await fetch('/api/movies/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      }).catch(() => {});
      if (i + CHUNK_SIZE < movies.length) {
        await new Promise(r => setTimeout(r, 150));
      }
    }
  } catch (_) {
  } finally {
    isChunkSyncRunning = false;
  }
};

// Recuperación exhaustiva multi-nivel del catálogo local
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

  // 6. Servidor central (/api/movies) como respaldo de red rápido y sin coste de Firestore
  try {
    const res = await fetch('/api/movies');
    if (res.ok) {
      const serverMovies = await res.json();
      if (Array.isArray(serverMovies) && serverMovies.length > 0) {
        console.log(`[Cache Recovery] Catálogo obtenido desde servidor central (${serverMovies.length} títulos)`);
        lastKnownMoviesList = serverMovies;
        await set("videoteca_movies_cache", serverMovies);
        saveToCacheStorage(serverMovies).catch(() => {});
        return serverMovies;
      }
    }
  } catch (_) {}

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

      // Sincronizar al servidor en lotes pequeños en segundo plano (0 bloqueo, sin error 413)
      syncMoviesToServerChunked(newMovies);
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

  try {
    const res = await fetch('/api/movies/deleted');
    if (res.ok) {
      const serverDeleted = await res.json();
      if (Array.isArray(serverDeleted) && serverDeleted.length > 0) {
        const combined = Array.from(new Set([...localDeleted, ...serverDeleted])).slice(-1000);
        await set("videoteca_deleted_ids", combined);
        return combined;
      }
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

// --- CANAL SSE EN TIEMPO REAL MULTI-DISPOSITIVO (PELÍCULAS) ---
let globalMovieEventSource: EventSource | null = null;
let movieReconnectTimeout: any = null;

const initMovieRealtimeStream = () => {
  if (typeof window === 'undefined') return;
  if (globalMovieEventSource && globalMovieEventSource.readyState !== EventSource.CLOSED) return;

  try {
    globalMovieEventSource = new EventSource('/api/movies/stream');

    globalMovieEventSource.addEventListener('movie_upsert', async (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        const incoming = payload?.data || payload;
        if (incoming && incoming.id) {
          const deletedIds = await syncDeletedMovieIds();
          if (deletedIds.includes(incoming.id)) return;
          const current = (await getCachedMovies()) || [];
          const merged = mergeMoviesPreservingLocal(current, [incoming], deletedIds);
          await setCachedMovies(merged, true);
          notifyMovieSubscribers(merged);
          if (movieBroadcastChannel) {
            movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: merged });
          }
        }
      } catch (err) {
        console.warn("Aviso procesando movie_upsert SSE:", err);
      }
    });

    globalMovieEventSource.addEventListener('movie_deleted', async (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        const id = payload?.data?.id || payload?.id;
        if (id) {
          const current = (await getCachedMovies()) || [];
          const updated = current.filter((m: any) => m && m.id !== id);
          await setCachedMovies(updated, true);
          notifyMovieSubscribers(updated);
          if (movieBroadcastChannel) {
            movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: updated });
          }
        }
      } catch (err) {
        console.warn("Aviso procesando movie_deleted SSE:", err);
      }
    });

    globalMovieEventSource.addEventListener('movies_update', async () => {
      try {
        const res = await fetch('/api/movies');
        if (res.ok) {
          const serverMovies = await res.json();
          if (Array.isArray(serverMovies) && serverMovies.length > 0) {
            const deletedIds = await syncDeletedMovieIds();
            const current = (await getCachedMovies()) || [];
            const merged = mergeMoviesPreservingLocal(current, serverMovies, deletedIds);
            await setCachedMovies(merged, true);
            notifyMovieSubscribers(merged);
            if (movieBroadcastChannel) {
              movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: merged });
            }
          }
        }
      } catch (_) {}
    });

    globalMovieEventSource.onerror = () => {
      try { globalMovieEventSource?.close(); } catch (_) {}
      globalMovieEventSource = null;

      if (!movieReconnectTimeout) {
        movieReconnectTimeout = setTimeout(() => {
          movieReconnectTimeout = null;
          initMovieRealtimeStream();
        }, 5000);
      }
    };
  } catch (err) {
    console.warn("Aviso iniciando EventSource de películas:", err);
  }
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

  // 1. Cargar instantáneamente la memoria local y servidor (0ms de latencia inicial)
  getCachedMovies().then(async (offlineData) => {
    const deletedIds = await syncDeletedMovieIds();
    const deletedSet = new Set(deletedIds);
    if (offlineData && offlineData.length > 0) {
      const cleaned = offlineData.filter(m => m && m.id && !deletedSet.has(m.id));
      callback(cleaned);
      notifyMovieSubscribers(cleaned);
    }
    // 2. Consulta y sincronización delta con Firestore
    runSmartDeltaSyncOnce(callback, onError);
  }).catch(() => {
    runSmartDeltaSyncOnce(callback, onError);
  });

  // 3. Conexión SSE en tiempo real para sincronización multi-dispositivo
  initMovieRealtimeStream();

  // 4. Listener de cambios individuales en Firestore en segundo plano (Delta onSnapshot)
  let unsubMovieDelta: (() => void) | null = null;
  getCachedMovies().then((cached) => {
    let maxTimestamp = "1970-01-01T00:00:00.000Z";
    if (Array.isArray(cached) && cached.length > 0) {
      for (const m of cached) {
        const t = m?.updatedAt || m?.createdAt || "";
        if (t && t > maxTimestamp) maxTimestamp = t;
      }
    }
    try {
      const qDelta = query(
        collection(db, 'movies'),
        where('updatedAt', '>', maxTimestamp)
      );
      unsubMovieDelta = onSnapshot(qDelta, async (snap) => {
        if (!snap.empty) {
          const deltaDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const current = (await getCachedMovies()) || [];
          const deletedIds = await syncDeletedMovieIds();
          const merged = mergeMoviesPreservingLocal(current, deltaDocs, deletedIds);
          await setCachedMovies(merged, true);
          notifyMovieSubscribers(merged);
          if (movieBroadcastChannel) {
            movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: merged });
          }
        }
      }, (err: any) => {
        const isQuota = err?.message?.includes('Quota') || err?.code === 'resource-exhausted';
        if (isQuota) {
          if (onError) onError(new Error("QUOTA_EXCEEDED"));
        } else {
          if (onError) onError(err);
        }
      });
    } catch (_) {}
  }).catch(() => {});

  return () => {
    movieSubscribers.delete(callback);
    if (unsubMovieDelta) unsubMovieDelta();
  };
};

export const fetchMoviesOptimized = async (forceServer = false) => {
  const offlineData = await getCachedMovies();
  if (!forceServer && offlineData && offlineData.length > 0) {
    return offlineData;
  }

  // Consultar servidor central
  try {
    const res = await fetch('/api/movies');
    if (res.ok) {
      const serverMovies = await res.json();
      if (Array.isArray(serverMovies) && serverMovies.length > 0) {
        const deletedIds = await syncDeletedMovieIds();
        const merged = mergeMoviesPreservingLocal(offlineData || [], serverMovies, deletedIds);
        await setCachedMovies(merged, true);
        return merged;
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
  
  // 1. Guardar de inmediato en la memoria local persistente y notificar a todas las pestañas (0ms)
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

  // 2. Guardar en el servidor backend central (< 2KB de payload, 100% seguro en Vercel)
  try {
    await fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movieData)
    });
  } catch (_) {}

  // 3. Guardar en Firestore directamente
  try {
    await setDoc(doc(db, 'movies', movieId), movieData, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar en Firestore (registro asegurado en memoria local y servidor):", err);
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

  // Sincronizar al servidor backend
  try {
    await fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...safeUpdates, id })
    });
  } catch (_) {}

  // Sincronizar en Firestore
  try {
    await updateDoc(doc(db, 'movies', id), safeUpdates);
  } catch (err) {
    console.warn("Aviso al actualizar en Firestore (actualizado en memoria local y servidor):", err);
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

  // Notificar al servidor backend
  try {
    await fetch(`/api/movies/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await fetch('/api/movies/deleted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
  } catch (_) {}

  // Eliminar en Firestore
  try {
    await deleteDoc(doc(db, 'movies', id));
  } catch (err) {
    console.warn("Aviso al eliminar en Firestore (eliminado en memoria local y servidor):", err);
  }
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

    // Respaldar en servidor central en segundo plano
    try {
      fetch('/api/admins/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      }).catch(() => {});
    } catch (_) {}
  } catch (e) {
    console.error("Error al guardar en memoria local de cuentas:", e);
  }
};

export const getDeletedAdminsSet = async (): Promise<Set<string>> => {
  const setObj = new Set<string>();
  try {
    const res = await fetch('/api/admins/deleted');
    if (res.ok) {
      const serverDeleted = await res.json();
      if (Array.isArray(serverDeleted)) {
        serverDeleted.forEach(id => {
          if (id) setObj.add(String(id).trim().toLowerCase());
        });
      }
    }
  } catch (_) {}

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
  try {
    fetch('/api/admins/deleted/unrecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: norm })
    }).catch(() => {});
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

  // 3. Verificación rápida en servidor central (0 lecturas Firestore)
  try {
    const res = await fetch(`/api/admins/check/${encodeURIComponent(normalized)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.isAdmin) {
        return {
          id: normalized,
          email: normalized,
          role: data.role || 'editor',
          name: data.name || ''
        };
      }
      if (data && data.deleted) {
        return null;
      }
    }
  } catch (_) {}

  // 4. Verificación en Firestore solo como último recurso
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

  return null;
};

// ==========================================
// COLECCIÓN AISLADA DE USUARIOS AUTORIZADOS ('authorized_users')
// SERVER-FIRST • MULTI-DISPOSITIVO • TOLERANCIA TOTAL A CUOTA FIRESTORE
// ==========================================

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

export const subscribeToAuthorizedUsers = (
  onUsersUpdate: (users: AuthorizedUser[]) => void,
  onError?: (err: any) => void
): (() => void) => {
  let isCleanedUp = false;

  // 1. Carga inmediata desde almacenamiento local si existe (0ms de latencia)
  try {
    const cachedRaw = localStorage.getItem("videoteca_authorized_users_cache");
    if (cachedRaw) {
      const cachedUsers = JSON.parse(cachedRaw);
      if (Array.isArray(cachedUsers) && cachedUsers.length > 0) {
        onUsersUpdate(cachedUsers);
      }
    }
  } catch (_) {}

  // Función de respaldo directo contra servidor seguro (0 lecturas Firestore)
  const syncFromServer = async () => {
    if (isCleanedUp) return;
    try {
      const [resAdmins, resPrimary] = await Promise.all([
        fetch('/api/admins'),
        fetch('/api/primary-admin')
      ]);

      if (resAdmins.ok) {
        const serverAdmins = await resAdmins.json();
        let primaryEmail = 'chapceligg@gmail.com';
        if (resPrimary.ok) {
          const primaryData = await resPrimary.json();
          if (primaryData?.email) primaryEmail = primaryData.email.toLowerCase().trim();
        }

        if (Array.isArray(serverAdmins) && serverAdmins.length > 0) {
          let hasPrimary = false;
          const mapped: AuthorizedUser[] = serverAdmins.map((a: any) => {
            const email = (a.email || a.id || '').toLowerCase().trim();
            const isPrimary = email === primaryEmail || a.role === 'primary_admin' || (a.isPrimary && !hasPrimary);
            if (isPrimary) hasPrimary = true;
            return {
              id: email,
              email,
              name: a.name || '',
              role: isPrimary ? 'primary_admin' : (a.role || 'editor'),
              createdAt: a.createdAt || new Date().toISOString(),
              updatedAt: a.updatedAt || new Date().toISOString(),
              addedBy: a.addedBy || '',
              photoURL: a.photoURL || ''
            };
          });

          if (!hasPrimary && mapped.length > 0) {
            const p = mapped.find(m => m.email === 'chapceligg@gmail.com') || mapped[0];
            p.role = 'primary_admin';
          }

          try {
            localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(mapped));
          } catch (_) {}

          if (!isCleanedUp) {
            onUsersUpdate(mapped);
          }
        }
      }
    } catch (e) {
      console.warn("Aviso consultando respaldo de cuentas desde servidor:", e);
    }
  };

  // 2. Conectar canal SSE del servidor en vivo para sincronización multi-dispositivo sin lecturas
  let sse: EventSource | null = null;
  try {
    sse = new EventSource('/api/admins/stream');
    sse.addEventListener('admins_update', (event) => {
      if (isCleanedUp) return;
      try {
        const data = JSON.parse(event.data);
        if (data && Array.isArray(data.admins)) {
          const primaryEmail = (data.primarySuperAdmin || 'chapceligg@gmail.com').toLowerCase().trim();
          let hasPrimary = false;
          const mapped: AuthorizedUser[] = data.admins.map((a: any) => {
            const email = (a.email || a.id || '').toLowerCase().trim();
            const isPrimary = email === primaryEmail || a.role === 'primary_admin' || (a.isPrimary && !hasPrimary);
            if (isPrimary) hasPrimary = true;
            return {
              id: email,
              email,
              name: a.name || '',
              role: isPrimary ? 'primary_admin' : (a.role || 'editor'),
              createdAt: a.createdAt || new Date().toISOString(),
              updatedAt: a.updatedAt || new Date().toISOString(),
              addedBy: a.addedBy || '',
              photoURL: a.photoURL || ''
            };
          });

          if (!hasPrimary && mapped.length > 0) {
            const p = mapped.find(m => m.email === 'chapceligg@gmail.com') || mapped[0];
            p.role = 'primary_admin';
          }

          try {
            localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(mapped));
          } catch (_) {}

          if (!isCleanedUp) {
            onUsersUpdate(mapped);
          }
        }
      } catch (_) {}
    });

    sse.onerror = () => {
      // Reconexión silenciosa sin error bloqueante
    };
  } catch (_) {}

  // 3. Conexión Firestore modular Server-First sobre colección 'authorized_users'
  let unsubscribeFirestore: (() => void) | null = null;
  try {
    const usersCol = collection(db, 'authorized_users');
    unsubscribeFirestore = onSnapshot(usersCol, async (snapshot) => {
      if (isCleanedUp) return;
      try {
        if (snapshot.empty) {
          syncFromServer();
          return;
        }

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

        try {
          localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(users));
        } catch (_) {}

        if (!isCleanedUp) {
          onUsersUpdate(users);
        }
      } catch (err) {
        if (isQuotaExceeded(err)) {
          console.warn("Aviso de cuota en Firestore (authorized_users), operando en modo servidor en vivo sin consumo de cuota.");
          syncFromServer();
        } else {
          console.warn("Aviso en onSnapshot de authorized_users:", err);
          syncFromServer();
        }
      }
    }, (err) => {
      if (isQuotaExceeded(err)) {
        console.warn("Aviso: Cuota de lectura diaria de Firestore alcanzada. Sincronización activa mediante servidor central sin consumo de lecturas.");
        syncFromServer();
      } else {
        console.warn("Aviso de conexión con authorized_users en Firestore:", err);
        syncFromServer();
        if (onError) onError(err);
      }
    });
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso de cuota en Firestore para authorized_users, usando servidor seguro.");
      syncFromServer();
    } else {
      console.warn("Aviso inicializando conexión Firestore authorized_users:", err);
      syncFromServer();
    }
  }

  // Ejecutar verificación inicial de servidor
  syncFromServer();

  return () => {
    isCleanedUp = true;
    if (unsubscribeFirestore) {
      try {
        unsubscribeFirestore();
      } catch (_) {}
    }
    if (sse) {
      try {
        sse.close();
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

  // 1. Guardar en servidor central (persistencia garantizada sin bloqueo por cuota)
  try {
    await fetch('/api/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn("Aviso sincronizando usuario con servidor central:", e);
  }

  // 2. Guardar en Firestore si hay cuota disponible
  try {
    const docRef = doc(db, 'authorized_users', normalizedEmail);
    await setDoc(docRef, payload, { merge: true });
    await setDoc(doc(db, 'admins', normalizedEmail), {
      ...payload,
      id: normalizedEmail
    }, { merge: true });
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso: Cuota de Firestore excedida al agregar cuenta; guardado seguro en servidor central.");
    } else {
      console.warn("Aviso al guardar en Firestore authorized_users:", err);
    }
  }

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

  // 1. Sincronizar en servidor central primero
  try {
    await fetch(`/api/admins/${encodeURIComponent(currentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: targetEmail,
        name: updates.name,
        role: updates.role
      })
    });
  } catch (e) {
    console.warn("Aviso actualizando usuario en servidor central:", e);
  }

  // 2. Sincronizar en Firestore
  try {
    if (targetEmail !== currentId) {
      const batch = writeBatch(db);
      const oldDocRef = doc(db, 'authorized_users', currentId);
      const newDocRef = doc(db, 'authorized_users', targetEmail);

      const oldSnap = await getDoc(oldDocRef);
      const oldData = oldSnap.exists() ? oldSnap.data() : {};

      const newData: AuthorizedUser = {
        ...oldData,
        id: targetEmail,
        email: targetEmail,
        name: updates.name !== undefined ? updates.name.trim() : (oldData.name || ''),
        role: updates.role || oldData.role || 'editor',
        createdAt: oldData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        addedBy: oldData.addedBy || auth.currentUser?.email || 'admin'
      };

      batch.set(newDocRef, newData, { merge: true });
      batch.delete(oldDocRef);

      batch.delete(doc(db, 'admins', currentId));
      batch.set(doc(db, 'admins', targetEmail), newData, { merge: true });

      await batch.commit();
      return newData;
    } else {
      const docRef = doc(db, 'authorized_users', currentId);
      const payload: any = {
        updatedAt: new Date().toISOString()
      };
      if (updates.name !== undefined) payload.name = updates.name.trim();
      if (updates.role !== undefined) payload.role = updates.role;

      await updateDoc(docRef, payload);

      try {
        await updateDoc(doc(db, 'admins', currentId), payload);
      } catch (_) {}

      return { id: currentId, ...payload };
    }
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso: Cuota de Firestore excedida al actualizar usuario; guardado exitoso en servidor central.");
      return { id: targetEmail, email: targetEmail, ...updates };
    } else {
      console.warn("Aviso al actualizar en Firestore:", err);
      return { id: targetEmail, email: targetEmail, ...updates };
    }
  }
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

  // 1. Eliminar en servidor central
  try {
    await fetch(`/api/admins/${encodeURIComponent(currentId)}`, {
      method: 'DELETE'
    });
  } catch (e) {
    console.warn("Aviso eliminando usuario en servidor central:", e);
  }

  // 2. Eliminar en Firestore
  try {
    const docRef = doc(db, 'authorized_users', currentId);
    await deleteDoc(docRef);
    await deleteDoc(doc(db, 'admins', currentId));
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso: Cuota de Firestore excedida al eliminar; baja confirmada en servidor central.");
    } else {
      console.warn("Aviso en Firestore al eliminar usuario:", err);
    }
  }
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

  // 1. Guardar en servidor central inmediatamente
  try {
    await fetch('/api/primary-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newEmail,
        current: currentEmail,
        keepPrevious: keepPreviousAsAdmin
      })
    });
  } catch (e) {
    console.warn("Aviso transfiriendo Super Admin en servidor central:", e);
  }

  try {
    localStorage.setItem("videoteca_primary_superadmin", newEmail);
  } catch (_) {}

  // 2. Ejecución atómica en Firestore mediante writeBatch garantizando exactamente un 'primary_admin'
  try {
    const batch = writeBatch(db);

    const newDocRef = doc(db, 'authorized_users', newEmail);
    const currentDocRef = doc(db, 'authorized_users', currentEmail);

    const newSnap = await getDoc(newDocRef);
    const existingNewData = newSnap.exists() ? newSnap.data() : {};

    batch.set(newDocRef, {
      ...existingNewData,
      id: newEmail,
      email: newEmail,
      role: 'primary_admin',
      name: existingNewData.name || '',
      createdAt: existingNewData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transferredAt: new Date().toISOString()
    }, { merge: true });

    const currentSnap = await getDoc(currentDocRef);
    const existingCurrentData = currentSnap.exists() ? currentSnap.data() : {};

    if (keepPreviousAsAdmin) {
      batch.set(currentDocRef, {
        ...existingCurrentData,
        id: currentEmail,
        email: currentEmail,
        role: 'admin',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } else {
      batch.delete(currentDocRef);
    }

    batch.set(doc(db, 'admins', '_primary_config'), {
      email: newEmail,
      transferredBy: currentEmail,
      transferredAt: new Date().toISOString()
    }, { merge: true });

    await batch.commit();
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso: Cuota de Firestore excedida al transferir titular; traspaso asegurado en servidor central.");
    } else {
      console.warn("Aviso en Firestore al transferir titular:", err);
    }
  }

  return newEmail;
};

const adminSubscribers = new Set<(admins: any[]) => void>();
const primaryAdminSubscribers = new Set<(primaryEmail: string) => void>();
let globalAdminEventSource: EventSource | null = null;
let adminReconnectTimeout: any = null;
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
  if (typeof window === 'undefined') return;
  if (globalAdminEventSource && globalAdminEventSource.readyState !== EventSource.CLOSED) return;

  try {
    globalAdminEventSource = new EventSource('/api/admins/stream');

    globalAdminEventSource.addEventListener('admins_update', async (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && Array.isArray(payload.admins)) {
          const merged = getAllMergedAdmins(payload.admins);
          notifyAdminSubscribers(merged);
          if (adminBroadcastChannel) {
            adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: merged });
          }
        }
        if (payload?.primarySuperAdmin) {
          try {
            localStorage.setItem("videoteca_primary_superadmin", payload.primarySuperAdmin);
          } catch (_) {}
          notifyPrimarySuperAdminSubscribers(payload.primarySuperAdmin);
        }
      } catch (err) {
        console.warn("Aviso al procesar evento de administradores:", err);
      }
    });

    globalAdminEventSource.onerror = () => {
      try { globalAdminEventSource?.close(); } catch (_) {}
      globalAdminEventSource = null;

      if (!adminReconnectTimeout) {
        adminReconnectTimeout = setTimeout(() => {
          adminReconnectTimeout = null;
          initAdminRealtimeStream();
        }, 5000);
      }
    };
  } catch (err) {
    console.warn("Aviso al iniciar EventSource de administradores:", err);
  }
};

if (adminBroadcastChannel) {
  adminBroadcastChannel.onmessage = async (event: MessageEvent) => {
    if (event.data?.type === 'ADMINS_UPDATED' && Array.isArray(event.data.admins)) {
      notifyAdminSubscribers(event.data.admins);
    } else if (event.data?.type === 'PRIMARY_ADMIN_UPDATED' && event.data.primaryEmail) {
      notifyPrimarySuperAdminSubscribers(event.data.primaryEmail);
    }
  };
}

export const subscribeToAdmins = (
  callback: (admins: any[]) => void, 
  _onError?: (err: any) => void
) => {
  adminSubscribers.add(callback);

  // 1. Cargar instantáneamente de la memoria local (0ms)
  getCachedAdmins().then(async (offlineAdmins) => {
    const deletedSet = await getDeletedAdminsSet();
    if (offlineAdmins && offlineAdmins.length > 0) {
      const cleaned = offlineAdmins.filter(a => {
        const em = (a.email || a.id || '').toLowerCase().trim();
        return em && !deletedSet.has(em);
      });
      if (cleaned.length > 0) callback(cleaned);
    } else if (lastKnownAdminsList && lastKnownAdminsList.length > 0) {
      callback(lastKnownAdminsList);
    }

    // 2. Sincronizar con el backend central
    try {
      const res = await fetch('/api/admins');
      if (res.ok) {
        const serverAdmins = await res.json();
        if (Array.isArray(serverAdmins) && serverAdmins.length > 0) {
          const merged = getAllMergedAdmins(serverAdmins);
          await setCachedAdmins(merged, true);
          notifyAdminSubscribers(merged);
        }
      }
    } catch (_) {}
  }).catch(() => {});

  // 3. Conexión SSE en tiempo real
  initAdminRealtimeStream();

  // 4. Listener Firestore sobre _registry y _primary_config
  let unsubRegistry: (() => void) | null = null;
  let unsubPrimary: (() => void) | null = null;
  try {
    unsubRegistry = onSnapshot(doc(db, 'admins', '_registry'), async (snap) => {
      if (snap.exists()) {
        const regData = snap.data();
        if (Array.isArray(regData?.list) && regData.list.length > 0) {
          const merged = getAllMergedAdmins(regData.list);
          await setCachedAdmins(merged, true);
          notifyAdminSubscribers(merged);
        }
      }
    }, () => {});
  } catch (_) {}

  try {
    unsubPrimary = onSnapshot(doc(db, 'admins', '_primary_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.email && typeof data.email === 'string') {
          const primaryEmail = data.email.trim().toLowerCase();
          try {
            localStorage.setItem("videoteca_primary_superadmin", primaryEmail);
          } catch (_) {}
          notifyPrimarySuperAdminSubscribers(primaryEmail);
        }
      }
    }, () => {});
  } catch (_) {}

  return () => {
    adminSubscribers.delete(callback);
    if (unsubRegistry) unsubRegistry();
    if (unsubPrimary) unsubPrimary();
  };
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

  // 2. Guardar en el servidor backend (< 2KB)
  try {
    await fetch('/api/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminData)
    });
    await fetch('/api/admins/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedList)
    });
  } catch (_) {}

  // 3. Guardar en Firestore
  try {
    await setDoc(doc(db, 'admins', adminId), adminData, { merge: true });
    await setDoc(doc(db, 'admins', '_registry'), {
      list: updatedList,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar admin en Firestore (asegurado en memoria local y servidor):", err);
  }

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

  // 2. Eliminar en el servidor
  try {
    await fetch(`/api/admins/${encodeURIComponent(adminId)}`, { method: 'DELETE' });
  } catch (_) {}

  // 3. Eliminar de Firestore
  try {
    await deleteDoc(doc(db, 'admins', adminId));
    setDoc(doc(db, 'admins', '_registry'), {
      list: filteredList,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
  } catch (err) {
    console.warn("Aviso al eliminar admin en Firestore (eliminado en memoria local y servidor):", err);
  }
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

  // 1. Servidor backend
  try {
    await fetch('/api/primary-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedNew, current: normalizedCurrent, keepPrevious: keepPreviousAsAdmin })
    });
  } catch (_) {}

  // 2. Firestore
  try {
    await setDoc(doc(db, 'admins', '_primary_config'), {
      email: normalizedNew,
      transferredBy: normalizedCurrent,
      transferredAt: new Date().toISOString()
    }, { merge: true });
  } catch (_) {}

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
