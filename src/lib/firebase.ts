import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc,
  query, orderBy, onSnapshot, where, Timestamp, serverTimestamp
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
// (Local-First 0ms IndexedDB + Firestore Delta Event-Driven)
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

const IDB_MOVIES_KEY = "videoteca_movies_cache";
const LOCAL_SYNC_KEY = "lastLocalSyncTimestamp";
let lastKnownMoviesList: any[] = [];
const movieSubscribers = new Set<(movies: any[]) => void>();

export const getMoviesCacheKey = () => IDB_MOVIES_KEY;

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
      lastKnownMoviesList = event.data.movies;
      await set(IDB_MOVIES_KEY, event.data.movies).catch(() => {});
      notifyMovieSubscribers(event.data.movies);
    }
  };
}

export const getCachedMovies = async (): Promise<any[] | null> => {
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

  // Búsqueda en claves de respaldo de versiones previas
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

  // Respaldo en localStorage
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

export const setCachedMovies = async (newMovies: any[]) => {
  try {
    if (!Array.isArray(newMovies)) return;
    lastKnownMoviesList = newMovies;
    await set(IDB_MOVIES_KEY, newMovies);
  } catch (e) {
    console.error("Error guardando películas en IndexedDB:", e);
  }
};

/**
 * Sincronización Pública Universal (Event-Driven / 0 Temporizadores / Memory-Safe)
 * Aplica para 'viewer', 'editor' y 'owner'.
 */
export const subscribeToMovies = (
  callback: (movies: any[]) => void,
  onError?: (err: any) => void
) => {
  movieSubscribers.add(callback);
  let isCleanedUp = false;
  let unsubSyncDoc: (() => void) | null = null;

  const dispatchMovies = (movies: any[]) => {
    if (isCleanedUp || !Array.isArray(movies)) return;
    movies.sort((a, b) => {
      const timeA = a.createdAt || a.updatedAt || "";
      const timeB = b.createdAt || b.updatedAt || "";
      return timeB.localeCompare(timeA);
    });
    callback(movies);
    notifyMovieSubscribers(movies);
  };

  (async () => {
    try {
      const localCached = await getCachedMovies();
      const localCount = Array.isArray(localCached) ? localCached.length : 0;

      if (localCount > 0) {
        // SI INDEXEDDB TIENE > 0 PELÍCULAS:
        // * Carga inmediatamente el catálogo local al estado de React (setMovies) a 0 ms.
        // * Queda ESTRICTAMENTE PROHIBIDO ejecutar getDocs o onSnapshot sobre la colección entera movies.
        // * Conecta UN SOLO onSnapshot pasivo a doc(db, "settings", "sync") (1 sola lectura por sesión).
        dispatchMovies(localCached);
        if (typeof window !== 'undefined' && !localStorage.getItem(LOCAL_SYNC_KEY)) {
          localStorage.setItem(LOCAL_SYNC_KEY, Date.now().toString());
        }
      } else {
        // SI INDEXEDDB TIENE STRICTAMENTE 0 PELÍCULAS:
        // * Ejecuta getDocs(collection(db, "movies")) por ÚNICA VEZ para llenar IndexedDB y guarda localStorage.setItem('lastLocalSyncTimestamp', Date.now()).
        try {
          const q = query(collection(db, "movies"), orderBy("createdAt", "desc"));
          const snapshot = await getDocs(q);
          if (!snapshot.empty && !isCleanedUp) {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            await setCachedMovies(data);
            if (typeof window !== 'undefined') {
              localStorage.setItem(LOCAL_SYNC_KEY, Date.now().toString());
            }
            dispatchMovies(data);
          } else if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_SYNC_KEY, Date.now().toString());
          }
        } catch (fetchErr: any) {
          console.warn("Aviso en consulta inicial de Firestore (0 películas locales):", fetchErr);
          onError?.(fetchErr);
        }
      }

      if (isCleanedUp) return;

      // Conecta UN SOLO escuchador pasivo onSnapshot apuntando ÚNICAMENTE al documento de control doc(db, "settings", "sync") (1 sola lectura por sesión)
      unsubSyncDoc = onSnapshot(doc(db, "settings", "sync"), async (syncSnap) => {
        if (isCleanedUp || !syncSnap.exists()) return;
        const syncData = syncSnap.data();

        try {
          const currentLocal = (await getCachedMovies()) || [];
          let workingList = [...currentLocal];
          let hasLocalChanges = false;

          // Manejo de eliminación
          if (syncData?.action === 'delete') {
            const delId = syncData.deletedMovieId;
            if (delId) {
              const beforeCount = workingList.length;
              workingList = workingList.filter(m => m.id !== delId);
              if (workingList.length !== beforeCount) {
                hasLocalChanges = true;
              }
            }
          }

          // Consulta Delta a Firestore: where("updatedAt", ">", lastLocalSyncTimestamp)
          const rawSync = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_SYNC_KEY) : null;
          const syncNum = Number(rawSync) || 0;
          const safetyDate = new Date(Math.max(0, syncNum - 2000));
          const safetyTimestamp = Timestamp.fromDate(safetyDate);
          const safetyIso = safetyDate.toISOString();

          let deltaMovies: any[] = [];
          try {
            const deltaSnap = await getDocs(query(
              collection(db, "movies"),
              where("updatedAt", ">", safetyTimestamp)
            ));
            if (!deltaSnap.empty) {
              deltaMovies = deltaSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
          } catch (_) {
            try {
              const deltaSnapStr = await getDocs(query(
                collection(db, "movies"),
                where("updatedAt", ">", safetyIso)
              ));
              if (!deltaSnapStr.empty) {
                deltaMovies = deltaSnapStr.docs.map(d => ({ id: d.id, ...d.data() }));
              }
            } catch (_) {}
          }

          if (deltaMovies.length === 0) {
            try {
              const deltaSnapStr = await getDocs(query(
                collection(db, "movies"),
                where("updatedAt", ">", safetyIso)
              ));
              if (!deltaSnapStr.empty) {
                deltaMovies = deltaSnapStr.docs.map(d => ({ id: d.id, ...d.data() }));
              }
            } catch (_) {}
          }

          if (deltaMovies.length > 0) {
            const map = new Map<string, any>();
            for (const m of workingList) {
              if (m && m.id) map.set(m.id, m);
            }

            for (const dm of deltaMovies) {
              if (!dm || !dm.id) continue;
              const existing = map.get(dm.id);
              if (!existing) {
                map.set(dm.id, dm);
                hasLocalChanges = true;
              } else {
                map.set(dm.id, { ...existing, ...dm });
                hasLocalChanges = true;
              }
            }
            workingList = Array.from(map.values());
          }

          if (hasLocalChanges) {
            await setCachedMovies(workingList);
            dispatchMovies(workingList);
          }

          if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_SYNC_KEY, Date.now().toString());
          }
        } catch (deltaErr: any) {
          console.warn("Aviso en procesamiento delta:", deltaErr);
          onError?.(deltaErr);
        }
      }, (listenerErr: any) => {
        console.warn("Aviso en onSnapshot pasivo de settings/sync:", listenerErr);
        onError?.(listenerErr);
      });

    } catch (outerErr: any) {
      console.warn("Error en inicio de suscripción:", outerErr);
      onError?.(outerErr);
    }
  })();

  // Limpieza estricta para evitar fugas de memoria y acumulación de listeners
  return () => {
    isCleanedUp = true;
    movieSubscribers.delete(callback);
    if (unsubSyncDoc) {
      try {
        unsubSyncDoc();
      } catch (_) {}
      unsubSyncDoc = null;
    }
  };
};

