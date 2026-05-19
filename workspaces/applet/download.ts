import fs from 'fs';

async function fetchSvg() {
  try {
    const response = await fetch('https://drive.google.com/uc?export=download&id=1TM1XkuSduRMBdH9lBXMR_N_nECL36z-K');
    const text = await response.text();
    fs.writeFileSync('public/logo.svg', text);
    console.log('SVG downloaded successfully:', text.substring(0, 100) + '...');
  } catch (error) {
    console.error('Error downloading:', error);
  }
}

fetchSvg();
