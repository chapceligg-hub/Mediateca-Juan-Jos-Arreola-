const fs = require('fs');
const svg = fs.readFileSync('public/logo.svg', 'utf8');
const match = svg.match(/base64,([^"]+)/);
if(match) {
  fs.writeFileSync('temp.png', Buffer.from(match[1], 'base64'));
  console.log("png extracted");
}
