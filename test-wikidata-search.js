import https from 'https';

async function searchWikidata(query) {
  const q = `
  SELECT ?film ?filmLabel ?directorLabel ?publicationDate ?duration ?genreLabel ?image ?description WHERE {
    ?film wdt:P31/wdt:P279* wd:Q11424.
    ?film rdfs:label "${query}"@es.
    OPTIONAL { ?film wdt:P57 ?director. }
    OPTIONAL { ?film wdt:P577 ?publicationDate. }
    OPTIONAL { ?film wdt:P2047 ?duration. }
    OPTIONAL { ?film wdt:P136 ?genre. }
    OPTIONAL { ?film wdt:P18 ?image. }
    OPTIONAL { ?film schema:description ?description. FILTER(LANG(?description) = "es") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
  }
  LIMIT 1
  `;
  return new Promise((resolve) => {
    https.get({
      hostname: 'query.wikidata.org',
      path: '/sparql?format=json&query=' + encodeURIComponent(q),
      headers: { 'User-Agent': 'CoolApp/1.0', 'Accept': 'application/sparql-results+json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });
}

searchWikidata('Matrix').then(res => console.log(JSON.stringify(res.results.bindings, null, 2)));
