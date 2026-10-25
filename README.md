# Gato Callejero

Juego de plataformas 2D estilo Tiny Toons. El gato (con gorra y chándal) avanza
por los niveles, salta plataformas, lanza rocas y aplasta a los perros. Un solo
código corre en el navegador, en **Windows** (Electron) y en **Android**
(Capacitor).

## Controles

| Acción            | Teclado                       | Táctil (Android)  |
|-------------------|-------------------------------|-------------------|
| Mover             | ← → o A D                     | ◀ ▶               |
| Saltar            | Espacio, W, ↑ o Z             | ⤒                 |
| Lanzar roca       | J, X o K                      | ✊                |
| Pausa             | P o Esc                       | II                |
| Confirmar menús   | Enter o Espacio               | Tocar la pantalla |

Para ganar: pisa a los perros desde arriba o golpéalos con dos rocas, toca las
monedas y llega a la bandera. Si un perro te toca de lado o caes a un hueco,
pierdes una vida (tienes 3).

## Estructura

```
index.html            Página del juego (canvas + controles táctiles)
js/game.js            Motor: físicas, niveles, IA de perros, HUD
assets/sprites/       Cuadros PNG de animación (perro y gato)
electron/main.js      Ventana de escritorio para Windows
scripts/build-web.js  Copia la versión web a www/ para Android
tools/slice_sprites.py Regenera los cuadros desde las hojas de sprites
capacitor.config.json Configuración de la app Android
```

Los niveles están en `LEVELS` dentro de `js/game.js`. Cada carácter es una celda
de 48 px: `#` suelo, `-` plataforma, `o` moneda, `d` perro, `S` inicio, `F` meta
y `.` vacío. Para añadir un nivel basta con añadir otro arreglo de filas.

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior.
- Para Android: [Android Studio](https://developer.android.com/studio) con un
  SDK instalado y Java 17.

Instala las dependencias una vez:

```bash
npm install
```

## Jugar en el navegador

No necesita instalación. Desde la carpeta del proyecto:

```bash
python3 -m http.server 8000
```

Abre `http://localhost:8000` (no abras `index.html` con doble clic si quieres
probar táctil, porque algunos navegadores bloquean recursos locales).

## Windows (escritorio con Electron)

Probar en una ventana:

```bash
npm start
```

Generar el instalador `.exe` (se crea en `dist/`):

```bash
npm run dist:win
```

Esto usa `electron-builder` con el objetivo NSIS. Para un ejecutable portable,
cambia `"target": "nsis"` por `"portable"` en `package.json`.

## Android (Capacitor)

La primera vez crea el proyecto Android nativo:

```bash
npm run android:init
```

Después, cada vez que cambies el juego:

```bash
npm run android:sync
npm run android:open
```

Desde Android Studio puedes ejecutarlo en un emulador o teléfono, o generar el
APK/AAB con **Build > Build Bundle(s) / APK(s)**.

Para forzar orientación horizontal, abre `android/app/src/main/AndroidManifest.xml`
y, dentro de `<activity ...>`, añade:

```xml
android:screenOrientation="sensorLandscape"
```

Los botones táctiles aparecen solo en pantallas táctiles.

## Notas sobre los sprites

Los cuadros de `assets/sprites/` salen de las hojas que enviaste (fondo magenta,
recortado y con transparencia). Si cambias las hojas, regenera los cuadros con:

```bash
python3 tools/slice_sprites.py --dog hoja_perro.jpg --cat hoja_gato.jpg --out assets/sprites
```

Requiere `numpy` y `pillow` (`pip install numpy pillow`).

## Próximos pasos sugeridos

- Sonidos y música (la forma más sencilla es Web Audio o archivos `.ogg`).
- Más enemigos y niveles.
- Guardado del progreso con `localStorage`.
