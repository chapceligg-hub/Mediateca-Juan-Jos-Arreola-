import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged as firebaseOnAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  getDocsFromCache, query, orderBy, limit, onSnapshot, where
} from 'firebase/firestore';
import { get, set } from 'idb-keyval';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Priorizar Cache Local: Configurar Firestore para que persista y use la caché por defecto
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
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

export const CLOUD_RUN_CENTRAL_URL = "https://ais-pre-xyitmmdapgw2fr37dyjkrh-452282047905.us-west2.run.app";

export const getApiUrl = (endpoint: string): string => {
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return `${CLOUD_RUN_CENTRAL_URL}${endpoint}`;
  }
  return endpoint;
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

  // 0. Verificación en memoria local instantánea (Permanente + Defaults)
  const perm = getPermanentLocalAdmins();
  const defMatch = DEFAULT_CLIENT_ADMINS.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalized);
  const permMatch = perm.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalized);
  let resolvedName = permMatch?.name || defMatch?.name || '';

  // 1. Verificación en memoria local IndexedDB (0 lecturas, alta velocidad)
  try {
    const offlineAdmins = await get("videoteca_admins_cache");
    if (offlineAdmins) {
      const list = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
      if (Array.isArray(list)) {
        const found = list.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalized);
        if (found) {
          if (found.name) resolvedName = found.name;
          return {
            id: normalized,
            email: normalized,
            role: isPrimary ? 'admin' : (found.role || 'editor'),
            name: resolvedName
          };
        }
      }
    }
  } catch (_) {}

  if (isPrimary) {
    return { 
      id: normalized, 
      email: normalized, 
      role: 'admin',
      name: resolvedName
    };
  }

  // 2. Verificación en el backend del servidor (soporte multi-dispositivo garantizado sin límite de cuota)
  try {
    const res = await fetch(getApiUrl(`/api/admins/check/${encodeURIComponent(normalized)}`));
    if (res.ok) {
      const data = await res.json();
      if (data && data.isAdmin) {
        const adminObj = { 
          id: normalized, 
          email: normalized, 
          role: data.role || (normalized === 'chapceligg@gmail.com' ? 'admin' : 'editor'),
          name: data.name || ''
        };
        try {
          const offlineAdmins = (await get("videoteca_admins_cache")) || [];
          let list = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
          if (!Array.isArray(list)) list = [];
          const idx = list.findIndex((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalized);
          if (idx > -1) {
            list[idx] = { ...list[idx], ...adminObj };
          } else {
            list.push(adminObj);
          }
          await set("videoteca_admins_cache", list);
        } catch (_) {}
        return adminObj;
      }
    }
  } catch (err) {
    console.warn("Aviso al consultar /api/admins/check:", err);
  }

  // 3. Verificación en Firestore directo por ID (protegido contra saturación de cuota)
  try {
    const docSnap = await getDoc(doc(db, 'admins', normalized));
    if (docSnap.exists()) {
      const d = docSnap.data() as any;
      return { id: docSnap.id, ...d };
    }
  } catch (error: any) {
    if (!error?.message?.includes('Quota')) {
      console.warn("Aviso al verificar admin en Firestore, recurriendo a consulta secundaria:", error);
    }
  }

  // 4. Verificación en Firestore por campo email (por si se creó con auto-ID en la consola)
  try {
    const qEmail = query(collection(db, 'admins'), where('email', '==', normalized));
    const qSnap = await getDocs(qEmail);
    if (!qSnap.empty) {
      const firstDoc = qSnap.docs[0];
      const d = firstDoc.data() as any;
      const isGoogle = d.authProvider === 'google' || d.usedGoogleAuth === true || isGoogleAccountEmail(normalized);
      return { id: firstDoc.id, ...d, authProvider: isGoogle ? 'google' : (d.authProvider || 'email'), usedGoogleAuth: isGoogle };
    }
  } catch (err: any) {
    if (!err?.message?.includes('Quota')) {
      console.warn("Aviso al consultar email en Firestore:", err);
    }
  }

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

export const getCachedMovies = async (): Promise<any[] | null> => {
  try {
    const cache = await get("videoteca_movies_cache");
    if (cache) {
      const parsed = typeof cache === 'string' ? JSON.parse(cache) : cache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error leyendo la caché local en este dispositivo:", e);
  }
  return null;
};

export const setCachedMovies = async (newMovies: any[], bypassIntegrity = false) => {
  try {
    const currentCache = await getCachedMovies();
    let currentMovies: any[] = currentCache || [];
    
    // Validar integridad antes de persistir en la caché
    if (bypassIntegrity || shouldUpdateCache(currentMovies, newMovies)) {
      await set("videoteca_movies_cache", newMovies);
      console.log(`[Cache Manager] Caché local en IndexedDB actualizada exitosamente (${newMovies.length} películas)`);

      // Respaldar en servidor backend en segundo plano (0 bloqueo, 0 lecturas Firestore)
      if (Array.isArray(newMovies) && newMovies.length > 0) {
        try {
          fetch(getApiUrl('/api/movies/sync'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMovies)
          }).catch(() => {});
        } catch (_) {}
      }
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
    const res = await fetch(getApiUrl('/api/movies/deleted'));
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
        const res = await fetch(getApiUrl('/api/movies'));
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
    globalMovieEventSource = new EventSource(getApiUrl('/api/movies/stream'));

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
        const res = await fetch(getApiUrl('/api/movies'));
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
            const res = await fetch(getApiUrl('/api/movies'));
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
      const res = await fetch(getApiUrl('/api/movies'));
      if (res.ok) {
        const serverMovies = await res.json();
        if (Array.isArray(serverMovies) && serverMovies.length > 0) {
          const current = (await getCachedMovies()) || [];
          const merged = mergeMoviesPreservingLocal(current, serverMovies, deletedIds);
          await setCachedMovies(merged, true);
          notifyMovieSubscribers(merged);
          // Si el catálogo local consolidado tiene más títulos que el servidor, poblar el servidor central
          if (merged.length > serverMovies.length) {
            fetch(getApiUrl('/api/movies/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(merged)
            }).catch(() => {});
          }
        } else if (offlineData && offlineData.length > 0) {
          // El servidor central aún no tiene películas: enviar nuestra copia local para poblar el servidor
          fetch(getApiUrl('/api/movies/sync'), {
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

  // 4. Suscripción delta pasiva en tiempo real (0 lecturas iniciales, solo novedades futuras)
  let unsubscribeFirestore = () => {};
  try {
    const listenFromTime = new Date().toISOString();
    const qDeltaRealtime = query(
      collection(db, 'movies'),
      where('updatedAt', '>', listenFromTime)
    );
    
    unsubscribeFirestore = onSnapshot(
      qDeltaRealtime,
      async (snapshot) => {
        if (snapshot.empty) return;
        const removedIds: string[] = [];
        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed' && change.doc && change.doc.id) {
            removedIds.push(change.doc.id);
          }
        });

        if (removedIds.length > 0) {
          fetch(getApiUrl('/api/movies/deleted'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: removedIds })
          }).catch(() => {});
        }

        let deletedIds = await syncDeletedMovieIds();
        if (removedIds.length > 0) {
          deletedIds = Array.from(new Set([...deletedIds, ...removedIds]));
          await set("videoteca_deleted_ids", deletedIds.slice(-1000));
        }

        const incomingMovies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const existing = await getCachedMovies() || [];
        const merged = mergeMoviesPreservingLocal(existing, incomingMovies, deletedIds);
        const cleanMerged = merged.filter(m => m && m.id && !deletedIds.includes(m.id));

        await setCachedMovies(cleanMerged, true);
        notifyMovieSubscribers(cleanMerged);
      },
      (err: any) => {
        const isQuota = err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted';
        if (!isQuota) {
          console.warn("[Firebase] Aviso en onSnapshot (usando datos locales):", err);
          if (onError) onError(err);
        } else {
          console.log("[Firebase] Operando con catálogo en caché y servidor central (cuota protegida).");
        }
      }
    );
  } catch (_) {}

  return () => {
    movieSubscribers.delete(callback);
    try { unsubscribeFirestore(); } catch (_) {}
  };
};

// Sincronización automática al enfocar la pestaña
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    fetchMoviesOptimized(true).then(m => {
      if (Array.isArray(m) && m.length > 0) notifyMovieSubscribers(m);
    }).catch(() => {});
    fetchAdminsOptimized().then(a => {
      if (Array.isArray(a) && a.length > 0) notifyAdminSubscribers(a);
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
    role: "editor",
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
  }
];

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

export const getDeletedAdminsSet = async (): Promise<Set<string>> => {
  const setObj = new Set<string>();
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

  try {
    const res = await fetch(getApiUrl('/api/admins/deleted'));
    if (res.ok) {
      const serverDeleted = await res.json();
      if (Array.isArray(serverDeleted)) {
        serverDeleted.forEach(id => {
          if (id) setObj.add(String(id).trim().toLowerCase());
        });
        try {
          localStorage.setItem("videoteca_deleted_admins", JSON.stringify(Array.from(setObj)));
        } catch (_) {}
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

  // 2. Suscribirse a cambios en Firestore de _primary_config en tiempo real
  let unsubscribeFirestore = () => {};
  try {
    const primaryDocRef = doc(db, 'admins', '_primary_config');
    unsubscribeFirestore = onSnapshot(primaryDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && typeof data.email === 'string' && data.email.trim()) {
          const clean = data.email.toLowerCase().trim();
          try { localStorage.setItem("videoteca_primary_superadmin", clean); } catch (_) {}
          notifyPrimarySuperAdminSubscribers(clean);
        }
      }
    }, (err) => {
      const isQuota = err?.message?.includes('Quota') || err?.code === 'resource-exhausted';
      if (!isQuota) {
        console.warn("[Firebase] Aviso en onSnapshot de primary super admin:", err);
      }
    });
  } catch (_) {}

  return () => {
    primaryAdminSubscribers.delete(callback);
    try { unsubscribeFirestore(); } catch (_) {}
  };
};

export const notifyAdminSubscribers = (admins: any[]) => {
  if (!Array.isArray(admins)) return;
  
  let deletedSet = new Set<string>();
  try {
    const raw = localStorage.getItem("videoteca_deleted_admins");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach(d => {
        if (d && typeof d === 'string') deletedSet.add(d.toLowerCase().trim());
      });
    }
  } catch (_) {}
  const primary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').toLowerCase().trim();
  deletedSet.delete(primary);

  const cleaned = admins.filter(a => {
    if (!a) return false;
    const e = (a.email || a.id || '').toLowerCase().trim();
    return e && !deletedSet.has(e);
  });

  lastKnownAdminsList = cleaned;
  savePermanentLocalAdmins(cleaned);
  set("videoteca_admins_cache", cleaned).catch(() => {});

  for (const cb of adminSubscribers) {
    try {
      cb(cleaned);
    } catch (e) {
      console.warn("Error en suscriptor de admins:", e);
    }
  }
};

const initAdminRealtimeStream = () => {
  if (typeof window === 'undefined') return;
  if (globalAdminEventSource && globalAdminEventSource.readyState !== EventSource.CLOSED) return;

  try {
    globalAdminEventSource = new EventSource(getApiUrl('/api/admins/stream'));

    globalAdminEventSource.addEventListener('admins_update', async (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && Array.isArray(payload.admins)) {
          const deletedSet = await getDeletedAdminsSet();
          const cleaned = payload.admins.filter(a => !deletedSet.has((a.email || a.id || '').toLowerCase().trim()));
          await set("videoteca_admins_cache", cleaned);
          savePermanentLocalAdmins(cleaned);
          notifyAdminSubscribers(cleaned);
          if (adminBroadcastChannel) {
            adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: cleaned });
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

      // Iniciar polling de respaldo cada 5 segundos mientras se reconecta
      if (!adminPollFallbackInterval) {
        adminPollFallbackInterval = setInterval(async () => {
          try {
            const res = await fetch(getApiUrl('/api/admins'));
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) {
                const deletedSet = await getDeletedAdminsSet();
                const cleaned = data.filter(a => !deletedSet.has((a.email || a.id || '').toLowerCase().trim()));
                await set("videoteca_admins_cache", cleaned);
                savePermanentLocalAdmins(cleaned);
                notifyAdminSubscribers(cleaned);
              }
            }
          } catch (_) {}
        }, 5000);
      }

      // Reconexión automática con EventSource tras 3 segundos
      if (!adminReconnectTimeout) {
        adminReconnectTimeout = setTimeout(() => {
          adminReconnectTimeout = null;
          initAdminRealtimeStream();
        }, 3000);
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

export const subscribeToAdmins = (
  callback: (admins: any[]) => void, 
  onError?: (err: any) => void
) => {
  adminSubscribers.add(callback);

  // 1. Notificar de inmediato si ya tenemos lista en memoria
  if (lastKnownAdminsList && lastKnownAdminsList.length > 0) {
    callback(lastKnownAdminsList);
  } else {
    // 2. Cargar de caché local y de /api/admins de inmediato (0 lecturas Firestore)
    fetchAdminsOptimized().then(cachedAdmins => {
      if (cachedAdmins && cachedAdmins.length > 0) {
        lastKnownAdminsList = cachedAdmins;
        callback(cachedAdmins);
      }
    }).catch(() => {});
  }

  // 3. Conectar al canal SSE en tiempo real para recibir actualizaciones de cualquier dispositivo
  initAdminRealtimeStream();

  // 4. Suscripción en tiempo real a Firestore de la colección 'admins'
  let unsubscribeFirestore = () => {};
  try {
    const q = collection(db, 'admins');
    unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      const activeAdmins: any[] = [];
      const removedEmails: string[] = [];

      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          const docId = change.doc.id;
          if (docId && !docId.startsWith('_')) {
            removedEmails.push(docId.toLowerCase().trim());
          }
        }
      });

      if (removedEmails.length > 0) {
        removedEmails.forEach(e => recordDeletedAdmin(e));
      }

      snapshot.docs.forEach(docSnap => {
        const id = docSnap.id;
        if (!id.startsWith('_')) {
          const data = docSnap.data();
          const email = (data.email || id).toLowerCase().trim();
          activeAdmins.push({
            id: email,
            email,
            name: data.name || '',
            role: data.role || 'editor',
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
            photoURL: data.photoURL || '',
            ...data
          });
        }
      });

      if (activeAdmins.length > 0) {
        notifyAdminSubscribers(activeAdmins);
      }
    }, (err) => {
      const isQuota = err?.message?.includes('Quota') || err?.code === 'resource-exhausted';
      if (!isQuota) {
        console.warn("[Firebase] Aviso en onSnapshot de admins:", err);
        if (onError) onError(err);
      }
    });
  } catch (_) {}

  return () => {
    adminSubscribers.delete(callback);
    try { unsubscribeFirestore(); } catch (_) {}
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
    const res = await fetch(getApiUrl('/api/movies'));
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
    fetch(getApiUrl('/api/movies/sync'), {
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
  let deletedSet = new Set<string>();
  try {
    const raw = localStorage.getItem("videoteca_deleted_admins");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach(d => {
        if (d && typeof d === 'string') deletedSet.add(d.toLowerCase().trim());
      });
    }
  } catch (_) {}
  const primary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').toLowerCase().trim();
  deletedSet.delete(primary);

  const map = new Map<string, any>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item) continue;
      const email = (item.email || item.id || '').trim().toLowerCase();
      if (!email || deletedSet.has(email)) continue;
      const existing = map.get(email);
      if (!existing) {
        map.set(email, { ...item, id: email, email });
      } else {
        const itemTime = item.updatedAt || item.createdAt || "";
        const existTime = existing.updatedAt || existing.createdAt || "";
        const base = itemTime >= existTime ? { ...existing, ...item } : { ...item, ...existing };
        const existingName = (existing.name || '').trim();
        const incomingName = (item.name || '').trim();
        const finalName = incomingName || existingName;
        map.set(email, { ...base, id: email, email, name: finalName });
      }
    }
  }
  return Array.from(map.values());
};

