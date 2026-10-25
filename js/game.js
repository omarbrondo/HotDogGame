// Perro Callejero: plataformas 2D en HTML5 Canvas.
// Mismo código para navegador, Windows (Electron) y Android (Capacitor).
(() => {
  'use strict';

  const W = 960;
  const H = 540;
  const TILE = 48;
  const GRAVITY = 2100;
  const MAX_FALL = 1100;
  const PLAYER_SPEED = 230;
  const JUMP_VELOCITY = 860;
  const ATTACK_TIME = 0.42;
  const ATTACK_COOLDOWN = 0.45;
  const ENEMY_HITS = 2;
  const BITE_START = 0.08;
  const BITE_END = 0.3;
  const START_LIVES = 3;
  const SPRITE_SCALE = 0.27;
  const PLAYER_BOX = { w: 40, h: 78 };
  const ENEMY_BOX = { w: 56, h: 74 };
  const SOLID = new Set(['#', '-']);
  const FRAME_COUNTS = { walk: 5, jump: 4, attack: 4, death: 4 };

  // Mapa: # suelo, - plataforma, . vacío, S inicio del perro, o moneda,
  // d gato enemigo, F meta. Las filas más cortas se completan con vacío.
  const LEVELS = [
    [
      '........................................................................',
      '....o.o.o.......o.o.o.........o.o.o........o.o.o..........o.o.o.........',
      '.................................................----.........o.o......',
      '..S...........o.o.o..........o.o.o.........................o.o.........',
      '...........................................-----.....o.o.o.............',
      '........d.......................d.......................................',
      '....-----.........-----........------.........d.........o.o.o-----....',
      '..........----............o.o.o...-----.........----.................',
      '................................................................F.......',
      '##########..##########..############..########..##########..############',
      '##########..##########..############..########..##########..############',
    ],
    [
      '........................................................................',
      '.....o.o.....................o.o.o.........o.o.o.......o.o.o.o...........',
      '...............................................................o.o......',
      '..S..........d.........o.o.o...........d....o.o.o.......................',
      '.........------...................d.....................o.o.o...........',
      '..-----.......................-----......................................',
      '......................o.-----...........................................',
      '...........----.........d...............d.....----.......o.o.o.........',
      '..........................-----------.....-----.........---------.....F.',
      '##########..##########..############..########..##########..############',
      '##########..##########..############..########..##########..############',
    ],
  ];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const touchBar = document.getElementById('touch');

  // ---------- Sprites ----------
  const sprites = { cat: {}, dog: {} };

  function loadSprites() {
    const jobs = [];
    for (const who of Object.keys(sprites)) {
      for (const anim of Object.keys(FRAME_COUNTS)) {
        sprites[who][anim] = [];
        for (let i = 0; i < FRAME_COUNTS[anim]; i++) {
          const img = new Image();
          img.src = `assets/sprites/${who}_${anim}_${i}.png`;
          sprites[who][anim].push(img);
          jobs.push(img.decode());
        }
      }
    }
    return Promise.all(jobs);
  }

  // ---------- Entrada (teclado y táctil) ----------
  const keys = { left: false, right: false, jump: false, attack: false };
  const pressed = { jump: false, attack: false, confirm: false, pause: false };
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump',
    KeyJ: 'attack', KeyX: 'attack', KeyK: 'attack',
  };

  function press(action) {
    if (action === 'pause') { pressed.pause = true; return; }
    if (!keys[action]) {
      if (action === 'jump' || action === 'attack') pressed[action] = true;
    }
    keys[action] = true;
  }

  function release(action) {
    if (action !== 'pause') keys[action] = false;
  }

  window.addEventListener('keydown', (e) => {
    const action = KEYMAP[e.code];
    if (action) { e.preventDefault(); press(action); }
    if (e.code === 'Enter' || e.code === 'Space') pressed.confirm = true;
    if (e.code === 'KeyP' || e.code === 'Escape') pressed.pause = true;
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (action) { e.preventDefault(); release(action); }
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });
  window.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-key]')) pressed.confirm = true;
  });

  document.querySelectorAll('[data-key]').forEach((btn) => {
    const action = btn.dataset.key;
    const down = (e) => { e.preventDefault(); press(action); pressed.confirm = true; };
    const up = (e) => { e.preventDefault(); release(action); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
  });

  if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
    touchBar.classList.add('on');
  }

  // ---------- Pantalla ----------
  function resize() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${Math.floor(W * s)}px`;
    canvas.style.height = `${Math.floor(H * s)}px`;
    canvas.width = Math.floor(W * s * dpr);
    canvas.height = Math.floor(H * s * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Niveles y entidades ----------
  function makePlayer(spawn) {
    return {
      x: spawn.x, y: spawn.y, w: PLAYER_BOX.w, h: PLAYER_BOX.h,
      vx: 0, vy: 0, facing: 1, onGround: false, hitWall: false,
      attackT: -1, attackCd: 0, hitIds: new Set(), jumpT: 1,
      landT: 0, wasOnGround: true,
      dead: false, deadT: 0, invuln: 0, animT: 0,
    };
  }

  function makeEnemy(x, y) {
    return {
      x, y, w: ENEMY_BOX.w, h: ENEMY_BOX.h,
      vx: 0, vy: 0, dir: -1, facing: -1, onGround: false, hitWall: false,
      hits: 0, dying: false, t: 0, remove: false, animT: 0, aware: false,
    };
  }

  function buildLevel(index) {
    const rows = LEVELS[index];
    const cols = Math.max(...rows.map((r) => r.length));
    const grid = rows.map((r) => r.padEnd(cols, '.').split(''));
    const level = {
      grid, cols, rows: grid.length,
      width: cols * TILE, height: grid.length * TILE,
      spawn: { x: TILE * 2, y: TILE * 2 },
      coins: [], enemies: [], flag: null,
    };
    grid.forEach((row, r) => row.forEach((ch, c) => {
      const x = c * TILE;
      const y = r * TILE;
      if (ch === 'S') {
        level.spawn = { x: x + (TILE - PLAYER_BOX.w) / 2, y: y + TILE - PLAYER_BOX.h };
      } else if (ch === 'o') {
        level.coins.push({ x: x + TILE / 2, y: y + TILE / 2, taken: false });
      } else if (ch === 'd') {
        level.enemies.push(makeEnemy(x + (TILE - ENEMY_BOX.w) / 2, y + TILE - ENEMY_BOX.h));
      } else if (ch === 'F') {
        level.flag = { x: x + TILE / 2, y: y + TILE };
      } else {
        return;
      }
      row[c] = '.';
    }));
    return level;
  }

  function solidAt(level, c, r) {
    if (r < 0 || r >= level.rows) return false;
    if (c < 0 || c >= level.cols) return true;
    return SOLID.has(level.grid[r][c]);
  }

  // Mueve un cuerpo con colisiones de tiles, eje X y luego eje Y.
  function moveBody(level, b, dt) {
    b.hitWall = false;
    b.x += b.vx * dt;
    if (b.vx !== 0) {
      const top = Math.floor(b.y / TILE);
      const bottom = Math.floor((b.y + b.h - 1) / TILE);
      const c = b.vx > 0 ? Math.floor((b.x + b.w - 1) / TILE) : Math.floor(b.x / TILE);
      for (let r = top; r <= bottom; r++) {
        if (solidAt(level, c, r)) {
          b.x = b.vx > 0 ? c * TILE - b.w : (c + 1) * TILE;
          b.vx = 0;
          b.hitWall = true;
          break;
        }
      }
    }

    b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
    b.y += b.vy * dt;
    b.onGround = false;
    const left = Math.floor(b.x / TILE);
    const right = Math.floor((b.x + b.w - 1) / TILE);
    if (b.vy > 0) {
      // Borde inferior de los pies: con y+h exacto sobre el suelo, la fila correcta es la del suelo.
      const r = Math.floor((b.y + b.h) / TILE);
      for (let c = left; c <= right; c++) {
        if (solidAt(level, c, r)) {
          b.y = r * TILE - b.h;
          b.vy = 0;
          b.onGround = true;
          break;
        }
      }
    } else if (b.vy < 0) {
      const r = Math.floor(b.y / TILE);
      for (let c = left; c <= right; c++) {
        if (solidAt(level, c, r)) {
          b.y = (r + 1) * TILE;
          b.vy = 0;
          break;
        }
      }
    }
  }

  function groundAhead(level, b, dir) {
    const c = dir > 0 ? Math.floor((b.x + b.w + 2) / TILE) : Math.floor((b.x - 2) / TILE);
    const r = Math.floor((b.y + b.h + 4) / TILE);
    return solidAt(level, c, r);
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Estado del juego ----------
  const game = {
    state: 'loading', // loading | title | play | paused | clear | gameover | victory
    levelIndex: 0,
    level: null,
    player: null,
    enemies: [],
    lives: START_LIVES,
    score: 0,
    levelCoins: 0,
    camX: 0,
    time: 0,
  };

  function startLevel(index) {
    game.levelIndex = index;
    game.level = buildLevel(index);
    game.player = makePlayer(game.level.spawn);
    game.enemies = game.level.enemies;
    game.levelCoins = 0;
    game.camX = clampCam(game.player.x + game.player.w / 2 - W / 2);
    game.state = 'play';
  }

  function resetRun() {
    game.lives = START_LIVES;
    game.score = 0;
    startLevel(0);
  }

  function clampCam(x) {
    return Math.max(0, Math.min(x, game.level.width - W));
  }

  function killPlayer(p, cause) {
    if (p.dead) return;
    p.dead = true;
    p.deadT = 0;
    p.vy = cause === 'pit' ? -150 : -420;
    p.vx = cause === 'pit' ? 0 : -p.facing * 120;
  }

  function killEnemy(d) {
    d.dying = true;
    d.t = 0;
    d.vx = 0;
    d.vy = -320;
  }

  function completeLevel() {
    game.score += game.levelCoins;
    game.state = game.levelIndex + 1 < LEVELS.length ? 'clear' : 'victory';
  }

  // ---------- Actualización ----------
  // Mordisco: golpea a los gatos delante del perro durante la parte activa del ataque.
  function biteEnemies(p) {
    const box = { x: p.facing > 0 ? p.x + p.w - 6 : p.x - 40, y: p.y + 14, w: 46, h: 46 };
    for (const e of game.enemies) {
      if (e.dying || p.hitIds.has(e) || !overlap(box, e)) continue;
      p.hitIds.add(e);
      e.hits += 1;
      if (e.hits >= ENEMY_HITS) killEnemy(e);
    }
  }

  function updatePlayer(dt) {
    const p = game.player;
    const level = game.level;
    p.animT += dt;
    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd -= dt;

    let dirX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (p.attackT >= 0 && p.onGround) dirX = 0;
    p.vx = dirX * PLAYER_SPEED;
    if (dirX !== 0) p.facing = dirX;

    if (pressed.jump && p.onGround) {
      p.vy = -JUMP_VELOCITY;
      p.jumpT = 0;
    }
    p.jumpT = Math.min(p.jumpT + dt, 1);
    // Salto variable: soltar la tecla corta el salto, pero nunca antes de 0.12 s.
    if (!keys.jump && p.vy < -260 && p.jumpT > 0.12) p.vy = -260;

    if (pressed.attack && p.attackCd <= 0 && p.attackT < 0) {
      p.attackT = 0;
      p.attackCd = ATTACK_COOLDOWN;
      p.hitIds = new Set();
    }
    if (p.attackT >= 0) {
      p.attackT += dt;
      if (p.attackT >= BITE_START && p.attackT <= BITE_END) biteEnemies(p);
      if (p.attackT >= ATTACK_TIME) p.attackT = -1;
    }

    moveBody(level, p, dt);
    if (p.onGround && !p.wasOnGround) p.landT = 0.12;
    p.landT = Math.max(0, p.landT - dt);
    p.wasOnGround = p.onGround;
    if (p.y > level.height + TILE * 2) killPlayer(p, 'pit');
  }

  function updateEnemy(d, dt) {
    const level = game.level;
    const p = game.player;

    if (d.dying) {
      d.t += dt;
      d.vx = 0;
      moveBody(level, d, dt);
      if (d.t > 1.4) d.remove = true;
      return;
    }

    const dx = p.x + p.w / 2 - (d.x + d.w / 2);
    const dy = Math.abs(p.y + p.h / 2 - (d.y + d.h / 2));
    d.aware = !p.dead && Math.abs(dx) < 300 && dy < 110;
    if (d.aware) d.dir = dx > 0 ? 1 : -1;

    const speed = d.aware ? 135 : 70;
    const ledge = !groundAhead(level, d, d.dir);
    if (ledge && !d.aware) d.dir = -d.dir;
    d.vx = ledge && d.aware ? 0 : d.dir * speed;
    d.facing = d.dir;

    moveBody(level, d, dt);
    if (d.hitWall && !d.aware) d.dir = -d.dir;
    d.animT += dt;
    if (d.y > level.height + TILE * 4) d.remove = true;
  }

  function onPlayerDeathEnd() {
    game.lives -= 1;
    if (game.lives <= 0) {
      game.state = 'gameover';
      return;
    }
    startLevel(game.levelIndex);
  }

  function updateWorld(dt) {
    const p = game.player;
    const level = game.level;

    if (p.dead) {
      p.deadT += dt;
      p.animT += dt;
      moveBody(level, p, dt);
      if (p.deadT > 1.6) onPlayerDeathEnd();
      return;
    }

    updatePlayer(dt);
    if (p.dead) return;

    for (const d of game.enemies) updateEnemy(d, dt);
    game.enemies = game.enemies.filter((d) => !d.remove);

    for (const d of game.enemies) {
      if (d.dying || !overlap(p, d)) continue;
      const feetAboveTop = p.y + p.h - d.y < 26;
      if (p.vy > 0 && feetAboveTop) {
        killEnemy(d);
        p.vy = -460;
      } else if (p.invuln <= 0) {
        killPlayer(p, 'dog');
        return;
      }
    }

    for (const coin of level.coins) {
      if (coin.taken) continue;
      if (coin.x > p.x - 8 && coin.x < p.x + p.w + 8 && coin.y > p.y - 8 && coin.y < p.y + p.h + 8) {
        coin.taken = true;
        game.levelCoins += 1;
      }
    }

    const flagBox = { x: level.flag.x - TILE / 2, y: level.flag.y - TILE * 2, w: TILE, h: TILE * 2 };
    if (overlap(p, flagBox)) {
      completeLevel();
      return;
    }

    const target = clampCam(p.x + p.w / 2 - W / 2);
    game.camX += (target - game.camX) * Math.min(1, dt * 8);
  }

  function update(dt) {
    game.time += dt;

    if (pressed.pause) {
      if (game.state === 'play') game.state = 'paused';
      else if (game.state === 'paused') game.state = 'play';
    }

    if (game.state === 'play') {
      updateWorld(dt);
    } else if (game.state === 'title' && pressed.confirm) {
      resetRun();
    } else if (game.state === 'clear' && pressed.confirm) {
      startLevel(game.levelIndex + 1);
    } else if ((game.state === 'gameover' || game.state === 'victory') && pressed.confirm) {
      resetRun();
    }

    pressed.jump = false;
    pressed.attack = false;
    pressed.confirm = false;
    pressed.pause = false;
  }

  // ---------- Dibujo ----------
  const SKY_TOP = '#5ec8ff';
  const SKY_BOTTOM = '#d7f3ff';

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Nubes con parallax lento
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const cloudShift = game.camX * 0.2;
    for (let i = 0; i < 8; i++) {
      const x = ((i * 260 - cloudShift) % (W + 260) + W + 260) % (W + 260) - 130;
      const y = 60 + (i % 3) * 50;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.arc(x + 30, y - 12, 32, 0, Math.PI * 2);
      ctx.arc(x + 62, y, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    // Colinas con parallax medio
    ctx.fillStyle = '#7fd06b';
    const hillShift = game.camX * 0.45;
    for (let i = 0; i < 6; i++) {
      const x = i * 340 - (hillShift % 340);
      ctx.beginPath();
      ctx.arc(x + 170, H + 40, 170, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawTiles(level, camX, offsetY) {
    const c0 = Math.max(0, Math.floor(camX / TILE));
    const c1 = Math.min(level.cols - 1, Math.ceil((camX + W) / TILE));
    for (let r = 0; r < level.rows; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = level.grid[r][c];
        if (!SOLID.has(ch)) continue;
        const x = c * TILE;
        const y = offsetY + r * TILE;
        if (ch === '#') {
          ctx.fillStyle = '#b06b38';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          for (let by = 12; by < TILE; by += 12) ctx.fillRect(x, y + by, TILE, 2);
          const offset = r % 2 ? 0 : 24;
          for (let bx = offset; bx < TILE; bx += 24) ctx.fillRect(x + bx, y, 2, TILE);
          const above = solidAt(level, c, r - 1);
          if (!above) {
            ctx.fillStyle = '#5bc247';
            ctx.fillRect(x, y, TILE, 12);
            ctx.fillStyle = '#3d9a32';
            ctx.fillRect(x, y + 12, TILE, 4);
          }
        } else {
          ctx.fillStyle = '#c98a4b';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#e7b070';
          ctx.fillRect(x, y, TILE, 8);
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(x, y + 20, TILE, 2);
          ctx.fillRect(x, y + 36, TILE, 2);
        }
      }
    }
  }

  function drawCoins(level, offsetY) {
    for (const coin of level.coins) {
      if (coin.taken) continue;
      const bob = Math.sin(game.time * 4 + coin.x * 0.05) * 3;
      const x = coin.x;
      const y = offsetY + coin.y + bob;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#e0a526';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd95a';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x - 4, y - 5, 3, 6);
    }
  }

  function drawFlag(level, offsetY) {
    const f = level.flag;
    const baseY = offsetY + f.y;
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(f.x - 2, baseY - TILE * 3, 4, TILE * 3);
    const wave = Math.sin(game.time * 5) * 4;
    ctx.fillStyle = '#e8413b';
    ctx.beginPath();
    ctx.moveTo(f.x + 2, baseY - TILE * 3 + 4);
    ctx.lineTo(f.x + 44 + wave, baseY - TILE * 3 + 16);
    ctx.lineTo(f.x + 40 - wave, baseY - TILE * 3 + 40);
    ctx.lineTo(f.x + 2, baseY - TILE * 3 + 44);
    ctx.closePath();
    ctx.fill();
  }

  function drawCharacter(who, anim, index, body, facing, offsetY) {
    const img = sprites[who][anim][index];
    if (!img || !img.complete || !img.naturalWidth) return;
    const w = img.naturalWidth * SPRITE_SCALE;
    const h = img.naturalHeight * SPRITE_SCALE;
    ctx.save();
    ctx.translate(body.x + body.w / 2, offsetY + body.y + body.h);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, 4 * SPRITE_SCALE - h, w, h);
    ctx.restore();
  }

  function playerFrame(p) {
    if (p.dead) return ['death', Math.min(Math.floor(p.deadT * 6), 3)];
    if (p.attackT >= 0) return ['attack', Math.min(Math.floor((p.attackT / ATTACK_TIME) * 4), 3)];
    if (p.landT > 0) return ['jump', 3];
    if (!p.onGround) return ['jump', p.vy < -120 ? 1 : 2];
    if (Math.abs(p.vx) > 1) return ['walk', Math.floor(p.animT * 9) % FRAME_COUNTS.walk];
    return ['walk', 0];
  }

  function enemyFrame(d) {
    if (d.dying) return ['death', Math.min(Math.floor(d.t * 4), 3)];
    if (d.aware && Math.abs(game.player.x - d.x) < 80) {
      return ['attack', Math.floor(d.animT * 8) % FRAME_COUNTS.attack];
    }
    return ['walk', Math.floor(d.animT * 7) % FRAME_COUNTS.walk];
  }

  function drawHud() {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(12, 12, 320, 40);
    ctx.font = 'bold 20px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`♥ ${game.lives}`, 24, 32);
    ctx.fillStyle = '#ffd95a';
    ctx.fillText(`● ${game.score + game.levelCoins}`, 120, 32);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Nivel ${game.levelIndex + 1}/${LEVELS.length}`, 220, 32);
    ctx.font = '16px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(12, H - 36, 560, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('←→ mover · Espacio saltar · J / X morder · P pausa', 22, H - 24);
  }

  function drawOverlay(title, lines) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(title, W / 2, H / 2 - 60);
    ctx.font = '22px system-ui, "Segoe UI", Roboto, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + 0 + i * 34));
    ctx.textAlign = 'left';
  }

  function draw() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawBackground();

    if (game.state === 'loading') {
      drawOverlay('Cargando...', []);
      return;
    }

    const level = game.level;
    const offsetY = H - level.height;
    ctx.save();
    ctx.translate(-Math.round(game.camX), 0);
    drawTiles(level, game.camX, offsetY);
    drawCoins(level, offsetY);
    drawFlag(level, offsetY);
    for (const d of game.enemies) {
      const [anim, idx] = enemyFrame(d);
      drawCharacter('cat', anim, idx, d, d.facing, offsetY);
    }
    const p = game.player;
    const blink = p.invuln > 0 && Math.floor(game.time * 12) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    const [pAnim, pIdx] = playerFrame(p);
    drawCharacter('dog', pAnim, pIdx, p, p.facing, offsetY);
    ctx.globalAlpha = 1;
    ctx.restore();

    drawHud();

    const coinsTotal = game.score + game.levelCoins;
    if (game.state === 'title') {
      drawOverlay('PERRO CALLEJERO', [
        'Enter / Espacio / tocar para jugar',
        '← → o A D: mover   ·   Espacio / W: saltar',
        'J / X: morder   ·   P: pausa',
        'Aplasta a los gatos o muérdelos dos veces',
      ]);
    } else if (game.state === 'paused') {
      drawOverlay('PAUSA', ['P para continuar']);
    } else if (game.state === 'clear') {
      drawOverlay('¡NIVEL COMPLETO!', ['Enter / tocar para el siguiente nivel']);
    } else if (game.state === 'gameover') {
      drawOverlay('GAME OVER', ['Enter / tocar para reintentar']);
    } else if (game.state === 'victory') {
      drawOverlay('¡GANASTE!', [`Monedas: ${coinsTotal}`, 'Enter / tocar para jugar de nuevo']);
    }
  }

  // ---------- Bucle principal ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  game.state = 'loading';
  requestAnimationFrame(frame);
  loadSprites().then(() => {
    startLevel(0);
    game.state = 'title';
  });

  // Acceso de depuración para pruebas automáticas.
  window.__gato = { game, LEVELS, startLevel };
})();
