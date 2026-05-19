import https from 'https';
https.get({
  hostname: 'en.wikipedia.org',
  path: '/w/api.php?action=query&prop=extracts&exintro&titles=The_Matrix&format=json',
  headers: { 'User-Agent': 'CoolApp/1.0 (test@example.com)' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