export const fetchMoviesOptimized = async () => {
  return (await getCachedMovies()) || [];
};

export const generateMovieId = () => {
  return doc(collection(db, 'movies')).id;
};

export const upsertMovie = async (movie: any) => {
  const movieId = movie.id || generateMovieId();
  const nowIso = new Date().toISOString();
  const nowTimestamp = Date.now();
  const movieData = {
    ...movie,
    id: movieId,
    createdAt: movie.createdAt || nowIso,
    updatedAt: nowIso
  };

  // 1. Optimistic UI local instantáneo a 0ms en IndexedDB y pestañas abiertas
  try {
    const current = (await getCachedMovies()) || [];
    const map = new Map<string, any>();
    for (const m of current) {
      if (m && m.id) map.set(m.id, m);
    }
    map.set(movieId, { ...(map.get(movieId) || {}), ...movieData });
    const updatedList = Array.from(map.values()).sort((a, b) => {
      const timeA = a.createdAt || a.updatedAt || "";
      const timeB = b.createdAt || b.updatedAt || "";
      return timeB.localeCompare(timeA);
    });
    await setCachedMovies(updatedList);
    notifyMovieSubscribers(updatedList);
    if (movieBroadcastChannel) {
      movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: updatedList });
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_SYNC_KEY, nowTimestamp.toString());
    }
  } catch (e) {
    console.error("Error actualizando memoria local tras upsertMovie:", e);
  }

  // 2. Persistencia en Firestore (colección movies) y documento de control (settings/sync)
  try {
    await setDoc(doc(db, 'movies', movieId), {
      ...movieData,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'settings', 'sync'), {
      lastUpdated: serverTimestamp(),
      lastUpdate: nowIso,
      timestamp: nowTimestamp,
      action: 'upsert',
      updatedMovieId: movieId
    }, { merge: true });

    // Notificar al servidor Express para mutación respaldada
    fetch('/api/movies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(movieData)
    }).catch(() => {});
  } catch (err) {
    console.warn("Aviso escribiendo en Firestore (los datos persisten en la memoria local):", err);
  }

  return movieData;
};

