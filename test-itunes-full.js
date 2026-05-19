import https from 'https';
https.get({
  hostname: 'itunes.apple.com',
  path: '/search?term=matrix&entity=movie',
  headers: { 'User-Agent': 'CoolApp/1.0' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
