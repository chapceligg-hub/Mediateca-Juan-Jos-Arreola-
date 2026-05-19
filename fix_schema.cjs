function generateAlterTable(movies) {
  const allKeys = new Set();
  movies.forEach(m => Object.keys(m).forEach(k => allKeys.add(k)));
  const existing = ["id","title","originalTitle","year","rating","duration","country","director","genre","ageRating","streaming","poster","synopsis","cast","script","music","photography","companies","reviews","awards","updatedAt","filmaffinityId","tmdbId","posterCandidates","createdAt"];
  
  const missing = [...allKeys].filter(k => !existing.includes(k));
  if (missing.length === 0) return console.log("No missing columns.");
  
  const query = `ALTER TABLE movies ` + missing.map(m => `ADD COLUMN "${m}" JSONB`).join(", ") + `; NOTIFY pgrst, 'reload schema';`;
  console.log(query);
}

const fs = require('fs');
const getDocs = require('firebase/firestore').getDocs;
const collection = require('firebase/firestore').collection;
const db = require('firebase/firestore').getFirestore(require('firebase/app').initializeApp(JSON.parse(fs.readFileSync('firebase-applet-config.json'))), JSON.parse(fs.readFileSync('firebase-applet-config.json')).firestoreDatabaseId);

getDocs(collection(db, 'movies')).then(snap => {
  const movies = snap.docs.map(d => d.data());
  generateAlterTable(movies);
});
