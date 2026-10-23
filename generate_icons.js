import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicIconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(publicIconsDir)) {
  fs.mkdirSync(publicIconsDir, { recursive: true });
}

const logoSvgPath = path.join(__dirname, 'public', 'logo.svg');

async function generate() {
  console.log('Generating PWA icons from logo.svg...');

  await sharp(logoSvgPath)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicIconsDir, 'icon-192.png'));

  await sharp(logoSvgPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicIconsDir, 'icon-512.png'));

  const logoResizedBuffer = await sharp(logoSvgPath)
    .resize(380, 380)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 10, g: 15, b: 20, alpha: 1 }
    }
  })
  .composite([
    { input: logoResizedBuffer, top: 66, left: 66 }
  ])
  .png()
  .toFile(path.join(publicIconsDir, 'icon-maskable-512.png'));

  console.log('PWA icons created successfully in public/icons!');
}

generate().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
