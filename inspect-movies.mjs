import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, orderBy } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const s = await getDocs(query(collection(db, 'movies'), limit(20)));
  console.log("Total sample retrieved:", s.docs.length);
  const sample = s.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      isLatestSaved: data.isLatestSaved
    };
  });
  console.log(JSON.stringify(sample, null, 2));
  process.exit(0);
}
run();
