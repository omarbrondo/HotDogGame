// Copia la versión web del juego a www/ para que Capacitor la empaquete en Android.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const entry of ['index.html', 'js', 'assets']) {
  fs.cpSync(path.join(root, entry), path.join(out, entry), { recursive: true });
}
console.log(`Versión web copiada en ${out}`);
