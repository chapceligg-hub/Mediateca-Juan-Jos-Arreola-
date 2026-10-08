import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

async function runBackup() {
  console.log("Iniciando respaldo de Firestore...");
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (!fs.existsSync(configPath)) {
    console.error("No se encontró firebase-applet-config.json");
    process.exit(1);
  }

  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const app = initializeApp(firebaseConfig, "backup-" + Date.now());
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  // 1. Obtener todas las películas de la colección "movies"
  console.log("Leyendo colección 'movies'...");
  const moviesSnapshot = await getDocs(collection(db, "movies"));
  const allMovies: any[] = [];
  moviesSnapshot.forEach((docSnap) => {
    allMovies.push({ id: docSnap.id, ...docSnap.data() });
  });
  console.log(`Películas encontradas: ${allMovies.length}`);

  // Clasificar por sección/tabla deseada: peliculas, series, centauro
  const peliculas: any[] = [];
  const series: any[] = [];
  const centauro: any[] = [];

  for (const m of allMovies) {
    const sec = (m.section || "peliculas").toLowerCase().trim();
    if (sec === "series") {
      series.push(m);
    } else if (sec === "centauro") {
      centauro.push(m);
    } else {
      peliculas.push(m);
    }
  }

  // 2. Obtener settings/auth y settings/sync
  console.log("Leyendo documentos de 'settings'...");
  let authSettings = null;
  let syncSettings = null;

  try {
    const authSnap = await getDoc(doc(db, "settings", "auth"));
    if (authSnap.exists()) {
      authSettings = authSnap.data();
    }
  } catch (e) {
    console.warn("Aviso leyendo settings/auth:", e);
  }

  try {
    const syncSnap = await getDoc(doc(db, "settings", "sync"));
    if (syncSnap.exists()) {
      syncSettings = syncSnap.data();
    }
  } catch (e) {
    console.warn("Aviso leyendo settings/sync:", e);
  }

  const backupData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      totalRecords: allMovies.length,
      counts: {
        peliculas: peliculas.length,
        series: series.length,
        centauro: centauro.length
      }
    },
    settings: {
      auth: authSettings || { masterKey: "AdminMaster2026#", editorPin: "123456" },
      sync: syncSettings || {}
    },
    tables: {
      peliculas,
      series,
      centauro
    },
    allMoviesRaw: allMovies
  };

  const outputPath = path.join(process.cwd(), "backup_database_complete.json");
  fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2), "utf-8");
  console.log(`✅ Respaldo generado con éxito en ${outputPath}`);
  console.log(`Resumen:`);
  console.log(`- Películas: ${peliculas.length}`);
  console.log(`- Series: ${series.length}`);
  console.log(`- Centauro: ${centauro.length}`);
  console.log(`- Total de obras: ${allMovies.length}`);
}

runBackup().catch((err) => {
  console.error("Error durante el respaldo:", err);
  process.exit(1);
});
