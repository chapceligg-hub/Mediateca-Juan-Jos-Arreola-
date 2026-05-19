import https from 'https';
https.get({
  hostname: 'v3.sg.media-imdb.com',
  path: '/suggestion/m/matrix.json',
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
