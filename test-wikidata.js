import https from 'https';
const q = `
SELECT ?film ?filmLabel ?directorLabel ?publicationDate ?duration ?genreLabel ?image WHERE {
  ?film wdt:P31/wdt:P279* wd:Q11424.
  ?film rdfs:label "The Matrix"@en.
  OPTIONAL { ?film wdt:P57 ?director. }
  OPTIONAL { ?film wdt:P577 ?publicationDate. }
  OPTIONAL { ?film wdt:P2047 ?duration. }
  OPTIONAL { ?film wdt:P136 ?genre. }
  OPTIONAL { ?film wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
LIMIT 1
`;
https.get({
  hostname: 'query.wikidata.org',
  path: '/sparql?format=json&query=' + encodeURIComponent(q),
  headers: { 'User-Agent': 'CoolApp/1.0', 'Accept': 'application/sparql-results+json' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
