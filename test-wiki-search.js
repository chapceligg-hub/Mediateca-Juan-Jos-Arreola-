import https from 'https';
https.get({
  hostname: 'itunes.apple.com',
  path: '/search?term=matrix&media=movie&limit=1',
  headers: { 'User-Agent': 'CoolApp/1.0' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data).results[0]));
});
