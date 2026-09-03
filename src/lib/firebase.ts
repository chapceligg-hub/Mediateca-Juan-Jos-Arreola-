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
    } else {
      console.log(`[Cache Manager] Integridad rechazada. Conservando caché unificada previa de ${currentMovies.length} películas.`);
    }
  } catch (e) {
    console.error("Error al escribir en la caché local IndexedDB:", e);
  }
};

let hasRunInitialDeltaSync = false;

export const runSmartDeltaSyncOnce = async (callback?: (movies: any[]) => void) => {
  if (hasRunInitialDeltaSync) return;
  hasRunInitialDeltaSync = true;

  try {
    const cached = await getCachedMovies();
    if (!cached || cached.length === 0) {
      console.log("[Smart Delta Sync] Sin catálogo local previo. Obteniendo catálogo inicial...");
      const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length > 0) {
        await setCachedMovies(data, true);
        if (callback) callback(data);
      }
      return;
    }

    // Buscamos la fecha más reciente conocida en nuestra memoria local
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
        // Margen de 1 segundo para tolerar pequeñas diferencias horarias
        safeQueryTime = new Date(parsed - 1000).toISOString();
      }
    } catch (_) {}

    console.log(`[Smart Delta Sync] Comprobando novedades posteriores a ${safeQueryTime} (ejecución única al iniciar)...`);
    const qDelta = query(
      collection(db, 'movies'),
      where('updatedAt', '>', safeQueryTime)
    );

    const snapshot = await getDocsFromServer(qDelta);
    if (snapshot.empty) {
      console.log("[Smart Delta Sync] Catálogo al día. 0 lecturas consumidas de datos nuevos.");
      return;
    }

    const deltaMovies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`[Smart Delta Sync] Se sincronizaron ${deltaMovies.length} película(s) nueva(s) o actualizada(s).`);

    // Fusionar por ID con la lista en memoria local
    const map = new Map<string, any>();
    for (const m of cached) {
      map.set(m.id, m);
    }
    for (const m of deltaMovies) {
      map.set(m.id, m);
    }

    const merged = Array.from(map.values());
    merged.sort((a, b) => {
      const timeA = a.createdAt || a.updatedAt || "";
      const timeB = b.createdAt || b.updatedAt || "";
      return timeB.localeCompare(timeA);
    });

    await setCachedMovies(merged, true);
    if (callback) callback(merged);
  } catch (err) {
    console.warn("[Smart Delta Sync] Verificación delta finalizada (manteniendo copia local segura):", err);
  }
};

export const subscribeToMovies = (
  callback: (movies: any[]) => void, 
  onError?: (err: any) => void
) => {
  console.log("[Firebase] Conectando sincronización en tiempo real protegida...");

  // 1. Cargar instantáneamente la copia en memoria local de IndexedDB (0 lecturas)
  getCachedMovies().then(offlineData => {
    if (offlineData && offlineData.length > 0) {
      callback(offlineData);
    }
    // 2. Ejecutar la sincronización Delta inteligente ESTRICTAMENTE UNA SOLA VEZ al iniciar
    runSmartDeltaSyncOnce(callback);
  }).catch((e) => {
    console.warn("Error leyendo respaldo inicial de IndexedDB:", e);
    runSmartDeltaSyncOnce(callback);
  });

  // 3. Suscripción en tiempo real pasiva con onSnapshot respaldada por persistentLocalCache.
  // Sin setInterval, sin listeners de foco en ventana, sin listeners de visibilidad.
  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
  
  const unsubscribe = onSnapshot(
    q,
    async (snapshot) => {
      const incomingMovies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (incomingMovies.length === 0) return;

      // Obtenemos la memoria local actual para evitar que una caché interna parcial reducida
      // desvanezca el catálogo completo
      const existing = await getCachedMovies() || [];

      if (existing.length === 0 || incomingMovies.length >= existing.length) {
        // Si no teníamos nada o el snapshot viene completo, actualizamos normal
        await setCachedMovies(incomingMovies);
        callback(incomingMovies);
      } else {
        // Fusión inteligente: Si el snapshot trae solo una parte (ej. las últimas editadas en este equipo),
        // fusionamos por ID para preservar absolutamente todo el catálogo previo intacto.
        const map = new Map<string, any>();
        for (const m of existing) {
          map.set(m.id, m);
        }
        for (const m of incomingMovies) {
          map.set(m.id, m);
        }

        const merged = Array.from(map.values());
        merged.sort((a, b) => {
          const timeA = a.createdAt || a.updatedAt || "";
          const timeB = b.createdAt || b.updatedAt || "";
          return timeB.localeCompare(timeA);
        });

        await setCachedMovies(merged);
        callback(merged);
      }
    },
    (err) => {
      console.warn("[Firebase] Aviso en onSnapshot (usando datos locales):", err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
};

export const fetchMoviesOptimized = async (forceServer = false) => {
  // 1. Carga instantánea desde IndexedDB (0 lecturas)
  const offlineData = await getCachedMovies();
  if (!forceServer && offlineData && offlineData.length > 0) {
    return offlineData;
  }

  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));

  // 2. Si no se fuerza servidor, intentar desde la caché interna de Firestore (0 lecturas)
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

  // 3. Servidor únicamente si no hay caché en ningún lado o se fuerza explícitamente
  try {
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    await setCachedMovies(data, true);
    return data;
  } catch (err) {
    if (offlineData && offlineData.length > 0) {
      return offlineData;
    }
    throw err;
  }
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
      }
    }
  } catch (e) {}

  try {
    await updateDoc(doc(db, 'movies', id), safeUpdates);
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

