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

export const subscribeToMovies = (callback: (movies: any[]) => void, onError: (err: any) => void) => {
  console.log("[Firebase] Iniciando suscripción optimizada a películas (onSnapshot)...");
  // Utilizamos onSnapshot con IndexedDB (persistentLocalCache) en lugar de recargar manualmente.
  // Esto previene de forma contundente el "agotamiento de lecturas" al recuperar únicamente 
  // los documentos que han cambiado desde la última sincronización en caché local.
  const q = query(collection(db, 'movies'));
  
  return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    // metadata.fromCache indica si proviene del local sin consumo, pero procesamos todo
    const movies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Mantenemos el orden descendente por recencia
    movies.sort((a, b) => {
      const timeA = a.createdAt || "";
      const timeB = b.createdAt || "";
      return timeB.localeCompare(timeA);
    });

    // Guardamos la nueva caché unificada para cuando carga rápido
    try {
      localStorage.setItem("videoteca_movies_cache", JSON.stringify(movies));
    } catch (error) {
      console.warn("No se pudo escribir en la memoria caché", error);
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
