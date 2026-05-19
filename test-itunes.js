import https from 'https';
https.get({
  hostname: 'itunes.apple.com',
  path: '/search?term=batman&entity=movie&limit=1',
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
  let data = '';
  console.log(res.statusCode);
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
