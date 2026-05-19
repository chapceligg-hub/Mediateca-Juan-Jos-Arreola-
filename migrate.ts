import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { createClient } from '@insforge/sdk';
import fs from 'fs';

const fbConfigStr = fs.readFileSync('firebase-applet-config.json', 'utf-8');
const fbConfig = JSON.parse(fbConfigStr);

const app = initializeApp(fbConfig);
const db = getFirestore(app, fbConfig.firestoreDatabaseId);

const insforgeUrl = 'https://razyk54r.us-west.insforge.app';
const insforgeKey = 'ik_8d53a92b373f80470bd95201a42c4715';

const insforgeClient = createClient({
  baseUrl: insforgeUrl,
  anonKey: insforgeKey
});

async function run() {
  console.log("Fetching movies from Firebase...");
  const snapshot = await getDocs(collection(db, 'movies'));
  const movies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  console.log(`Found ${movies.length} movies. Migrating to InsForge...`);
  
  if (movies.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < movies.length; i += batchSize) {
      const batch = movies.slice(i, i + batchSize);
      // clean functions or undefined fields
      const safeBatch = JSON.parse(JSON.stringify(batch)); 
      
      console.log(`Inserting batch ${i / batchSize + 1} (${batch.length} movies)...`);
      const { error } = await insforgeClient.database.from('movies').upsert(safeBatch);
      if (error) {
         console.error("Error inserting batch:", JSON.stringify(error), error.message, error.details);
      } else {
         console.log("Batch success.");
      }
    }
  }

  try {
    console.log("Fetching quotes from Firebase...");
    const qSnapshot = await getDocs(collection(db, 'quotes'));
    const quotes = qSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (quotes.length > 0) {
       console.log(`Found ${quotes.length} quotes. Migrating...`);
       const { error } = await insforgeClient.database.from('quotes').upsert(quotes);
       if (error) console.error("Error inserting quotes:", JSON.stringify(error));
    }
  } catch (e) {
    console.error("Skipping quotes due to error:", e.message);
  }

  try {
    console.log("Fetching admins from Firebase...");
    const aSnapshot = await getDocs(collection(db, 'admins'));
    const admins = aSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (admins.length > 0) {
       console.log(`Found ${admins.length} admins. Migrating...`);
       const { error } = await insforgeClient.database.from('admins').upsert(admins);
       if (error) console.error("Error inserting admins:", JSON.stringify(error));
    }
  } catch (e) {
    console.error("Skipping admins due to error:", e.message);
  }

  console.log("Migration finished.");
  process.exit(0);
}

run().catch(console.error);
