import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged as firebaseOnAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  getDocsFromCache, getDocsFromServer, query, orderBy, limit, onSnapshot, where
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

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, provider);
  return result;
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

export const getAdminByEmail = async (email: string): Promise<{ id: string, role?: string, email?: string } | null> => {
  try {
    const docSnap = await getDoc(doc(db, 'admins', email.toLowerCase()));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...(docSnap.data() as any) };
    }
    return null;
  } catch (error) {
    console.error("Error checking admin:", error);
    return null;
  }
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
    // 1. Intentar leer de la caché única global en IndexedDB
    const cache = await get("videoteca_movies_cache");
    if (cache) {
      const parsed = typeof cache === 'string' ? JSON.parse(cache) : cache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    
    // 2. Fallback a localStorage (útil para iframes de desarrollo y entornos con IndexedDB particionado)
    try {
      const localFallback = localStorage.getItem("videoteca_movies_cache");
      if (localFallback) {
        const parsed = JSON.parse(localFallback);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Intentar guardarlo también en IndexedDB
          try { await set("videoteca_movies_cache", parsed); } catch (_) {}
          return parsed;
        }
      }
    } catch (_) {}

    // 3. Fallback de compatibilidad: si no existe, buscar en las claves antiguas segmentadas
    const uid = auth.currentUser?.uid;
    const legacyKeys = uid ? [`videoteca_movies_cache_${uid}`, "videoteca_movies_cache_anonymous"] : ["videoteca_movies_cache_anonymous"];
    for (const key of legacyKeys) {
      const legacyCache = await get(key);
      if (legacyCache) {
        const parsed = typeof legacyCache === 'string' ? JSON.parse(legacyCache) : legacyCache;
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migrar inmediatamente a la caché global unificada
          await set("videoteca_movies_cache", parsed);
          try { localStorage.setItem("videoteca_movies_cache", JSON.stringify(parsed)); } catch (_) {}
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn("Error leyendo la caché local única global:", e);
    try {
      const localFallback = localStorage.getItem("videoteca_movies_cache");
      if (localFallback) {
        const parsed = JSON.parse(localFallback);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
  }
  return null;
};

export const setCachedMovies = async (newMovies: any[], bypassIntegrity = false) => {
  try {
    const currentCache = await getCachedMovies();
    let currentMovies: any[] = currentCache || [];
    
    // Validar integridad antes de persistir en la caché global única
    if (bypassIntegrity || shouldUpdateCache(currentMovies, newMovies)) {
      try {
        await set("videoteca_movies_cache", newMovies);
      } catch (idbErr) {
        console.warn("No se pudo escribir en IndexedDB (posible iframe aislado):", idbErr);
      }
      
      try {
        localStorage.setItem("videoteca_movies_cache", JSON.stringify(newMovies));
      } catch (lsErr) {
        // En caso de que exceda los 5MB de localStorage, IndexedDB ya lo tiene
      }
      console.log(`[Cache Manager] Caché única global actualizada exitosamente (${newMovies.length} películas)`);
    } else {
      console.log(`[Cache Manager] Integridad rechazada. Conservando caché unificada previa de ${currentMovies.length} películas.`);
    }
  } catch (e) {
    console.error("Error al escribir en la caché local única global:", e);
  }
};

export const syncMoviesDelta = async (localMovies: any[]): Promise<any[]> => {
  try {
    let maxUpdatedAt = "1970-01-01T00:00:00.000Z";
    for (const m of localMovies) {
      const t = m.updatedAt || m.createdAt || "";
      if (t && t > maxUpdatedAt) {
        maxUpdatedAt = t;
      }
    }

    console.log(`[Delta Sync] Consultando cambios desde la última fecha local: ${maxUpdatedAt}`);
    
    // Consultar a Firestore ÚNICAMENTE por las películas creadas/editadas después de maxUpdatedAt
    const q = query(
      collection(db, 'movies'), 
      where('updatedAt', '>', maxUpdatedAt)
    );
    
    const snapshot = await getDocsFromServer(q);
    
    if (snapshot.empty) {
      console.log("[Delta Sync] No hay películas nuevas ni modificadas. Lecturas de Firestore consumidas: 0.");
      return localMovies;
    }

    const deltaMovies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`[Delta Sync] Se encontraron ${deltaMovies.length} películas nuevas/modificadas. Consumo: ${deltaMovies.length} lecturas.`);

    // Unir los deltas con las películas locales que ya tenemos (sobrescribiendo los cambios)
    const mergedMap = new Map();
    for (const m of localMovies) {
      mergedMap.set(m.id, m);
    }
    for (const m of deltaMovies) {
      mergedMap.set(m.id, m);
    }

    const mergedList = Array.from(mergedMap.values());
    
    mergedList.sort((a, b) => {
      const timeA = a.createdAt || a.updatedAt || "";
      const timeB = b.createdAt || b.updatedAt || "";
      return timeB.localeCompare(timeA);
    });

    // Guardar los datos combinados en la caché de super-integridad
    await setCachedMovies(mergedList, true);
    notifyMovieSubscribers(mergedList);
    return mergedList;
  } catch (error) {
    console.warn("Error en sincronización Delta manual:", error);
    return localMovies;
  }
};

export const fetchMoviesOptimized = async (forceServer = false) => {
  // 1. Carga instantánea desde IndexedDB unificada (Lecturas = 0)
  const offlineData = await getCachedMovies();
  let localMovies = offlineData || [];

  if (!forceServer && localMovies.length > 0) {
    console.log(`[Caché Estricta Local] ${localMovies.length} películas cargadas instantáneamente.`);
    
    // Disparar sincronización Delta de forma silenciosa e inteligente en segundo plano
    setTimeout(async () => {
      try {
        await syncMoviesDelta(localMovies);
      } catch (e) {
        console.error("Error en sincronización Delta en segundo plano:", e);
      }
    }, 50);

    return localMovies;
  }

  // 2. Si no hay caché o se fuerza el servidor, hacemos una descarga completa
  console.log("Firebase Cache-First: Descargando catálogo completo desde el servidor...");
  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocsFromServer(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  await setCachedMovies(data, true);
  return data;
};

const movieSubscribers = new Set<(movies: any[]) => void>();

export const notifyMovieSubscribers = (movies: any[]) => {
  movieSubscribers.forEach(cb => {
    try { cb(movies); } catch (e) { console.error("Error in movie subscriber:", e); }
  });
};

export const subscribeToMovies = (callback: (movies: any[]) => void, onError: (err: any) => void) => {
  console.log("[Firebase] Iniciando suscripción con Sincronización Delta inteligente...");
  movieSubscribers.add(callback);

  // 1. Cargar caché local global de inmediato para pintar la pantalla al instante
  (async () => {
    try {
      const cached = await getCachedMovies();
      if (cached && cached.length > 0) {
        callback(cached);
        // Sincronización Delta inicial silenciosa para traer cambios rápidos del servidor
        try {
          const updatedList = await syncMoviesDelta(cached);
          if (updatedList && updatedList.length > 0) {
            callback(updatedList);
          }
        } catch (deltaErr) {
          console.warn("Delta sync skipped:", deltaErr);
        }
      }
    } catch (e) {
      console.warn("Error cargando caché inicial en suscripción:", e);
    }
  })();

  // 2. Listener de tiempo real para mantener todo actualizado.
  // Gracias a persistentLocalCache de Firestore, Firebase no consumirá lecturas por lo que ya conoce.
  const q = query(collection(db, 'movies'));
  const unsubFirestore = onSnapshot(q, { includeMetadataChanges: true }, async (snapshot) => {
    const movies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    movies.sort((a, b) => {
      const timeA = a.createdAt || a.updatedAt || "";
      const timeB = b.createdAt || b.updatedAt || "";
      return timeB.localeCompare(timeA);
    });

    if (movies.length > 0) {
      await setCachedMovies(movies, true);
      notifyMovieSubscribers(movies);
    }
  }, (error) => {
    console.warn("Aviso en la suscripción en tiempo real de Firestore (operando con caché local):", error);
    onError(error);
  });

  return () => {
    movieSubscribers.delete(callback);
    unsubFirestore();
  };
};

export const fetchAdminsOptimized = async (forceServer = false) => {
  const q = collection(db, 'admins');
  
  if (!forceServer) {
    try {
      const offlineAdmins = await get("videoteca_admins_cache");
      if (offlineAdmins) {
        let parsed = offlineAdmins;
        if (typeof offlineAdmins === 'string') {
          parsed = JSON.parse(offlineAdmins);
        }
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Caché Estricta Local] Admins cargados instantáneamente desde IndexedDB (Lecturas Firebase = 0). Cantidad: ${parsed.length}`);
          return parsed;
        }
      }
    } catch (e) {}

    try {
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await set("videoteca_admins_cache", data);
        return data;
      }
    } catch (e) {}
  }

  console.log("Firebase Cache-First: Consultando administradores desde el Servidor Real de Firestore");
  const snapshot = await getDocsFromServer(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  try {
    await set("videoteca_admins_cache", data);
  } catch (e) {}
  return data;
};

export const generateMovieId = () => {
  return doc(collection(db, 'movies')).id;
};

export const upsertMovie = async (movie: any) => {
  const movieId = movie.id || generateMovieId();
  const movieData = { ...movie, id: movieId };
  
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
  } catch (e) {
    console.error("Error actualizando la caché local tras upsertMovie:", e);
  }

  // 2. Transacción activa de escritura en el servidor real:
  try {
    await setDoc(doc(db, 'movies', movieId), movieData, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar en Firestore (registro asegurado en caché local):", err);
  }

  return movieData;
};

export const updateMovie = async (id: string, updates: any) => {
  try {
    const offlineData = await getCachedMovies();
    if (offlineData) {
      let list: any[] = [...offlineData];
      const index = list.findIndex((m: any) => m.id === id);
      if (index > -1) {
        list[index] = { ...list[index], ...updates };
        list.sort((a, b) => {
          const timeA = a.createdAt || a.updatedAt || "";
          const timeB = b.createdAt || b.updatedAt || "";
          return timeB.localeCompare(timeA);
        });
        await setCachedMovies(list, true);
        notifyMovieSubscribers(list);
      }
    }
  } catch (e) {}

  try {
    await updateDoc(doc(db, 'movies', id), updates);
  } catch (err) {
    console.warn("Aviso al actualizar en Firestore (actualizado en caché local):", err);
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
    }
  } catch (e) {}

  try {
    await deleteDoc(doc(db, 'movies', id));
  } catch (err) {
    console.warn("Aviso al eliminar en Firestore (eliminado en caché local):", err);
  }
};

export const upsertAdmin = async (admin: any) => {
  const adminId = admin.email.toLowerCase();
  const adminData = { ...admin, id: adminId };
  await setDoc(doc(db, 'admins', adminId), adminData, { merge: true });
  
  try {
    const offlineAdmins = await get("videoteca_admins_cache");
    let list: any[] = [];
    if (offlineAdmins) {
      list = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
    }
    const index = list.findIndex((a: any) => a.id === adminId);
    if (index > -1) {
      list[index] = { ...list[index], ...adminData };
    } else {
      list.push(adminData);
    }
    await set("videoteca_admins_cache", list);
  } catch (e) {}

  return adminData;
};

export const deleteAdmin = async (id: string) => {
  await deleteDoc(doc(db, 'admins', id));
  
  try {
    const offlineAdmins = await get("videoteca_admins_cache");
    if (offlineAdmins) {
      let list: any[] = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
      list = list.filter((a: any) => a.id !== id);
      await set("videoteca_admins_cache", list);
    }
  } catch (e) {}
};