export const fetchAdminsOptimized = async (forceServer = false) => {
  const q = collection(db, 'admins');
  let localAdmins: any[] = [];

  // 1. Memoria permanente local (localStorage) + IndexedDB (0ms, jamás se pierde)
  const permAdmins = getPermanentLocalAdmins();
  try {
    const offlineAdmins = await get("videoteca_admins_cache");
    if (offlineAdmins) {
      const parsed = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
      if (Array.isArray(parsed)) localAdmins = parsed;
    }
  } catch (e) {}

  // 2. Servidor central (/api/admins) y lista de eliminados
  let serverAdmins: any[] = [];
  const deletedSet = await getDeletedAdminsSet();

  try {
    const resAdmins = await fetch(getApiUrl('/api/admins'));
    if (resAdmins.ok) {
      const data = await resAdmins.json();
      if (Array.isArray(data)) serverAdmins = data;
    }
  } catch (err) {
    console.warn("Aviso al consultar /api/admins:", err);
  }

  // 3. Firestore (Respaldo en la nube multi-dispositivo)
  let firestoreAdmins: any[] = [];
  try {
    // Primero intentar leer el registro consolidado de un solo documento (1 lectura, cuota ultrabaja)
    const regDoc = await getDoc(doc(db, 'admins', '_registry'));
    if (regDoc.exists() && Array.isArray(regDoc.data()?.list)) {
      firestoreAdmins = regDoc.data().list;
    }
  } catch (_) {}

  if (firestoreAdmins.length === 0 && forceServer) {
    try {
      const snapshot = await getDocs(q);
      firestoreAdmins = snapshot.docs
        .filter(doc => !doc.id.startsWith('_'))
        .map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Aviso al consultar admins de Firestore:", err);
    }
  } else if (firestoreAdmins.length === 0) {
    try {
      const cachedSnap = await getDocsFromCache(q);
      if (!cachedSnap.empty) {
        firestoreAdmins = cachedSnap.docs
          .filter(doc => !doc.id.startsWith('_'))
          .map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (_) {}
  }

  // 4. Fusión de TODAS las capas: Cuentas base + Permanente + Local + Servidor + Firestore
  let unified = mergeAdmins(DEFAULT_CLIENT_ADMINS, permAdmins, localAdmins, serverAdmins, firestoreAdmins);
  if (deletedSet.size > 0) {
    unified = unified.filter(a => !deletedSet.has((a.email || a.id || '').trim().toLowerCase()));
  }

  // 5. Asegurar que permanezca guardado en almacenamiento local inmutable
  if (unified.length > 0) {
    savePermanentLocalAdmins(unified);
    await set("videoteca_admins_cache", unified);
    lastKnownAdminsList = unified;

    // Sincronizar en segundo plano con el backend y Firestore
    fetch(getApiUrl('/api/admins/sync'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unified)
    }).catch(() => {});

    try {
      setDoc(doc(db, 'admins', '_registry'), {
        list: unified,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    } catch (_) {}

    return unified;
  }

  const fallback = mergeAdmins(DEFAULT_CLIENT_ADMINS, permAdmins, localAdmins).filter(a => !deletedSet.has((a.email || a.id || '').trim().toLowerCase()));
  return fallback;
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
    isLatestSaved: movie.isLatestSaved !== undefined ? movie.isLatestSaved : true,
    latestSavedAt: movie.latestSavedAt || nowIso,
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
    await fetch(getApiUrl('/api/movies'), {
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
    await fetch(getApiUrl('/api/movies'), {
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
    await fetch(getApiUrl(`/api/movies/${encodeURIComponent(id)}`), { method: 'DELETE' });
    await fetch(getApiUrl('/api/movies/deleted'), {
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

export const markLatestMoviesInDB = async (targetIds: string[]) => {
  const nowIso = new Date().toISOString();
  const offlineData = (await getCachedMovies()) || [];
  if (offlineData.length === 0) return [];

  const targetSet = new Set(targetIds);
  const updatedList = offlineData.map((m: any) => {
    if (targetSet.has(m.id)) {
      return {
        ...m,
        isLatestSaved: true,
        latestSavedAt: nowIso,
        updatedAt: nowIso
      };
    } else {
      return {
        ...m,
        isLatestSaved: false
      };
    }
  });

  await setCachedMovies(updatedList, true);
  notifyMovieSubscribers(updatedList);
  if (movieBroadcastChannel) {
    movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: updatedList });
  }

  // Persistir en servidor backend y Firestore
  try {
    fetch(getApiUrl('/api/movies/sync'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedList)
    }).catch(() => {});
  } catch (_) {}

  // Actualizar por lote en Firestore
  for (const id of targetIds) {
    try {
      updateDoc(doc(db, 'movies', id), { isLatestSaved: true, latestSavedAt: nowIso, updatedAt: nowIso }).catch(() => {});
    } catch (_) {}
  }

  return updatedList;
};

export const forcePushMasterCatalogToDB = async (masterCatalog: any[]) => {
  if (!Array.isArray(masterCatalog) || masterCatalog.length === 0) {
    throw new Error("El catálogo maestro a guardar está vacío.");
  }

  const nowIso = new Date().toISOString();
  
  // Asignar updatedAt actualizado a todas las obras para que prevalezcan como la versión autoritativa
  const updatedList = masterCatalog.map((m: any) => ({
    ...m,
    updatedAt: nowIso
  }));

  // 1. Guardar en memoria e IndexedDB local de inmediato
  await setCachedMovies(updatedList, true);
  notifyMovieSubscribers(updatedList);
  if (movieBroadcastChannel) {
    movieBroadcastChannel.postMessage({ type: 'MOVIES_UPDATED', movies: updatedList });
  }

  // 2. Limpiar IDs eliminados que pertenezcan al catálogo maestro
  const masterIds = new Set(updatedList.map(m => m.id).filter(Boolean));
  try {
    const deletedList: string[] = (await get("videoteca_deleted_ids")) || [];
    const cleanedDeleted = deletedList.filter(id => !masterIds.has(id));
    await set("videoteca_deleted_ids", cleanedDeleted);
  } catch (_) {}

  // 3. Enviar copia maestra forzada al servidor central backend
  try {
    await fetch(getApiUrl('/api/movies/force-master'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedList)
    });
  } catch (err) {
    console.warn("Aviso al enviar catálogo maestro a /api/movies/force-master:", err);
  }

  // 4. Sincronizar en lotes hacia Firestore
  const CHUNK_SIZE = 50;
  for (let i = 0; i < updatedList.length; i += CHUNK_SIZE) {
    const chunk = updatedList.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(m => setDoc(doc(db, 'movies', m.id), m, { merge: true }).catch(() => {}))
    );
  }

  return updatedList;
};

export const upsertAdmin = async (admin: any) => {
  const adminId = (admin.email || admin.id || '').toLowerCase().trim();
  if (!adminId) throw new Error("Correo inválido para el administrador.");

  // Al agregar o modificar, retirar explícitamente de la lista de eliminados
  unrecordDeletedAdmin(adminId);

  const permAdmins = getPermanentLocalAdmins();
  const existingInPerm = permAdmins.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === adminId);
  const existingName = (existingInPerm?.name || '').trim();
  const incomingName = admin.name !== undefined ? String(admin.name).trim() : '';
  const finalName = incomingName || existingName || adminId.split('@')[0];

  const adminData: any = {
    ...(existingInPerm || {}),
    ...admin,
    id: adminId,
    email: adminId,
    name: finalName,
    role: admin.role || existingInPerm?.role || 'editor',
    updatedAt: new Date().toISOString()
  };

  // Prevenir fallos en setDoc de Firestore por valores undefined
  Object.keys(adminData).forEach(key => {
    if (adminData[key] === undefined) {
      delete adminData[key];
    }
  });

  // 1. Guardar en el backend del servidor (persistencia multi-dispositivo garantizada)
  try {
    await fetch(getApiUrl('/api/admins'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminData)
    });
  } catch (err) {
    console.warn("Aviso al guardar admin en backend:", err);
  }

  // 2. Guardar en Firestore documento individual
  try {
    await setDoc(doc(db, 'admins', adminId), adminData, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar admin en Firestore (se guardará en backend y caché local):", err);
  }
  
  // 3. Guardar en almacenamiento inmutable permanente (localStorage + IndexedDB) y propagar
  const updatedList = mergeAdmins(permAdmins, [adminData]);
  savePermanentLocalAdmins(updatedList);
  await set("videoteca_admins_cache", updatedList);
  lastKnownAdminsList = updatedList;
  notifyAdminSubscribers(updatedList);
  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: updatedList });
  }

  // Guardar en Firestore _registry para lectura consolidada de 1 solo documento
  try {
    setDoc(doc(db, 'admins', '_registry'), {
      list: updatedList,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
  } catch (_) {}

  return adminData;
};

export const deleteAdmin = async (idOrEmail: string) => {
  const adminId = (idOrEmail || '').toLowerCase().trim();
  const currentPrimary = (localStorage.getItem("videoteca_primary_superadmin") || 'chapceligg@gmail.com').trim().toLowerCase();
  if (!adminId || adminId === currentPrimary) return;

  // Registrar como eliminado para evitar que se reviva
  recordDeletedAdmin(adminId);

  try {
    await fetch(getApiUrl(`/api/admins/${encodeURIComponent(adminId)}`), { method: 'DELETE' });
  } catch (err) {
    console.warn("Aviso al eliminar admin en backend:", err);
  }

  try {
    await deleteDoc(doc(db, 'admins', adminId));
  } catch (err) {
    console.warn("Aviso al eliminar admin en Firestore (se eliminará de caché local):", err);
  }
  
  const permAdmins = getPermanentLocalAdmins();
  const filteredList = permAdmins.filter((a: any) => (a.id || a.email || '').toLowerCase().trim() !== adminId);
  savePermanentLocalAdmins(filteredList);
  await set("videoteca_admins_cache", filteredList);
  lastKnownAdminsList = filteredList;
  notifyAdminSubscribers(filteredList);
  if (adminBroadcastChannel) {
    adminBroadcastChannel.postMessage({ type: 'ADMINS_UPDATED', admins: filteredList });
  }

  try {
    setDoc(doc(db, 'admins', '_registry'), {
      list: filteredList,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
  } catch (_) {}
};

export const getPrimarySuperAdminEmail = async (): Promise<string> => {
  // 1. Consultar servidor central (garantiza sincronización multi-dispositivo inmediata)
  try {
    const res = await fetch(getApiUrl('/api/primary-admin'));
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
    await fetch(getApiUrl('/api/primary-admin'), {
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


