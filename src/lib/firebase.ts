import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged as firebaseOnAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  initializeFirestore, memoryLocalCache,
  getDocsFromCache, query, orderBy, limit, where, onSnapshot, getDocFromServer
} from 'firebase/firestore';
import { get, set } from 'idb-keyval';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Inicializar Firestore con memoria local y long-polling forzado:
// Esto previene al 100% fallos internos de WebChannel y cuellos de botella de IndexedDB residual
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalForceLongPolling: true,
}, (firebaseConfig as any).firestoreDatabaseId);

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// Validar conexión a Firestore al iniciar
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Aviso de conectividad Firebase: el cliente está operando en modo desconectado/offline.");
    }
  }
}
testConnection().catch(() => {});

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
  // Operación local sin overhead
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
// (0ms de latencia entre pestañas locales)
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
// PERSISTENCIA INMUTABLE LOCAL (PELÍCULAS)
// (CacheStorage + IndexedDB + Memoria RAM)
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
  
  // Proteger la memoria contra vaciados accidentales o pérdidas por fallos de red
  if (newCount === 0 && currentCount > 0) {
    console.warn(`[Integrity Check] Se bloqueó intento de vaciar la caché. Actual: ${currentCount}, Nuevo: ${newCount}`);
    return false;
  }
  if (currentCount > 10 && newCount < (currentCount * 0.15)) {
    console.warn(`[Integrity Check] Alerta de reducción drástica de películas. Se bloqueó sobreescribir la caché. Actual: ${currentCount}, Nuevo: ${newCount}`);
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

export const getCachedMovies = async (): Promise<any[] | null> => {
  // 1. Memoria RAM instantánea (0ms)
  if (lastKnownMoviesList && Array.isArray(lastKnownMoviesList) && lastKnownMoviesList.length > 0) {
    return lastKnownMoviesList;
  }

  // 2. IndexedDB (idb-keyval)
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

  // 3. CacheStorage permanente (inmune a desalojos de IndexedDB)
  try {
    const fromCacheStorage = await getFromCacheStorage();
    if (fromCacheStorage && fromCacheStorage.length > 0) {
      lastKnownMoviesList = fromCacheStorage;
      set("videoteca_movies_cache", fromCacheStorage).catch(() => {});
      return fromCacheStorage;
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
    }
  } catch (e) {
    console.error("Error al escribir en la caché local IndexedDB:", e);
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

let hasRunInitialDeltaSync = false;

// Delta Sync inteligente: recupera ÚNICAMENTE películas modificadas desde la última fecha local
export const runSmartDeltaSyncOnce = async (callback?: (movies: any[]) => void) => {
  if (hasRunInitialDeltaSync) return;
  hasRunInitialDeltaSync = true;

  try {
    const deletedIds = await syncDeletedMovieIds();
    const deletedSet = new Set(deletedIds);

    let cached = await getCachedMovies();

    // Si no hay absolutamente nada en local, hacer descarga inicial desde Firestore
    if (!cached || cached.length === 0) {
      console.log("[Smart Delta Sync] Sin catálogo local. Obteniendo catálogo inicial de Firestore...");
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
      } catch (e) {
        console.warn("[Smart Delta Sync] Lectura inicial Firestore limitada:", e);
      }
      return;
    }

    const cleanCached = cached.filter(m => m && m.id && !deletedSet.has(m.id));
    if (cleanCached.length !== cached.length) {
      await setCachedMovies(cleanCached, true);
      if (callback) callback(cleanCached);
      notifyMovieSubscribers(cleanCached);
    }

    // Identificar el registro más reciente en la memoria local
    let maxTimestamp = "1970-01-01T00:00:00.000Z";
    for (const m of cleanCached) {
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

    console.log(`[Smart Delta Sync] Verificando novedades posteriores a ${safeQueryTime}...`);
    const qDelta = query(
      collection(db, 'movies'),
      where('updatedAt', '>', safeQueryTime)
    );

    const snapshot = await getDocs(qDelta);
    if (snapshot.empty) {
      console.log("[Smart Delta Sync] Catálogo al día. 0 lecturas adicionales consumidas.");
      return;
    }

    const deltaMovies = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => m && m.id && !deletedSet.has(m.id));
    
    console.log(`[Smart Delta Sync] Se sincronizaron ${deltaMovies.length} película(s) actualizada(s).`);

    const merged = mergeMoviesPreservingLocal(cleanCached, deltaMovies, deletedIds);
    const cleanMerged = merged.filter(m => m && m.id && !deletedSet.has(m.id));

    await setCachedMovies(cleanMerged, true);
    if (callback) callback(cleanMerged);
    notifyMovieSubscribers(cleanMerged);
  } catch (err) {
    console.log("[Smart Delta Sync] Verificación delta finalizada (operando con copia local segura):", err);
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
  _onError?: (err: any) => void
) => {
  movieSubscribers.add(callback);

  // 1. Cargar instantáneamente la copia en memoria local de IndexedDB / CacheStorage (0ms)
  syncDeletedMovieIds().then(async (deletedIds) => {
    const offlineData = await getCachedMovies();
    if (offlineData && offlineData.length > 0) {
      const deletedSet = new Set(deletedIds);
      const cleaned = offlineData.filter(m => m && m.id && !deletedSet.has(m.id));
      callback(cleaned);
      if (cleaned.length !== offlineData.length) {
        await setCachedMovies(cleaned, true);
      }
    }
    runSmartDeltaSyncOnce(callback);
  }).catch(() => {
    runSmartDeltaSyncOnce(callback);
  });

  // 2. Delta Sync & onSnapshot en segundo plano para cambios en tiempo real
  let unsubMovieDelta: (() => void) | null = null;
  getCachedMovies().then((cached) => {
    let maxTimestamp = new Date().toISOString();
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
      }, () => {
        // Silenciar errores de cuota para mantener funcionamiento transparente
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
  
  // 1. Guardar de inmediato en la memoria local persistente y notificar a todas las pestañas
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
    console.error("Error actualizando la caché local tras upsertMovie:", e);
  }

  // 2. Guardar en Firestore directamente (Delta Sync)
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

  // Los correos creados o editados por el usuario se rescatan siempre
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

  // Asegurar que el Administrador Principal siempre exista con rol 'admin'
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
    console.error("Error al guardar en caché local de cuentas:", e);
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

export const getAdminByEmail = async (email: string): Promise<{ id: string, role?: string, email?: string, name?: string } | null> => {
  const normalized = (email || '').toLowerCase().trim();
  if (!normalized) return null;

  let primary = 'chapceligg@gmail.com';
  try {
    const cachedPrimary = localStorage.getItem("videoteca_primary_superadmin");
    if (cachedPrimary) primary = cachedPrimary.toLowerCase().trim();
  } catch (_) {}

  const isPrimary = normalized === 'chapceligg@gmail.com' || normalized === primary;

  if (!isPrimary && (await isDeletedAdmin(normalized))) {
    return null;
  }

  if (isPrimary) {
    return { 
      id: normalized, 
      email: normalized, 
      role: 'admin',
      name: 'Alex Cárdenas'
    };
  }

  try {
    const offlineAdmins = await getCachedAdmins();
    if (offlineAdmins && Array.isArray(offlineAdmins)) {
      const found = offlineAdmins.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalized);
      if (found) {
        return {
          id: normalized,
          email: normalized,
          role: found.role || 'editor',
          name: found.name || ''
        };
      }
    }
  } catch (_) {}

  // Fallback directo a Firestore
  try {
    const docSnap = await getDoc(doc(db, 'admins', normalized));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: normalized,
        email: normalized,
        role: data.role || 'editor',
        name: data.name || ''
      };
    }
  } catch (_) {}

  return null;
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

  // 1. Cargar instantáneamente de la memoria local
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
  }).catch(() => {});

  // 2. onSnapshot inteligente en segundo plano sobre _registry
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

  // 2. Guardar en Firestore
  try {
    await setDoc(doc(db, 'admins', adminId), adminData, { merge: true });
    await setDoc(doc(db, 'admins', '_registry'), {
      list: updatedList,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar admin en Firestore (asegurado en memoria local):", err);
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

  // 2. Eliminar de Firestore
  try {
    await deleteDoc(doc(db, 'admins', adminId));
    setDoc(doc(db, 'admins', '_registry'), {
      list: filteredList,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
  } catch (err) {
    console.warn("Aviso al eliminar admin en Firestore (eliminado en memoria local):", err);
  }
};

export const getPrimarySuperAdminEmail = async (): Promise<string> => {
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

  // 1. Guardar en Firestore configuración de Administrador Principal
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
