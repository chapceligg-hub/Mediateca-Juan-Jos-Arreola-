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

export const fetchMoviesOptimized = async (forceServer = false) => {
  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
  
  // 1. Estrategia de Caché Local Estricta (IndexedDB)
  if (!forceServer) {
    try {
      const offlineData = await get("videoteca_movies_cache");
      if (offlineData) {
        let parsed = offlineData;
        if (typeof offlineData === 'string') {
           parsed = JSON.parse(offlineData);
        }
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Caché Estricta Local] Películas cargadas instantáneamente desde IndexedDB (Lecturas Firebase = 0). Cantidad: ${parsed.length}`);
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Error leyendo la caché de IndexedDB:", e);
    }

    try {
      // 2. Fallback secundario de Firestore Cache nativa
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await set("videoteca_movies_cache", data);
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
    await set("videoteca_movies_cache", data);
  } catch (e) {}
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

    // Guardamos la nueva caché unificada para cuando carga rápido
    try {
      await set("videoteca_movies_cache", movies);
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
    const offlineData = await get("videoteca_movies_cache");
    let list: any[] = [];
    if (offlineData) {
      list = typeof offlineData === 'string' ? JSON.parse(offlineData) : offlineData;
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
    await set("videoteca_movies_cache", list);
  } catch (e) {
    console.error("Error actualizando la caché local tras upsertMovie:", e);
  }

  return movieData;
};

export const updateMovie = async (id: string, updates: any) => {
  await updateDoc(doc(db, 'movies', id), updates);
  
  try {
    const offlineData = await get("videoteca_movies_cache");
    if (offlineData) {
      let list: any[] = typeof offlineData === 'string' ? JSON.parse(offlineData) : offlineData;
      const index = list.findIndex((m: any) => m.id === id);
      if (index > -1) {
        list[index] = { ...list[index], ...updates };
        list.sort((a, b) => {
          const timeA = a.createdAt || a.updatedAt || "";
          const timeB = b.createdAt || b.updatedAt || "";
          return timeB.localeCompare(timeA);
        });
        await set("videoteca_movies_cache", list);
      }
    }
  } catch (e) {}

  return { id, ...updates };
};

export const deleteMovie = async (id: string) => {
  await deleteDoc(doc(db, 'movies', id));
  
  try {
    const offlineData = await get("videoteca_movies_cache");
    if (offlineData) {
      let list: any[] = typeof offlineData === 'string' ? JSON.parse(offlineData) : offlineData;
      list = list.filter((m: any) => m.id !== id);
      await set("videoteca_movies_cache", list);
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
