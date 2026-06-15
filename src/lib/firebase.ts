import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged as firebaseOnAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  getDocsFromCache, getDocsFromServer, query, orderBy, limit, onSnapshot, where
} from 'firebase/firestore';
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

export const fetchMoviesOptimized = async (forceServer = false) => {
  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
  
  // 1. Estrategia de Caché Local Estricta (localStorage)
  if (!forceServer) {
    try {
      const offlineData = localStorage.getItem("videoteca_movies_cache");
      if (offlineData) {
        const parsed = JSON.parse(offlineData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Caché Estricta Local] Películas cargadas instantáneamente desde localStorage (Lecturas Firebase = 0). Cantidad: ${parsed.length}`);
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Error leyendo la caché de localStorage:", e);
    }

    try {
      // 2. Fallback secundario de Firestore Cache nativa
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localStorage.setItem("videoteca_movies_cache", JSON.stringify(data));
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
  try {
    localStorage.setItem("videoteca_movies_cache", JSON.stringify(data));
  } catch (e) {}
  return data;
};

export const syncMoviesIncremental = async () => {
  // 1. Lee la caché local de localStorage
  let localMovies: any[] = [];
  try {
    const offlineData = localStorage.getItem("videoteca_movies_cache");
    if (offlineData) {
      const parsed = JSON.parse(offlineData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localMovies = parsed;
        console.log(`[Caché Incremental] Cargadas ${localMovies.length} películas desde localStorage.`);
      }
    }
  } catch (e) {
    console.warn("Error leyendo la caché inicial de localStorage:", e);
  }

  // 1B. Rescate MASIVO desde la caché nativa de Firebase IndexedDB (Costo 0 lecturas)
  try {
    console.log("[Caché Incremental] Revisando caché nativa de Firebase (IndexedDB) para recuperar historial...");
    const cacheSnap = await getDocsFromCache(query(collection(db, 'movies')));
    if (!cacheSnap.empty) {
      const fbCache = cacheSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`[Caché Incremental] Firebase Cache contenía ${fbCache.length} películas.`);
      
      const existingIds = new Set(localMovies.map(m => m.id));
      let addedFromFb = 0;
      for (const m of fbCache) {
        if (!existingIds.has(m.id)) {
          localMovies.push(m);
          addedFromFb++;
        }
      }
      if (addedFromFb > 0) {
        console.log(`[Caché Incremental] Se unieron ${addedFromFb} películas antiguas desde Firebase Cache.`);
      }
    }
  } catch (e) {
    console.log("[Caché Incremental] Firebase Cache vacía o no disponible aún.");
  }

  // 2. Extraer el timestamp de actualización más reciente en memoria
  let latestTimestamp = "";
  if (localMovies.length > 0) {
    for (const m of localMovies) {
      const t = m.updatedAt || m.createdAt || "";
      if (t > latestTimestamp) {
        latestTimestamp = t;
      }
    }
  }

  // 3. Consulta única y pasiva solo por lo nuevo o modificado
  try {
    let q;
    if (latestTimestamp) {
      console.log(`[Caché Incremental] Consultando al SERVIDOR películas creadas o modificadas después de: ${latestTimestamp}`);
      q = query(collection(db, 'movies'), where('updatedAt', '>', latestTimestamp));
    } else {
      console.log(`[Caché Incremental] No hay ninguna caché. Descargando catálogo completo por primera vez.`);
      q = query(collection(db, 'movies'));
    }
    
    // getDocsFromServer asegura que no cobren lecturas repetidas
    const snapshot = await getDocsFromServer(q);
    const newMovies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (newMovies.length > 0) {
      console.log(`[Caché Incremental] Se encontraron ${newMovies.length} películas nuevas en el servidor. Cobro en Firebase: ${newMovies.length} lecturas.`);
      
      // 4. FUSIÓN INMEDIATA
      const newIds = new Set(newMovies.map(m => m.id));
      const filteredLocal = localMovies.filter(m => !newIds.has(m.id));
      
      localMovies = [...newMovies, ...filteredLocal];
      
      // Mantenemos el orden descendente por recencia
      localMovies.sort((a, b) => {
        const timeA = a.createdAt || a.updatedAt || "";
        const timeB = b.createdAt || b.updatedAt || "";
        return timeB.localeCompare(timeA);
      });

      // Intentamos guardar en localStorage (Protección contra QuotaExceededError)
      try {
        localStorage.setItem("videoteca_movies_cache", JSON.stringify(localMovies));
      } catch (quotaError) {
        console.warn("[Caché Incremental] QuotaExceededError en localStorage. Firebase IndexedDB mantendrá la data.");
      }
    } else {
      console.log("[Caché Incremental] No hay películas nuevas. Lecturas al servidor cobradas: 0.");
      
      // Aseguramos el orden correcto si rescatamos cosas de IndexedDB
      localMovies.sort((a, b) => {
        const timeA = a.createdAt || a.updatedAt || "";
        const timeB = b.createdAt || b.updatedAt || "";
        return timeB.localeCompare(timeA);
      });
      // Guardado por si acaso
      try {
        localStorage.setItem("videoteca_movies_cache", JSON.stringify(localMovies));
      } catch (quotaError) {}
    }
  } catch (error) {
    console.error("Error en sincronización incremental pasiva:", error);
  }
  
  return localMovies;
};

export const setupRealtimeSync = (latestTimestamp: string, callback: (changes: any[]) => void) => {
  let q;
  if (latestTimestamp) {
    q = query(collection(db, 'movies'), where('updatedAt', '>', latestTimestamp));
  } else {
    // Si no hay caché, escuchamos a todo (esto pasa la primera vez)
    q = query(collection(db, 'movies'));
  }

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const changes = snapshot.docChanges().map(change => ({
      type: change.type, // 'added', 'modified', o 'removed'
      movie: { id: change.doc.id, ...change.doc.data() }
    }));
    
    if (changes.length > 0) {
      console.log(`[Realtime Sync] Detectados ${changes.length} cambios en tiempo real.`);
      callback(changes);
    }
  }, (error) => {
    console.error("[Realtime Sync] Error en listener:", error);
  });

  return unsubscribe;
};

export const fetchAdminsOptimized = async (forceServer = false) => {
  const q = collection(db, 'admins');
  
  if (!forceServer) {
    try {
      const offlineAdmins = localStorage.getItem("videoteca_admins_cache");
      if (offlineAdmins) {
        const parsed = JSON.parse(offlineAdmins);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Caché Estricta Local] Admins cargados instantáneamente desde localStorage (Lecturas Firebase = 0). Cantidad: ${parsed.length}`);
          return parsed;
        }
      }
    } catch (e) {}

    try {
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localStorage.setItem("videoteca_admins_cache", JSON.stringify(data));
        return data;
      }
    } catch (e) {}
  }

  console.log("Firebase Cache-First: Consultando administradores desde el Servidor Real de Firestore");
  const snapshot = await getDocsFromServer(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  try {
    localStorage.setItem("videoteca_admins_cache", JSON.stringify(data));
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
  
  // Sincronizar de inmediato la caché local para que la próxima lectura sea inmediata y use 0 lecturas:
  try {
    const offlineData = localStorage.getItem("videoteca_movies_cache");
    let list: any[] = offlineData ? JSON.parse(offlineData) : [];
    const index = list.findIndex((m: any) => m.id === movieId);
    if (index > -1) {
      list[index] = { ...list[index], ...movieData };
    } else {
      list.unshift(movieData);
    }
    // Prohibido el orden alfabético. Mantener orden descendente por recencia
    list.sort((a, b) => {
      const timeA = a.createdAt || a.updatedAt || "";
      const timeB = b.createdAt || b.updatedAt || "";
      return timeB.localeCompare(timeA);
    });
    localStorage.setItem("videoteca_movies_cache", JSON.stringify(list));
  } catch (e) {
    console.error("Error actualizando la caché local tras upsertMovie:", e);
  }

  return movieData;
};

export const updateMovie = async (id: string, updates: any) => {
  // Transacción activa de escritura en el servidor real:
  await updateDoc(doc(db, 'movies', id), updates);
  
  // Sincronizar caché local
  try {
    const offlineData = localStorage.getItem("videoteca_movies_cache");
    if (offlineData) {
      let list: any[] = JSON.parse(offlineData);
      const index = list.findIndex((m: any) => m.id === id);
      if (index > -1) {
        list[index] = { ...list[index], ...updates };
        list.sort((a, b) => {
          const timeA = a.createdAt || a.updatedAt || "";
          const timeB = b.createdAt || b.updatedAt || "";
          return timeB.localeCompare(timeA);
        });
        localStorage.setItem("videoteca_movies_cache", JSON.stringify(list));
      }
    }
  } catch (e) {}

  return { id, ...updates };
};

export const deleteMovie = async (id: string) => {
  // Transacción activa de escritura en el servidor real:
  await deleteDoc(doc(db, 'movies', id));
  
  // Sincronizar caché local
  try {
    const offlineData = localStorage.getItem("videoteca_movies_cache");
    if (offlineData) {
      let list: any[] = JSON.parse(offlineData);
      list = list.filter((m: any) => m.id !== id);
      localStorage.setItem("videoteca_movies_cache", JSON.stringify(list));
    }
  } catch (e) {}
};

export const upsertAdmin = async (admin: any) => {
  const adminId = admin.email.toLowerCase();
  const adminData = { ...admin, id: adminId };
  await setDoc(doc(db, 'admins', adminId), adminData, { merge: true });
  
  // Sincronizar caché local
  try {
    const offlineAdmins = localStorage.getItem("videoteca_admins_cache");
    let list: any[] = offlineAdmins ? JSON.parse(offlineAdmins) : [];
    const index = list.findIndex((a: any) => a.id === adminId);
    if (index > -1) {
      list[index] = { ...list[index], ...adminData };
    } else {
      list.push(adminData);
    }
    localStorage.setItem("videoteca_admins_cache", JSON.stringify(list));
  } catch (e) {}

  return adminData;
};

export const deleteAdmin = async (id: string) => {
  await deleteDoc(doc(db, 'admins', id));
  
  // Sincronizar caché local
  try {
    const offlineAdmins = localStorage.getItem("videoteca_admins_cache");
    if (offlineAdmins) {
      let list: any[] = JSON.parse(offlineAdmins);
      list = list.filter((a: any) => a.id !== id);
      localStorage.setItem("videoteca_admins_cache", JSON.stringify(list));
    }
  } catch (e) {}
};
