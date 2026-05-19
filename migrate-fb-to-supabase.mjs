import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// 1. Setup Firebase
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const firebaseApp = initializeApp(config);
const db = getFirestore(firebaseApp, config.firestoreDatabaseId);

// 2. Setup Supabase
const supabaseUrl = 'https://wtgydqvcgafdyfppofpw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Z3lkcXZjZ2FmZHlmcHBvZnB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NzQzMjMsImV4cCI6MjA5NDQ1MDMyM30.Qt7yKSn8qrDUBy-vBICaTlSvRgii5GIHOn5fAHrcR40';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("Iniciando migración...");

  // 3. Migrar Admins
  const adminsSnap = await getDocs(collection(db, 'admins'));
  const admins = [];
  adminsSnap.forEach(doc => {
    let data = doc.data();
    if (data.createdAt && typeof data.createdAt === 'object' && data.createdAt.seconds) {
      data.createdAt = new Date(data.createdAt.seconds * 1000).toISOString();
    }
    admins.push(data);
  });

  console.log(`Encontrados ${admins.length} administradores en Firebase.`);
  if (admins.length > 0) {
    const { error } = await supabase.from('admins').upsert(admins);
    if (error) console.error("Error migrando admins:", error);
    else console.log("Admins migrados con éxito.");
  }

  // 4. Migrar Películas
  const moviesSnap = await getDocs(collection(db, 'movies'));
  const movies = [];
  moviesSnap.forEach(doc => {
    let data = doc.data();
    delete data.streaming; // <--- The column doesn't exist
    if (data.createdAt && typeof data.createdAt === 'object' && data.createdAt.seconds) {
      data.createdAt = new Date(data.createdAt.seconds * 1000).toISOString();
    }
    if (data.updatedAt && typeof data.updatedAt === 'object' && data.updatedAt.seconds) {
      data.updatedAt = new Date(data.updatedAt.seconds * 1000).toISOString();
    }
    
    // Fallbacks if cast is a string and it expects JSONB
    if (typeof data.cast === 'string') {
       try {
          // just convert to an array with 1 item
          data.cast = [data.cast];
       } catch(e) {}
    }
    // ensure posterCandidates is valid JSON
    if (typeof data.posterCandidates === 'string') {
       try {
         data.posterCandidates = JSON.parse(data.posterCandidates);
       } catch(e) {
         data.posterCandidates = [];
       }
    }

    let rating = data.rating;
    if (typeof rating === 'string') {
       rating = parseFloat(rating.replace(',', '.'));
       if (isNaN(rating)) rating = 0;
    }
    data.rating = rating || 0;

    movies.push({ id: doc.id, ...data });
  });

  console.log(`Encontradas ${movies.length} películas en Firebase.`);
  
  if (movies.length > 0) {
    // Para evitar límites, insertamos en lotes de 100
    for(let i = 0; i < movies.length; i += 100) {
      const batch = movies.slice(i, i + 100);
      const { error } = await supabase.from('movies').upsert(batch);
      if (error) {
        console.error(`Error migrando lote de películas ${i}:`, error);
      } else {
        console.log(`Lote ${i} - ${i + batch.length} migrado con éxito.`);
      }
    }
  }

  console.log("Migración completada.");
  process.exit(0);
}

migrate();
