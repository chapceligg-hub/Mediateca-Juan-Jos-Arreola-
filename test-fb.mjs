import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);
async function run() {
  const s = await getDocs(query(collection(db, 'movies'), limit(5)));
  console.log("Firebase count:", s.docs.length);
}
run();
