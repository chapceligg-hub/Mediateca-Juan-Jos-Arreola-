const fs = require('fs');
const Jimp = require('jimp');

async function run() {
    const image = await Jimp.read('temp.png');
    console.log("Size:", image.bitmap.width, image.bitmap.height);
    console.log("Top-left pixel:", Jimp.intToRGBA(image.getPixelColor(0, 0)));
}
run();