export const updateMovie = async (id: string, updates: any) => {
  const nowIso = new Date().toISOString();
  const nowTimestamp = Date.now();
  const safeUpdates = {
    ...updates,
    updatedAt: updates.updatedAt || nowIso
  };

  // 1. Optimistic UI local instantáneo
  try {
    const current = (await getCachedMovies()) || [];
    const idx = current.findIndex((m: any) => m.id === id);
    if (idx > -1) {
      current[idx] = { ...current[idx], ...safeUpdates };
      current.sort((a: any, b: any) => {
        const timeA = a.createdAt || a.updatedAt || "";
        const timeB = b.createdAt || b.updatedAt || "";
        return timeB.localeCompare(timeA);
      });
      await setCachedMovies(current);
      notifyMovieSubscribers(current);
      if (movieBroadcastChannel) {
        movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: current });
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_SYNC_KEY, nowTimestamp.toString());
    }
  } catch (e) {
    console.error("Error actualizando memoria local tras updateMovie:", e);
  }

  // 2. Persistencia en Firestore
  try {
    await setDoc(doc(db, 'movies', id), {
      ...safeUpdates,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'settings', 'sync'), {
      lastUpdated: serverTimestamp(),
      lastUpdate: nowIso,
      timestamp: nowTimestamp,
      action: 'upsert',
      updatedMovieId: id
    }, { merge: true });

    fetch('/api/movies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ id, ...safeUpdates })
    }).catch(() => {});
  } catch (err) {
    console.warn("Aviso actualizando en Firestore (los datos persisten en memoria local):", err);
  }

  return { id, ...updates };
};

export const deleteMovie = async (id: string) => {
  const nowIso = new Date().toISOString();
  const nowTimestamp = Date.now();

  // 1. Optimistic UI local instantáneo
  try {
    const current = (await getCachedMovies()) || [];
    const filtered = current.filter((m: any) => m.id !== id);
    await setCachedMovies(filtered);
    notifyMovieSubscribers(filtered);
    if (movieBroadcastChannel) {
      movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: filtered });
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_SYNC_KEY, nowTimestamp.toString());
    }
  } catch (e) {
    console.error("Error eliminando de la memoria local:", e);
  }

  // 2. Persistencia en Firestore
  try {
    await deleteDoc(doc(db, 'movies', id));
    await setDoc(doc(db, 'settings', 'sync'), {
      lastUpdated: serverTimestamp(),
      lastUpdate: nowIso,
      timestamp: nowTimestamp,
      action: 'delete',
      deletedMovieId: id
    }, { merge: true });

    fetch(`/api/movies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders()
      }
    }).catch(() => {});
  } catch (err) {
    console.warn("Aviso eliminando en Firestore:", err);
  }
};
