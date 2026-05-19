import https from 'https';
https.get({
  hostname: 'api.duckduckgo.com',
  path: '/?q=The+Matrix+movie&format=json',
  headers: { 'User-Agent': 'CoolApp/1.0' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data).Abstract));
});
