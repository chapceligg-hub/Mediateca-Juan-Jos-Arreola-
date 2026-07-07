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

export const getMoviesCacheKey = (userId?: string) => {
  const uid = userId || auth.currentUser?.uid;
  if (uid) {
    return `videoteca_movies_cache_${uid}`;
  }
  return "videoteca_movies_cache_anonymous";
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

export const getCachedMovies = async (userId?: string): Promise<any[] | null> => {
  const uid = userId || auth.currentUser?.uid;
  const userKey = uid ? `videoteca_movies_cache_${uid}` : "videoteca_movies_cache_anonymous";
  
  try {
    // 1. Intentar leer de la caché del usuario actual
    const userCache = await get(userKey);
    if (userCache) {
      const parsed = typeof userCache === 'string' ? JSON.parse(userCache) : userCache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    
    // 2. Fallback: si el usuario no tiene caché (ej. primer login en este dispositivo),
    // intentar leer de la caché anónima o del backup general para no dejar la pantalla en blanco.
    const anonCache = await get("videoteca_movies_cache_anonymous") || await get("videoteca_movies_cache");
    if (anonCache) {
      const parsed = typeof anonCache === 'string' ? JSON.parse(anonCache) : anonCache;
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migramos estos datos a la caché del usuario de manera preventiva
        await set(userKey, parsed);
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error leyendo la caché local:", e);
  }
  return null;
};

export const setCachedMovies = async (newMovies: any[], bypassIntegrity = false, userId?: string) => {
  const uid = userId || auth.currentUser?.uid;
  const userKey = uid ? `videoteca_movies_cache_${uid}` : "videoteca_movies_cache_anonymous";
  
  try {
    // Obtener lo que ya hay en caché
    const currentCache = await get(userKey);
    let currentMovies: any[] = [];
    if (currentCache) {
      currentMovies = typeof currentCache === 'string' ? JSON.parse(currentCache) : currentCache;
    }
    
    // Validar integridad antes de persistir
    if (bypassIntegrity || shouldUpdateCache(currentMovies, newMovies)) {
      await set(userKey, newMovies);
      // Guardar respaldos generales para el fallback rápido
      await set("videoteca_movies_cache_anonymous", newMovies);
      await set("videoteca_movies_cache", newMovies); // Para mantener compatibilidad si algo lo lee directamente
      console.log(`[Cache Manager] Caché actualizada exitosamente (${newMovies.length} películas) para la clave: ${userKey}`);
    } else {
      console.log(`[Cache Manager] Integridad rechazada. Conservando caché previa de ${currentMovies.length} películas.`);
    }
  } catch (e) {
    console.error("Error al escribir en la caché local:", e);
  }
};

export const fetchMoviesOptimized = async (forceServer = false) => {
  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
  
  // 1. Estrategia de Caché Local Estricta (IndexedDB)
  if (!forceServer) {
    try {
      const offlineData = await getCachedMovies();
      if (offlineData && offlineData.length > 0) {
        console.log(`[Caché Estricta Local] Películas cargadas instantáneamente desde IndexedDB (Lecturas Firebase = 0). Cantidad: ${offlineData.length}`);
        return offlineData;
      }
    } catch (e) {
      console.warn("Error leyendo la caché de IndexedDB:", e);
    }

    try {
      // 2. Fallback secundario de Firestore Cache nativa
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await setCachedMovies(data);
        console.log("Firebase Cache-First: Películas cargadas desde la caché local de Firestore");
        return data;
      }
    } catch (e) {
      console.log("Firebase Cache-First: Caché vacía o error, buscando en servidor...");
    }
  }

  // 3. Solo si todo está vacío o se fuerza explícitamente se hace la petición al servidor
  console.log("Firebase Cache-First: Consultando películas desde el Servidor Real de Firestore");
  const snapshot = await getDocsFromServer(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  await setCachedMovies(data);
  return data;
};

export const subscribeToMovies = (callback: (movies: any[]) => void, onError: (err: any) => void) => {
  console.log("[Firebase] Iniciando suscripción optimizada a películas (onSnapshot)...");
  const q = query(collection(db, 'movies'));
  
  return onSnapshot(q, { includeMetadataChanges: true }, async (snapshot) => {
    const movies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Mantenemos el orden descendente por recencia
    movies.sort((a, b) => {
      const timeA = a.createdAt || "";
      const timeB = b.createdAt || "";
      return timeB.localeCompare(timeA);
    });

    // Guardamos la nueva caché unificada para cuando carga rápido usando la función segura
    try {
      await setCachedMovies(movies);
    } catch (error) {
      console.warn("No se pudo escribir en la memoria caché IndexedDB", error);
    }
    
    callback(movies);
  }, (error) => {
    console.error("Error en la suscripción de caché en tiempo real:", error);
    onError(error);
  });
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
  
  // Transacción activa de escritura en el servidor real:
  await setDoc(doc(db, 'movies', movieId), movieData, { merge: true });
  
  // Sincronizar de inmediato la caché local
  try {
    const offlineData = await getCachedMovies();
    let list: any[] = [];
    if (offlineData) {
      list = offlineData;
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

  return movieData;
};

export const updateMovie = async (id: string, updates: any) => {
  await updateDoc(doc(db, 'movies', id), updates);
  
  try {
    const offlineData = await getCachedMovies();
    if (offlineData) {
      let list: any[] = offlineData;
      const index = list.findIndex((m: any) => m.id === id);
      if (index > -1) {
        list[index] = { ...list[index], ...updates };
        list.sort((a, b) => {
          const timeA = a.createdAt || a.updatedAt || "";
          const timeB = b.createdAt || b.updatedAt || "";
          return timeB.localeCompare(timeA);
        });
        await setCachedMovies(list, true);
      }
    }
  } catch (e) {}

  return { id, ...updates };
};

export const deleteMovie = async (id: string) => {
  await deleteDoc(doc(db, 'movies', id));
  
  try {
    const offlineData = await getCachedMovies();
    if (offlineData) {
      let list: any[] = offlineData;
      list = list.filter((m: any) => m.id !== id);
      await setCachedMovies(list, true);
    }
  } catch (e) {}
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
