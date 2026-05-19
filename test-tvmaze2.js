import https from 'https';
https.get({
  hostname: 'api.tvmaze.com',
  path: '/search/shows?q=the+matrix',
  headers: { 'User-Agent': 'CoolApp/1.0' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
