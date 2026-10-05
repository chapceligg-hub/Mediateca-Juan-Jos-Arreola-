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

  // 3. Listener de cambios individuales en Firestore en segundo plano (Delta onSnapshot)
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

  // 2. Guardar en Firestore directamente (Sin intermediarios de Vercel)
  try {
    await setDoc(doc(db, 'movies', movieId), movieData, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar en Firestore (registro asegurado en memoria local):", err);
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

  // Sincronizar en Firestore directamente
  try {
    await updateDoc(doc(db, 'movies', id), safeUpdates);
  } catch (err) {
    console.warn("Aviso al actualizar en Firestore (actualizado en memoria local):", err);
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

  // Eliminar en Firestore directamente
  try {
    await deleteDoc(doc(db, 'movies', id));
  } catch (err) {
    console.warn("Aviso al eliminar en Firestore (eliminado en memoria local):", err);
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

  // 3. Verificación directa en Firestore (sin intermediario de Vercel)
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

export const subscribeToAuthorizedUsers = (
  onUsersUpdate: (users: AuthorizedUser[]) => void,
  onError?: (err: any) => void
): (() => void) => {
  let isCleanedUp = false;

  // 1. Carga instantánea desde Caché Nativa de Firestore y LocalStorage (0 ms de latencia inicial)
  (async () => {
    try {
      const cachedSnap = await getDocsFromCache(collection(db, 'authorized_users'));
      if (!cachedSnap.empty && !isCleanedUp) {
        const cachedDocs = cachedSnap.docs.map(d => ({ id: d.id, ...d.data() } as AuthorizedUser));
        onUsersUpdate(cachedDocs);
      }
    } catch (_) {
      try {
        const cachedRaw = localStorage.getItem("videoteca_authorized_users_cache");
        if (cachedRaw && !isCleanedUp) {
          const cachedUsers = JSON.parse(cachedRaw);
          if (Array.isArray(cachedUsers) && cachedUsers.length > 0) {
            onUsersUpdate(cachedUsers);
          }
        }
      } catch (_) {}
    }
  })();

  // 2. Conexión 100% directa y pasiva con Firestore 'authorized_users' (0 lecturas en reposo)
  let unsubscribeFirestore: (() => void) | null = null;
  try {
    const usersCol = collection(db, 'authorized_users');
    unsubscribeFirestore = onSnapshot(usersCol, { includeMetadataChanges: true }, async (snapshot) => {
      if (isCleanedUp) return;
      try {
        if (snapshot.empty) {
          // Si la colección está vacía en la nube, entregamos y subimos los usuarios iniciales
          onUsersUpdate(INITIAL_AUTHORIZED_USERS);
          for (const u of INITIAL_AUTHORIZED_USERS) {
            setDoc(doc(db, 'authorized_users', u.id), u, { merge: true }).catch(() => {});
          }
          return;
        }

        let primaryFound = false;
        const existingEmails = new Set<string>();
        const users: AuthorizedUser[] = snapshot.docs.map(d => {
          const data = d.data();
          const email = (data.email || d.id || '').toLowerCase().trim();
          existingEmails.add(email);
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

        // Asegurar que las cuentas base iniciales queden en la nube si alguna falta
        for (const seed of INITIAL_AUTHORIZED_USERS) {
          if (!existingEmails.has(seed.email)) {
            setDoc(doc(db, 'authorized_users', seed.id), seed, { merge: true }).catch(() => {});
          }
        }

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
        console.warn("Aviso en onSnapshot de authorized_users:", err);
      }
    }, (err) => {
      console.warn("Aviso de conexión con authorized_users en Firestore:", err);
      if (onError) onError(err);
    });
  } catch (err) {
    console.warn("Aviso inicializando conexión Firestore authorized_users:", err);
  }

  // Siembra inicial asíncrona no bloqueante
  seedInitialAuthorizedUsersInFirestore().catch(() => {});

  return () => {
    isCleanedUp = true;
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

  // Guardar exclusivamente en la colección única 'authorized_users'
  try {
    const docRef = doc(db, 'authorized_users', normalizedEmail);
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso: Cuota de Firestore excedida al agregar cuenta.");
    } else {
      console.warn("Aviso al guardar en Firestore authorized_users:", err);
      throw err;
    }
  }

  // Actualizar copia local de respaldo
  try {
    const raw = localStorage.getItem("videoteca_authorized_users_cache");
    const current: AuthorizedUser[] = raw ? JSON.parse(raw) : [];
    const idx = current.findIndex(u => u.email === normalizedEmail);
    if (idx > -1) current[idx] = payload;
    else current.push(payload);
    localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(current));
  } catch (_) {}

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

  // Sincronizar en Firestore directamente en 'authorized_users'
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
      return { id: currentId, ...payload };
    }
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso: Cuota de Firestore excedida al actualizar usuario.");
    } else {
      console.warn("Aviso al actualizar en Firestore authorized_users:", err);
      throw err;
    }
    return { id: targetEmail, email: targetEmail, ...updates };
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

  // Eliminar en Firestore directamente desde la colección única 'authorized_users'
  try {
    const docRef = doc(db, 'authorized_users', currentId);
    await deleteDoc(docRef);
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso: Cuota de Firestore excedida al eliminar.");
    } else {
      console.warn("Aviso en Firestore al eliminar usuario de authorized_users:", err);
      throw err;
    }
  }

  // Actualizar copia local de respaldo
  try {
    const raw = localStorage.getItem("videoteca_authorized_users_cache");
    if (raw) {
      const current: AuthorizedUser[] = JSON.parse(raw);
      const filtered = current.filter(u => u.email !== currentId && u.id !== currentId);
      localStorage.setItem("videoteca_authorized_users_cache", JSON.stringify(filtered));
    }
  } catch (_) {}
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

  try {
    localStorage.setItem("videoteca_primary_superadmin", newEmail);
  } catch (_) {}

  // Traspaso atómico vía transacción (runTransaction) en la colección 'authorized_users'
  try {
    await runTransaction(db, async (transaction) => {
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
    });
  } catch (err) {
    if (isQuotaExceeded(err)) {
      console.warn("Aviso: Cuota de Firestore excedida al transferir titular.");
    } else {
      console.warn("Aviso en Firestore al transferir titular:", err);
      throw err;
    }
  }

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
    if (event.data?.type === 'ADMINS_UPDATED' && Array.isArray(event.data.admins)) {
      notifyAdminSubscribers(event.data.admins);
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
