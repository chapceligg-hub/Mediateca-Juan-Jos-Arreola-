import https from 'https';

https.get('https://api.tvmaze.com/search/shows?q=breaking+bad', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data);
  });
});
