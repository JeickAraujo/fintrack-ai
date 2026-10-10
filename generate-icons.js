const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Guardar SVG oficial
const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="115" fill="#090d16"/>
  <rect x="32" y="32" width="448" height="448" rx="96" fill="#10b981" fill-opacity="0.1" stroke="#10b981" stroke-width="12"/>
  <text x="50%" y="58%" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="260" font-weight="900" fill="#10b981" text-anchor="middle" dominant-baseline="middle">F</text>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);

// Intentar renderizar a PNG usando sharp
try {
  const sharp = require('C:/Users/ASUS/AppData/Local/OpenAI/Codex/runtimes/cua_node/7d8d3ac5ca9f6767/bin/node_modules/sharp');
  const buffer = Buffer.from(svgContent);

  Promise.all([
    sharp(buffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png')),
    sharp(buffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png')),
    sharp(buffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'))
  ]).then(() => {
    console.log('✓ Iconos PWA y Apple Touch Icon PNG generados exitosamente.');
  }).catch(err => {
    console.error('Error generando PNG:', err);
  });
} catch (e) {
  console.log('Sharp no disponible directamente, SVG guardado en public/icon.svg');
}
