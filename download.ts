import fs from 'fs';

async function downloadBackground() {
  const fileId = '1Bjnw0n4r_iRwpphEtKS4veUPJiCq2h2C';
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  
  try {
    console.log('Downloading background from Google Drive...');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Write both to PNG and JPG to satisfy all fallback code paths
    fs.writeFileSync('public/ImFondo.png', buffer);
    fs.writeFileSync('public/ImFondo.jpg', buffer);
    console.log('Background image downloaded and saved successfully to public/ImFondo.png and public/ImFondo.jpg');
  } catch (error) {
    console.error('Error downloading background:', error);
  }
}

downloadBackground();
