import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged as firebaseOnAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  initializeFirestore, memoryLocalCache,
  getDocsFromCache, query, orderBy, limit, where, onSnapshot
} from 'firebase/firestore';
import { get, set } from 'idb-keyval';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Inicializar Firestore con memoria local y long-polling forzado:
// Esto previene al 100% el fallo de aserción interna (ID: b815 / ca9 {"ve":-1}) del WebChannel stream y del IndexedDB residual
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

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

export const recordGoogleAuth = async (email: string) => {
  // Función simplificada sin tracking adicional
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

  // 0. Si está marcado como eliminado, denegar acceso de inmediato (salvo si es Administrador Principal)
  if (!isPrimary && (await isDeletedAdmin(normalized))) {
    return null;
  }

  // 1. Verificación rápida en backend central (garantiza exactitud en tiempo real multi-dispositivo sin lecturas Firestore)
  try {
    const res = await fetch(`/api/admins/check/${encodeURIComponent(normalized)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.isAdmin) {
        return {
          id: normalized,
          email: normalized,
          role: data.role || (isPrimary ? 'admin' : 'editor'),
          name: data.name || (isPrimary ? 'Alex Cárdenas' : '')
        };
      }
      if (data && data.deleted) {
        return null;
      }
    }
  } catch (_) {}

  // 2. Administrador Principal garantizado
  if (isPrimary) {
    return { 
      id: normalized, 
      email: normalized, 
      role: 'admin',
      name: 'Alex Cárdenas'
    };
  }

  // 3. Verificación en memoria local instantánea (Offline fallback)
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

  return null;
};

export const getMoviesCacheKey = () => {
  return "videoteca_movies_cache";
};

export const shouldUpdateCache = (currentMovies: any[], newMovies: any[]): boolean => {
  if (!currentMovies || currentMovies.length === 0) {
    return true; // No hay caché previa, se permite actualizar siempre
  }
  
  const currentCount = currentMovies.length;
  const newCount = newMovies.length;
  
  // Si el nuevo catálogo recibido está vacío pero ya teníamos películas guardadas,
  // es muy probable que sea un error de red, de cuota o una limitación temporal. Bloqueamos sobreescribir.
  if (newCount === 0 && currentCount > 0) {
    console.warn(`[Integrity Check] Se bloqueó intento de vaciar la caché. Actual: ${currentCount}, Nuevo: ${newCount}`);
    return false;
  }
  
  // Si la reducción es masiva e inesperada (ej. pasamos de más de 10 películas a menos del 15% de las que teníamos)
  if (currentCount > 10 && newCount < (currentCount * 0.15)) {
    console.warn(`[Integrity Check] Alerta de reducción drástica de películas. Se bloqueó sobreescribir la caché. Actual: ${currentCount}, Nuevo: ${newCount}`);
    return false;
  }
  
  return true;
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

const CACHE_STORAGE_NAME = 'videoteca_permanent_catalog_v1';
const CACHE_STORAGE_URL = '/__videoteca_catalog_cache_store.json';

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
  // 1. Intentar desde memoria en ejecución (0ms)
  if (lastKnownMoviesList && Array.isArray(lastKnownMoviesList) && lastKnownMoviesList.length > 0) {
    return lastKnownMoviesList;
  }

  // 2. Intentar desde IndexedDB (idb-keyval)
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

  // 3. Fallback a CacheStorage permanente (inmune a limpiezas de IndexedDB)
  try {
    const fromCacheStorage = await getFromCacheStorage();
    if (fromCacheStorage && fromCacheStorage.length > 0) {
      console.log(`[Cache Manager] Catálogo recuperado exitosamente desde CacheStorage permanente (${fromCacheStorage.length} títulos)`);
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
    
    // Validar integridad antes de persistir en la caché
    if (bypassIntegrity || shouldUpdateCache(currentMovies, newMovies)) {
      lastKnownMoviesList = newMovies;
      await set("videoteca_movies_cache", newMovies);
      await saveToCacheStorage(newMovies);
      console.log(`[Cache Manager] Caché local blindada y actualizada exitosamente (${newMovies.length} películas)`);

      // Respaldar en servidor backend en segundo plano (0 bloqueo, 0 lecturas Firestore)
      try {
        fetch('/api/movies/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newMovies)
        }).catch(() => {});
      } catch (_) {}
    } else {
      console.log(`[Cache Manager] Integridad rechazada. Conservando caché unificada previa de ${currentMovies.length} películas.`);
    }
  } catch (e) {
    console.error("Error al escribir en la caché local IndexedDB:", e);
  }
};

export const mergeMoviesPreservingLocal = (localList: any[], incomingList: any[], deletedIds: string[] = []): any[] => {
  const map = new Map<string, any>();
  const deletedSet = new Set(deletedIds);

  // 1. Poblamos con los datos locales (que tienen cambios offline, nuevos posters, o nuevas películas)
  for (const m of localList) {
    if (m && m.id && !deletedSet.has(m.id)) {
      map.set(m.id, m);
    }
  }

  // 2. Comparamos cada elemento entrante del servidor/snapshot
  for (const inc of incomingList) {
    if (!inc || !inc.id || deletedSet.has(inc.id)) continue;
    const existing = map.get(inc.id);
    if (!existing) {
      map.set(inc.id, inc);
    } else {
      const localTime = existing.updatedAt || existing.createdAt || "";
      const incomingTime = inc.updatedAt || inc.createdAt || "";

      if (incomingTime >= localTime || !localTime) {
        // Servidor es igual o más reciente -> Aceptar actualización remota y preservar póster válido
        const finalPoster = (inc.poster && inc.poster !== "No disponible" && inc.poster !== "No encontrado")
          ? inc.poster
          : (existing.poster || inc.poster);
        map.set(inc.id, { ...existing, ...inc, poster: finalPoster });
      } else {
        // Si la versión local es más reciente, fusionamos manteniendo los datos locales pero aceptando atributos faltantes
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

let hasRunInitialDeltaSync = false;

export const runSmartDeltaSyncOnce = async (callback?: (movies: any[]) => void) => {
  if (hasRunInitialDeltaSync) return;
  hasRunInitialDeltaSync = true;

  try {
    const deletedIds = await syncDeletedMovieIds();
    const deletedSet = new Set(deletedIds);

    let cached = await getCachedMovies();
    if (!cached || cached.length === 0) {
      // 1. Intentar cargar desde el servidor Express central (/api/movies) -> 0 lecturas Firestore
      try {
        const res = await fetch('/api/movies');
        if (res.ok) {
          const serverMovies = await res.json();
          if (Array.isArray(serverMovies) && serverMovies.length > 0) {
            cached = serverMovies.filter(m => m && m.id && !deletedSet.has(m.id));
            await setCachedMovies(cached, true);
            if (callback) callback(cached);
          }
        }
      } catch (_) {}
    }

    if (!cached || cached.length === 0) {
      console.log("[Smart Delta Sync] Sin catálogo local ni servidor backend. Obteniendo catálogo inicial de Firestore...");
      const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(m => m && m.id && !deletedSet.has(m.id));
      if (data.length > 0) {
        await setCachedMovies(data, true);
        if (callback) callback(data);
      }
      return;
    }

    // Depurar de la memoria local cualquier película eliminada en otro dispositivo
    const cleanCached = cached.filter(m => m && m.id && !deletedSet.has(m.id));
    if (cleanCached.length !== cached.length) {
      await setCachedMovies(cleanCached, true);
      if (callback) callback(cleanCached);
    }

    // Buscamos la fecha más reciente conocida en nuestra memoria local
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
        // Margen de 1 segundo para tolerar pequeñas diferencias horarias
        safeQueryTime = new Date(parsed - 1000).toISOString();
      }
    } catch (_) {}

    console.log(`[Smart Delta Sync] Comprobando novedades posteriores a ${safeQueryTime} (ejecución única al iniciar)...`);
    const qDelta = query(
      collection(db, 'movies'),
      where('updatedAt', '>', safeQueryTime)
    );

    const snapshot = await getDocs(qDelta);
    if (snapshot.empty) {
      console.log("[Smart Delta Sync] Catálogo al día. 0 lecturas consumidas de datos nuevos.");
      return;
    }

    const deltaMovies = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(m => m && m.id && !deletedSet.has(m.id));
    console.log(`[Smart Delta Sync] Se sincronizaron ${deltaMovies.length} película(s) nueva(s) o actualizada(s).`);

    const merged = mergeMoviesPreservingLocal(cleanCached, deltaMovies, deletedIds);
    const cleanMerged = merged.filter(m => m && m.id && !deletedSet.has(m.id));

    await setCachedMovies(cleanMerged, true);
    if (callback) callback(cleanMerged);
  } catch (err) {
    console.warn("[Smart Delta Sync] Verificación delta finalizada (manteniendo copia local segura):", err);
  }
};

// --- CANAL DE SINCRONIZACIÓN EN TIEMPO REAL MULTI-DISPOSITIVO (PELÍCULAS) ---
let movieBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    movieBroadcastChannel = new BroadcastChannel('videoteca_movies_channel');
  }
} catch (_) {}

const movieSubscribers = new Set<(movies: any[]) => void>();
let globalMovieEventSource: EventSource | null = null;
let movieReconnectTimeout: any = null;
let moviePollFallbackInterval: any = null;
let lastKnownMoviesList: any[] = [];

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
          if (Array.isArray(serverMovies)) {
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

    globalMovieEventSource.onopen = () => {
      if (moviePollFallbackInterval) {
        clearInterval(moviePollFallbackInterval);
        moviePollFallbackInterval = null;
      }
    };

    globalMovieEventSource.onerror = () => {
      try { globalMovieEventSource?.close(); } catch (_) {}
      globalMovieEventSource = null;

      if (!moviePollFallbackInterval) {
        moviePollFallbackInterval = setInterval(async () => {
          try {
            const res = await fetch('/api/movies');
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                const deletedIds = await syncDeletedMovieIds();
                const current = (await getCachedMovies()) || [];
                const merged = mergeMoviesPreservingLocal(current, data, deletedIds);
                await setCachedMovies(merged, true);
                notifyMovieSubscribers(merged);
              }
            }
          } catch (_) {}
        }, 5000);
      }

      if (!movieReconnectTimeout) {
        movieReconnectTimeout = setTimeout(() => {
          movieReconnectTimeout = null;
          initMovieRealtimeStream();
        }, 3500);
      }
    };
  } catch (err) {
    console.warn("Aviso iniciando EventSource de películas:", err);
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

  // 1. Sincronizar IDs eliminados y cargar instantáneamente la copia en memoria local de IndexedDB
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

    // 2. Sincronizar de inmediato con el servidor central (0 lecturas Firestore)
    try {
      const res = await fetch('/api/movies');
      if (res.ok) {
        const serverMovies = await res.json();
        if (Array.isArray(serverMovies) && serverMovies.length > 0) {
          const current = (await getCachedMovies()) || [];
          const merged = mergeMoviesPreservingLocal(current, serverMovies, deletedIds);
          await setCachedMovies(merged, true);
          notifyMovieSubscribers(merged);
        } else if (offlineData && offlineData.length > 0) {
          // El servidor central aún no tiene películas: enviar nuestra copia local para poblar el servidor
          fetch('/api/movies/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(offlineData)
          }).catch(() => {});
        }
      }
    } catch (_) {}

    runSmartDeltaSyncOnce(callback);
  }).catch((e) => {
    console.warn("Error leyendo respaldo inicial de IndexedDB:", e);
    runSmartDeltaSyncOnce(callback);
  });

  // 3. Conectar al canal SSE en tiempo real para recibir actualizaciones de películas (0 lecturas Firestore)
  initMovieRealtimeStream();

  // 4. Delta Sync & onSnapshot inteligente en segundo plano (solo recibe cambios individuales, 0 descargas completas)
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
        // En caso de cuota excedida o desconexión, silenciar el error para operar de forma transparente
      });
    } catch (_) {}
  }).catch(() => {});

  return () => {
    movieSubscribers.delete(callback);
    if (unsubMovieDelta) unsubMovieDelta();
  };
};

// Sincronización automática al enfocar la pestaña (0 lecturas de Firestore en segundo plano)
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    // Consultar el backend central sin consumir cuotas de lectura de Firestore
    fetch('/api/movies').then(async res => {
      if (res.ok) {
        const serverMovies = await res.json();
        if (Array.isArray(serverMovies) && serverMovies.length > 0) {
          const cached = (await getCachedMovies()) || [];
          const deletedIds = await syncDeletedMovieIds();
          const merged = mergeMoviesPreservingLocal(cached, serverMovies, deletedIds);
          await setCachedMovies(merged, true);
          notifyMovieSubscribers(merged);
        }
      }
    }).catch(() => {});

    // Sincronizar cuentas respetando y preservando todas las cuentas locales y de usuario
    fetchAdminsOptimized().then(a => {
      if (Array.isArray(a) && a.length > 0) {
        const merged = getAllMergedAdmins(a);
        notifyAdminSubscribers(merged);
      }
    }).catch(() => {});
  });
}

// --- CANAL DE SINCRONIZACIÓN EN TIEMPO REAL MULTI-DISPOSITIVO (ADMINS) ---
let adminBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    adminBroadcastChannel = new BroadcastChannel('videoteca_admins_channel');
  }
} catch (_) {}

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

  // Los correos creados o guardados explícitamente por el usuario NUNCA deben descartarse por deletedSet
  custom.forEach(c => {
    const em = (c?.email || c?.id || '').toLowerCase().trim();
    if (em) deletedSet.delete(em);
  });

  // Orden de precedencia: Base por defecto < Caché anterior < Lista externa/servidor < Personalizados creados por el usuario
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

export const getCachedAdmins = async (): Promise<any[] | null> => {
  try {
    const cache = await get("videoteca_admins_cache");
    if (cache) {
      const parsed = typeof cache === 'string' ? JSON.parse(cache) : cache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return getAllMergedAdmins(parsed);
      }
    }
  } catch (e) {
    console.warn("Aviso leyendo caché IndexedDB de cuentas:", e);
  }
  return getAllMergedAdmins();
};

export const setCachedAdmins = async (newAdmins: any[], bypassIntegrity = false) => {
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

    // Respaldar en servidor backend en segundo plano (0 lecturas Firestore, multi-dispositivo)
    try {
      fetch('/api/admins/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      }).catch(() => {});
    } catch (_) {}
  } catch (e) {
    console.error("Error al guardar en caché local de cuentas:", e);
  }
};

export const getDeletedAdminsSet = async (): Promise<Set<string>> => {
  const setObj = new Set<string>();

  // 1. Obtener la lista autorizada directamente del servidor
  try {
    const res = await fetch('/api/admins/deleted');
    if (res.ok) {
      const serverDeleted = await res.json();
      if (Array.isArray(serverDeleted)) {
        serverDeleted.forEach(id => {
          if (id) setObj.add(String(id).trim().toLowerCase());
        });
        try {
          // Fusionar con los eliminados locales
          const rawLocal = localStorage.getItem("videoteca_deleted_admins");
          if (rawLocal) {
            const parsed = JSON.parse(rawLocal);
            if (Array.isArray(parsed)) {
              parsed.forEach(id => { if (id) setObj.add(String(id).trim().toLowerCase()); });
            }
          }
          localStorage.setItem("videoteca_deleted_admins", JSON.stringify(Array.from(setObj)));
        } catch (_) {}
        const currentPrimary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').trim().toLowerCase();
        setObj.delete(currentPrimary);
        return setObj;
      }
    }
  } catch (_) {}

  // 2. Solo si no hay respuesta de red, consultar la memoria local
  try {
    const raw = localStorage.getItem("videoteca_deleted_admins");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(id => {
          if (id) setObj.add(String(id).trim().toLowerCase());
        });
      }
    }
  } catch (_) {}

  // El Administrador Principal jamás puede considerarse eliminado
  const currentPrimary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').trim().toLowerCase();
  setObj.delete(currentPrimary);
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

const adminSubscribers = new Set<(admins: any[]) => void>();
const primaryAdminSubscribers = new Set<(primaryEmail: string) => void>();
let globalAdminEventSource: EventSource | null = null;
let adminReconnectTimeout: any = null;
let adminPollFallbackInterval: any = null;
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

  // 1. Notificar de inmediato con el valor actual en memoria o servidor
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

    globalAdminEventSource.onopen = () => {
      if (adminPollFallbackInterval) {
        clearInterval(adminPollFallbackInterval);
        adminPollFallbackInterval = null;
      }
    };

    globalAdminEventSource.onerror = () => {
      try { globalAdminEventSource?.close(); } catch (_) {}
      globalAdminEventSource = null;

      // Iniciar polling de respaldo cada 15 segundos mientras se reconecta
      if (!adminPollFallbackInterval) {
        adminPollFallbackInterval = setInterval(async () => {
          try {
            const res = await fetch('/api/admins');
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                const merged = getAllMergedAdmins(data);
                notifyAdminSubscribers(merged);
              }
            }
          } catch (_) {}
        }, 15000);
      }

      // Reconexión automática con EventSource tras 5 segundos
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

// Escuchar cambios de otras pestañas en el mismo dispositivo de forma instantánea (0ms)
if (adminBroadcastChannel) {
  adminBroadcastChannel.onmessage = async (event: MessageEvent) => {
    if (event.data?.type === 'ADMINS_UPDATED' && Array.isArray(event.data.admins)) {
      notifyAdminSubscribers(event.data.admins);
    } else if (event.data?.type === 'PRIMARY_ADMIN_UPDATED' && event.data.primaryEmail) {
      notifyPrimarySuperAdminSubscribers(event.data.primaryEmail);
    }
  };
}

let hasRunDailyAdminSync = false;

export const runDailyAdminsSyncOnce = async (callback?: (admins: any[]) => void) => {
  if (hasRunDailyAdminSync) return;
  hasRunDailyAdminSync = true;

  const today = new Date().toISOString().slice(0, 10);
  let lastSyncDay = "";
  try {
    lastSyncDay = localStorage.getItem("videoteca_admins_last_firestore_sync_day") || "";
  } catch (_) {}

  // Si ya se sincronizó con Firestore hoy, respetamos la cuota y NO consumimos lecturas adicionales
  if (lastSyncDay === today) {
    console.log(`[Cuentas Cache] Sincronización diaria ya realizada hoy (${today}). 0 lecturas consumidas, operando desde la memoria caché segura.`);
    return;
  }

  // Es un nuevo día ("al siguiente día se actualizan"): consultar Firestore de forma controlada
  try {
    console.log(`[Cuentas Cache] Nuevo día detectado (${today}). Actualizando cuentas desde el servidor central / Firestore...`);
    const regDoc = await getDoc(doc(db, 'admins', '_registry'));
    if (regDoc.exists()) {
      const data = regDoc.data();
      if (Array.isArray(data?.list) && data.list.length > 0) {
        const deletedSet = await getDeletedAdminsSet();
        const currentCached = (await getCachedAdmins()) || [];
        const merged = mergeAdmins(currentCached, data.list).filter(a => {
          const em = (a.email || a.id || '').toLowerCase().trim();
          return em && !deletedSet.has(em);
        });

        await setCachedAdmins(merged, true);
        try {
          localStorage.setItem("videoteca_admins_last_firestore_sync_day", today);
        } catch (_) {}

        notifyAdminSubscribers(merged);
        if (callback) callback(merged);
        console.log(`[Cuentas Cache] Cuentas sincronizadas exitosamente para hoy (${merged.length} cuentas activas).`);
        return;
      }
    }
  } catch (err: any) {
    const isQuota = err?.message?.includes('Quota') || err?.code === 'resource-exhausted';
    if (isQuota) {
      console.log(`[Cuentas Cache] Límite de lecturas Firestore alcanzado para hoy (${today}). Cuentas 100% aseguradas en caché local. Se actualizarán automáticamente al siguiente día.`);
      try {
        localStorage.setItem("videoteca_admins_last_firestore_sync_day", today);
      } catch (_) {}
    } else {
      console.warn("Aviso al sincronizar cuentas en el nuevo día:", err);
    }
  }
};

export const subscribeToAdmins = (
  callback: (admins: any[]) => void, 
  onError?: (err: any) => void
) => {
  adminSubscribers.add(callback);

  // 1. Cargar instantáneamente de la memoria local para 0ms de latencia inicial
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

    // 2. Sincronizar con el backend central (/api/admins) fusionando con la memoria local
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
  }).catch((e) => {
    console.warn("Error leyendo respaldo inicial de caché de cuentas:", e);
  });

  // 3. Conectar al canal SSE en tiempo real y multi-dispositivo (0 lecturas Firestore)
  initAdminRealtimeStream();

  // 4. onSnapshot inteligente en segundo plano sobre el documento consolidado _registry (1 sola lectura por cambio)
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
    }, () => {
      // Silenciar en caso de límite de cuota: los niveles 1, 2 y 3 mantienen la sincronización fluida
    });
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

export const fetchMoviesOptimized = async (forceServer = false) => {
  // 1. Carga instantánea desde IndexedDB (0 lecturas)
  const offlineData = await getCachedMovies();
  if (!forceServer && offlineData && offlineData.length > 0) {
    return offlineData;
  }

  // 2. Consultar servidor central (0 lecturas Firestore, multi-dispositivo)
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
  } catch (e) {
    console.warn("Aviso al consultar /api/movies:", e);
  }

  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));

  // 3. Si no se fuerza servidor, intentar desde la caché interna de Firestore (0 lecturas)
  if (!forceServer) {
    try {
      const cachedSnap = await getDocsFromCache(q);
      if (!cachedSnap.empty) {
        const data = cachedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await setCachedMovies(data);
        return data;
      }
    } catch (e) {}
  }

  // 4. Firestore únicamente si no hay caché en ningún lado o se fuerza explícitamente
  try {
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    await setCachedMovies(data, true);
    fetch('/api/movies/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(() => {});
    return data;
  } catch (err) {
    if (offlineData && offlineData.length > 0) {
      return offlineData;
    }
    return [];
  }
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

export const fetchAdminsOptimized = async (forceServer = false) => {
  // 1. Consultar servidor central backend (/api/admins) primero
  try {
    const resAdmins = await fetch('/api/admins');
    if (resAdmins.ok) {
      const serverAdmins = await resAdmins.json();
      if (Array.isArray(serverAdmins) && serverAdmins.length > 0) {
        const merged = getAllMergedAdmins(serverAdmins);
        savePermanentLocalAdmins(merged);
        await set("videoteca_admins_cache", merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn("Aviso al consultar /api/admins, recurriendo a memoria local:", err);
  }

  // 2. Si no hubo respuesta de red, consultar caché local fusionada con cuentas de usuario
  const merged = getAllMergedAdmins();
  savePermanentLocalAdmins(merged);
  return merged;
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
  
  // 1. Sincronizar de inmediato la caché local y notificar en tiempo real a los observadores
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

  // 2. Guardar en el backend del servidor central (persistencia multi-dispositivo y SSE)
  try {
    await fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movieData)
    });
  } catch (err) {
    console.warn("Aviso al guardar película en backend:", err);
  }

  // 3. Transacción activa de respaldo en Firestore:
  try {
    await setDoc(doc(db, 'movies', movieId), movieData, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar en Firestore (registro asegurado en backend y local):", err);
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
  } catch (e) {}

  // 1. Guardar en backend central para sincronización inmediata
  try {
    await fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...safeUpdates, id })
    });
  } catch (err) {
    console.warn("Aviso al actualizar película en backend:", err);
  }

  // 2. Actualizar en Firestore
  try {
    await updateDoc(doc(db, 'movies', id), safeUpdates);
  } catch (err) {
    console.warn("Aviso al actualizar en Firestore (actualizado en backend y caché local):", err);
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
  } catch (e) {}

  // 1. Notificar al servidor central (sincronización multi-dispositivo con 0 costo de Firestore)
  try {
    await fetch(`/api/movies/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await fetch('/api/movies/deleted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
  } catch (err) {
    console.warn("Aviso al notificar película eliminada en servidor:", err);
  }

  // 2. Eliminar en Firestore
  try {
    await deleteDoc(doc(db, 'movies', id));
  } catch (err) {
    console.warn("Aviso al eliminar en Firestore (eliminado en backend y caché local):", err);
  }
};

export const upsertAdmin = async (admin: any) => {
  const adminId = (admin.email || admin.id || '').toLowerCase().trim();
  if (!adminId) throw new Error("Correo inválido para el administrador.");

  // Al agregar o modificar, retirar explícitamente de la lista de eliminados
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

  // Prevenir fallos en setDoc de Firestore por valores undefined
  Object.keys(adminData).forEach(key => {
    if (adminData[key] === undefined) {
      delete adminData[key];
    }
  });

  // 1. Guardar de forma inmutable en la lista de cuentas de usuario del navegador (INMUNIDAD a sobrescrituras)
  saveUserCustomAdmin(adminData);
  const updatedList = getAllMergedAdmins([adminData]);

  savePermanentLocalAdmins(updatedList);
  await set("videoteca_admins_cache", updatedList);
  lastKnownAdminsList = updatedList;
  notifyAdminSubscribers(updatedList);
  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: updatedList });
  }

  // 2. Guardar en el backend del servidor (persistencia multi-dispositivo y SSE en tiempo real a todos)
  try {
    const res = await fetch('/api/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminData)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.admin) {
        saveUserCustomAdmin(data.admin);
      }
    }
    // Sincronizar la lista total consolidada en el backend
    await fetch('/api/admins/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedList)
    });
  } catch (err) {
    console.warn("Aviso al guardar admin en backend:", err);
  }

  // 3. Guardar en Firestore documento individual y registro consolidado (si hay cuota disponible)
  try {
    await setDoc(doc(db, 'admins', adminId), adminData, { merge: true });
    await setDoc(doc(db, 'admins', '_registry'), {
      list: updatedList,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar admin en Firestore (se guardará en backend y caché local):", err);
  }

  return adminData;
};

export const deleteAdmin = async (idOrEmail: string) => {
  const adminId = (idOrEmail || '').toLowerCase().trim();
  const currentPrimary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').trim().toLowerCase();
  if (!adminId || adminId === currentPrimary) return;

  // Registrar como eliminado y quitar de cuentas de usuario guardadas
  recordDeletedAdmin(adminId);
  removeUserCustomAdmin(adminId);

  // 1. Actualizar memoria local de inmediato
  const filteredList = getAllMergedAdmins().filter((a: any) => (a.id || a.email || '').toLowerCase().trim() !== adminId);

  savePermanentLocalAdmins(filteredList);
  await set("videoteca_admins_cache", filteredList);
  lastKnownAdminsList = filteredList;
  notifyAdminSubscribers(filteredList);
  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: filteredList });
  }

  // 2. Eliminar en el servidor central
  try {
    await fetch(`/api/admins/${encodeURIComponent(adminId)}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Aviso al eliminar admin en backend:", err);
  }

  // 3. Eliminar de Firestore
  try {
    await deleteDoc(doc(db, 'admins', adminId));
    setDoc(doc(db, 'admins', '_registry'), {
      list: filteredList,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
  } catch (err) {
    console.warn("Aviso al eliminar admin en Firestore (se eliminará de caché local):", err);
  }
};

export const getPrimarySuperAdminEmail = async (): Promise<string> => {
  // 1. Consultar servidor central (garantiza sincronización multi-dispositivo inmediata)
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

  // 2. Consultar memoria local
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

  // 3. Consultar Firestore como respaldo
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
  } catch (err: any) {
    if (!err?.message?.includes('Quota')) {
      console.warn("Aviso al obtener administrador principal desde Firestore:", err);
    }
  }

  return defaultPrimary;
};

export const transferPrimarySuperAdmin = async (newEmail: string, currentSuperAdminEmail: string, keepPreviousAsAdmin = true) => {
  const normalizedNew = (newEmail || '').toLowerCase().trim();
  const normalizedCurrent = (currentSuperAdminEmail || '').toLowerCase().trim();
  if (!normalizedNew || !normalizedNew.includes('@') || !normalizedNew.includes('.')) {
    throw new Error("El correo ingresado no es válido.");
  }

  // 1. Actualizar en el servidor central (persistencia multi-dispositivo garantizada)
  try {
    await fetch('/api/primary-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedNew, current: normalizedCurrent, keepPrevious: keepPreviousAsAdmin })
    });
  } catch (e) {
    console.warn("Aviso al transferir primary admin en backend:", e);
  }

  // 2. Guardar en Firestore documento de configuración de Administrador Principal
  try {
    await setDoc(doc(db, 'admins', '_primary_config'), {
      email: normalizedNew,
      transferredBy: normalizedCurrent,
      transferredAt: new Date().toISOString()
    }, { merge: true });
  } catch (_) {}

  // Obtener administradores locales para conservar nombres reales
  const permAdmins = getPermanentLocalAdmins();
  const existingNewObj = permAdmins.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalizedNew);
  const existingCurrentObj = permAdmins.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalizedCurrent);

  // 3. Asignar rol 'admin' al nuevo Administrador Principal conservando su nombre opcional si ya lo tenía
  await upsertAdmin({
    ...(existingNewObj || {}),
    email: normalizedNew,
    role: 'admin',
    name: typeof existingNewObj?.name === 'string' ? existingNewObj.name.trim() : '',
    updatedAt: new Date().toISOString()
  });

  // 4. Si keepPreviousAsAdmin es true (traspaso), mantener el anterior como admin. Si es false (renombre/edición de correo), eliminar el viejo.
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

  // Actualizar caché en localStorage y notificar suscriptores
  try {
    localStorage.setItem("videoteca_primary_superadmin", normalizedNew);
  } catch (_) {}
  notifyPrimarySuperAdminSubscribers(normalizedNew);
  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'PRIMARY_ADMIN_UPDATED', primaryEmail: normalizedNew });
  }

  return normalizedNew;
};


