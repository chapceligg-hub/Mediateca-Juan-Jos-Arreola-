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

export const getAdminByEmail = async (email: string): Promise<{ id: string, role?: string, email?: string, name?: string, photoURL?: string } | null> => {
  const normalized = (email || '').toLowerCase().trim();
  if (!normalized) return null;

  let primary = 'chapceligg@gmail.com';
  try {
    const cachedPrimary = localStorage.getItem("videoteca_primary_superadmin");
    if (cachedPrimary) primary = cachedPrimary.toLowerCase().trim();
  } catch (_) {}

  // 1. Verificación instantánea en memoria local IndexedDB (0 lecturas, alta velocidad)
  try {
    const offlineAdmins = await get("videoteca_admins_cache");
    if (offlineAdmins) {
      const list = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
      if (Array.isArray(list)) {
        const found = list.find((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalized);
        if (found) return found;
      }
    }
  } catch (_) {}

  // 2. Verificación en el backend del servidor (soporte multi-dispositivo garantizado sin límite de cuota)
  try {
    const res = await fetch(`/api/admins/check/${encodeURIComponent(normalized)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.isAdmin) {
        const adminObj = { 
          id: normalized, 
          email: normalized, 
          role: data.role || (normalized === 'chapceligg@gmail.com' ? 'admin' : 'editor'),
          name: data.name || '',
          photoURL: data.photoURL || ''
        };
        try {
          const offlineAdmins = (await get("videoteca_admins_cache")) || [];
          let list = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
          if (!Array.isArray(list)) list = [];
          if (!list.some((a: any) => (a.email || a.id || '').toLowerCase().trim() === normalized)) {
            list.push(adminObj);
            await set("videoteca_admins_cache", list);
          }
        } catch (_) {}
        return adminObj;
      }
    }
  } catch (err) {
    console.warn("Aviso al consultar /api/admins/check:", err);
  }

  if (normalized === 'chapceligg@gmail.com' || normalized === primary) {
    return { id: normalized, email: normalized, role: 'admin' };
  }

  // 3. Verificación en Firestore directo por ID
  try {
    const docSnap = await getDoc(doc(db, 'admins', normalized));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...(docSnap.data() as any) };
    }
  } catch (error) {
    console.warn("Aviso al verificar admin en Firestore, recurriendo a consulta secundaria:", error);
  }

  // 4. Verificación en Firestore por campo email (por si se creó con auto-ID en la consola)
  try {
    const qEmail = query(collection(db, 'admins'), where('email', '==', normalized));
    const qSnap = await getDocs(qEmail);
    if (!qSnap.empty) {
      const firstDoc = qSnap.docs[0];
      return { id: firstDoc.id, ...(firstDoc.data() as any) };
    }
  } catch (err) {
    console.warn("Aviso al consultar email en Firestore:", err);
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

      if (incomingTime > localTime) {
        // Servidor es estrictamente más nuevo. Pero si el póster local se editó y el entrante es demo o vacío, preservar póster
        const finalPoster = (inc.poster && inc.poster !== "No disponible" && inc.poster !== "No encontrado")
          ? inc.poster
          : (existing.poster || inc.poster);
        map.set(inc.id, { ...inc, poster: finalPoster });
      } else {
        // La versión local es igual o más reciente (ej. editada en modo local o sin lecturas):
        // Preservamos la versión local completa para no perder cambios ni pósters
        map.set(inc.id, existing);
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

    const cached = await getCachedMovies();
    if (!cached || cached.length === 0) {
      console.log("[Smart Delta Sync] Sin catálogo local previo. Obteniendo catálogo inicial...");
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

    const snapshot = await getDocsFromServer(qDelta);
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

export const subscribeToMovies = (
  callback: (movies: any[]) => void, 
  onError?: (err: any) => void
) => {
  console.log("[Firebase] Conectando sincronización en tiempo real protegida...");

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
    runSmartDeltaSyncOnce(callback);
  }).catch((e) => {
    console.warn("Error leyendo respaldo inicial de IndexedDB:", e);
    runSmartDeltaSyncOnce(callback);
  });

  // 2. Suscripción en tiempo real pasiva con onSnapshot respaldada por persistentLocalCache
  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
  
  const unsubscribe = onSnapshot(
    q,
    async (snapshot) => {
      // Detectar y propagar documentos eliminados en Firestore en tiempo real entre dispositivos
      const removedIds: string[] = [];
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed' && change.doc && change.doc.id) {
          removedIds.push(change.doc.id);
        }
      });

      if (removedIds.length > 0) {
        fetch('/api/movies/deleted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: removedIds })
        }).catch(() => {});
      }

      let deletedIds = await syncDeletedMovieIds();
      if (removedIds.length > 0) {
        deletedIds = Array.from(new Set([...deletedIds, ...removedIds]));
      }

      const incomingMovies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const existing = await getCachedMovies() || [];

      const merged = mergeMoviesPreservingLocal(existing, incomingMovies, deletedIds);
      const deletedSet = new Set(deletedIds);
      const cleanMerged = merged.filter(m => m && m.id && !deletedSet.has(m.id));

      await setCachedMovies(cleanMerged, true);
      callback(cleanMerged);
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
        map.set(email, { ...existing, ...item, id: email, email });
      }
    }
  }
  return Array.from(map.values());
};

export const fetchAdminsOptimized = async (forceServer = false) => {
  const q = collection(db, 'admins');
  let localAdmins: any[] = [];

  try {
    const offlineAdmins = await get("videoteca_admins_cache");
    if (offlineAdmins) {
      const parsed = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
      if (Array.isArray(parsed)) localAdmins = parsed;
    }
  } catch (e) {}

  // 1. Siempre sincronizar con el registro central del servidor (0 lecturas Firestore, multi-dispositivo)
  let serverAdmins: any[] = [];
  let deletedSet = new Set<string>();

  try {
    const [resAdmins, resDeleted] = await Promise.all([
      fetch('/api/admins'),
      fetch('/api/admins/deleted')
    ]);
    if (resAdmins.ok) {
      const data = await resAdmins.json();
      if (Array.isArray(data)) serverAdmins = data;
    }
    if (resDeleted.ok) {
      const delData = await resDeleted.json();
      if (Array.isArray(delData)) {
        deletedSet = new Set(delData.map((d: string) => (d || '').trim().toLowerCase()));
      }
    }
  } catch (err) {
    console.warn("Aviso al consultar /api/admins:", err);
  }

  // 2. Si se solicita sincronización forzada (botón Sincronizar) o si no tenemos datos, consultar Firestore
  let firestoreAdmins: any[] = [];
  if (forceServer || (localAdmins.length === 0 && serverAdmins.length === 0)) {
    try {
      console.log("Firebase: Sincronizando administradores con Firestore");
      const snapshot = await getDocs(q);
      firestoreAdmins = snapshot.docs
        .filter(doc => !doc.id.startsWith('_'))
        .map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Aviso al consultar admins de Firestore (usando servidor/caché):", err);
    }
  } else {
    // Si no es forzado, intentar leer de la caché interna de Firestore (0 lecturas)
    try {
      const cachedSnap = await getDocsFromCache(q);
      if (!cachedSnap.empty) {
        firestoreAdmins = cachedSnap.docs
          .filter(doc => !doc.id.startsWith('_'))
          .map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (_) {}
  }

  // Combinamos de forma unificada: Servidor + Local + Firestore, excluyendo eliminados
  let unified = mergeAdmins(serverAdmins, localAdmins, firestoreAdmins);
  if (deletedSet.size > 0) {
    unified = unified.filter(a => !deletedSet.has((a.email || a.id || '').trim().toLowerCase()));
  }

  if (unified.length > 0) {
    await set("videoteca_admins_cache", unified);
    // Asegurar que el backend central tenga la lista consolidada de todas las fuentes
    fetch('/api/admins/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unified)
    }).catch(() => {});
    return unified;
  }

  return localAdmins.filter(a => !deletedSet.has((a.email || a.id || '').trim().toLowerCase()));
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

    const deletedList: string[] = (await get("videoteca_deleted_ids")) || [];
    if (deletedList.includes(movieId)) {
      await set("videoteca_deleted_ids", deletedList.filter(id => id !== movieId));
    }
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
    const deletedList: string[] = (await get("videoteca_deleted_ids")) || [];
    if (!deletedList.includes(id)) {
      deletedList.push(id);
      await set("videoteca_deleted_ids", deletedList.slice(-1000));
    }
  } catch (e) {}

  // 1. Notificar al servidor central (sincronización multi-dispositivo con 0 costo de Firestore)
  try {
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
    console.warn("Aviso al eliminar en Firestore (eliminado en caché local y servidor):", err);
  }
};

export const upsertAdmin = async (admin: any) => {
  const adminId = (admin.email || admin.id || '').toLowerCase().trim();
  if (!adminId) throw new Error("Correo inválido para el administrador.");

  const adminData: any = {
    ...admin,
    id: adminId,
    email: adminId,
    name: admin.name || adminId.split('@')[0],
    role: admin.role || 'editor',
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
    await fetch('/api/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminData)
    });
  } catch (err) {
    console.warn("Aviso al guardar admin en backend:", err);
  }

  // 2. Guardar en Firestore
  try {
    await setDoc(doc(db, 'admins', adminId), adminData, { merge: true });
  } catch (err) {
    console.warn("Aviso al guardar admin en Firestore (se guardará en backend y caché local):", err);
  }
  
  // 3. Guardar en caché IndexedDB
  try {
    const offlineAdmins = await get("videoteca_admins_cache");
    let list: any[] = [];
    if (offlineAdmins) {
      list = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
    }
    const index = list.findIndex((a: any) => (a.id || a.email || '').toLowerCase().trim() === adminId);
    if (index > -1) {
      list[index] = { ...list[index], ...adminData };
    } else {
      list.push(adminData);
    }
    await set("videoteca_admins_cache", list);
  } catch (e) {}

  return adminData;
};

export const deleteAdmin = async (idOrEmail: string) => {
  const adminId = (idOrEmail || '').toLowerCase().trim();
  if (!adminId) return;

  try {
    await fetch(`/api/admins/${encodeURIComponent(adminId)}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Aviso al eliminar admin en backend:", err);
  }

  try {
    await deleteDoc(doc(db, 'admins', adminId));
  } catch (err) {
    console.warn("Aviso al eliminar admin en Firestore (se eliminará de caché local):", err);
  }
  
  try {
    const offlineAdmins = await get("videoteca_admins_cache");
    if (offlineAdmins) {
      let list: any[] = typeof offlineAdmins === 'string' ? JSON.parse(offlineAdmins) : offlineAdmins;
      list = list.filter((a: any) => (a.id || a.email || '').toLowerCase().trim() !== adminId);
      await set("videoteca_admins_cache", list);
    }
  } catch (e) {}
};

export const getPrimarySuperAdminEmail = async (): Promise<string> => {
  try {
    const cached = localStorage.getItem("videoteca_primary_superadmin");
    if (cached && cached.trim()) {
      return cached.trim().toLowerCase();
    }
  } catch (_) {}

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
  } catch (err) {
    console.warn("Aviso al obtener super admin principal desde Firestore:", err);
  }

  return 'chapceligg@gmail.com';
};

export const transferPrimarySuperAdmin = async (newEmail: string, currentSuperAdminEmail: string) => {
  const normalizedNew = (newEmail || '').toLowerCase().trim();
  const normalizedCurrent = (currentSuperAdminEmail || '').toLowerCase().trim();
  if (!normalizedNew || !normalizedNew.includes('@') || !normalizedNew.includes('.')) {
    throw new Error("El correo ingresado no es válido.");
  }

  // Guardar en Firestore documento de configuración de Super Admin Principal
  await setDoc(doc(db, 'admins', '_primary_config'), {
    email: normalizedNew,
    transferredBy: normalizedCurrent,
    transferredAt: new Date().toISOString()
  }, { merge: true });

  // Asignar rol 'admin' al nuevo Super Admin Principal
  await upsertAdmin({
    email: normalizedNew,
    role: 'admin',
    name: normalizedNew.split('@')[0],
    updatedAt: new Date().toISOString()
  });

  // Asegurar que el anterior Super Admin Principal conserve rol de Super Admin
  if (normalizedCurrent) {
    await upsertAdmin({
      email: normalizedCurrent,
      role: 'admin',
      name: normalizedCurrent.split('@')[0],
      updatedAt: new Date().toISOString()
    });
  }

  // Actualizar caché en localStorage
  try {
    localStorage.setItem("videoteca_primary_superadmin", normalizedNew);
  } catch (_) {}

  return normalizedNew;
};


