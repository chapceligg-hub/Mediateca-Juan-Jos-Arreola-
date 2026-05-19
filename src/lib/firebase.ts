import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged as firebaseOnAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  getDocsFromCache, getDocsFromServer
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
  const q = collection(db, 'movies');
  
  if (!forceServer) {
    try {
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) {
        console.log("Firebase: Películas cargadas desde la caché local");
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (e) {
      console.log("Firebase: Caché vacía o error, buscando en servidor...");
    }
  }

  // Petición al servidor real
  console.log("Firebase: Leyendo películas desde el servidor");
  const snapshot = await getDocsFromServer(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const fetchAdminsOptimized = async (forceServer = false) => {
  const q = collection(db, 'admins');
  
  if (!forceServer) {
    try {
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) {
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (e) {}
  }

  const snapshot = await getDocsFromServer(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const subscribeToMovies = (onUpdate: (movies: any[]) => void) => {
  const q = collection(db, 'movies');
  const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    // metadata.fromCache gives us insight, but we just pass the data
    const movies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    onUpdate(movies);
  }, (error) => {
    console.error("Firebase fetch movies error:", error);
  });
  return unsubscribe;
};

export const subscribeToAdmins = (onUpdate: (admins: any[]) => void) => {
  const q = collection(db, 'admins');
  const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    const admins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    onUpdate(admins);
  }, (error) => {
    console.error("Firebase fetch admins error:", error);
  });
  return unsubscribe;
};

export const upsertMovie = async (movie: any) => {
  const movieId = movie.id || `mov_${Date.now()}`;
  const movieData = { ...movie, id: movieId };
  await setDoc(doc(db, 'movies', movieId), movieData, { merge: true });
  return movieData;
};

export const updateMovie = async (id: string, updates: any) => {
  await updateDoc(doc(db, 'movies', id), updates);
  return { id, ...updates };
};

export const deleteMovie = async (id: string) => {
  await deleteDoc(doc(db, 'movies', id));
};

export const upsertAdmin = async (admin: any) => {
  const adminId = admin.email.toLowerCase();
  const adminData = { ...admin, id: adminId };
  await setDoc(doc(db, 'admins', adminId), adminData, { merge: true });
  return adminData;
};

export const deleteAdmin = async (id: string) => {
  await deleteDoc(doc(db, 'admins', id));
};
