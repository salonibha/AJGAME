(() => {
const W = 400, H = 600, GROUND = 520, PW = 66, CAP = 26, SPACING = 225;
const GRAV = 0.46, FLAP = -7.4;
const FONT = '"Lilita One", "Arial Rounded MT Bold", "Arial Black", system-ui, sans-serif';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * DPR;
canvas.height = H * DPR;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

try { document.fonts.load('20px "Lilita One"'); } catch (e) {}

const $ = (id) => document.getElementById(id);
const hud = $('hud'), scoreEl = $('score'), readyEl = $('ready'), overEl = $('over');
const fScore = $('fScore'), fBest = $('fBest'), muteBtn = $('mute');

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- state ----------
let state = 'ready';
let t = 0, scroll = 0, shake = 0, overAt = 0, flapKick = 0;
let score = 0, gates = 0, speed = 2.7;
let best = 0;
try { best = parseInt(localStorage.getItem('flappyDinoBest') || '0', 10) || 0; } catch (e) {}
let dino, pillars, particles, floaters;
const clouds = Array.from({ length: 5 }, (_, i) => ({
  x: i * 100 + rand(0, 40), y: rand(40, 220), s: rand(0.7, 1.3), sp: rand(0.12, 0.3)
}));

function reset() {
  dino = { x: 100, y: 270, vy: 0, angle: 0 };
  pillars = []; particles = []; floaters = [];
  score = 0; gates = 0; speed = 2.7;
  scoreEl.textContent = '0';
  spawn(W + 110, GROUND / 2 - 40);
}

function spawn(x, prevGy) {
  const g = Math.max(140, 172 - gates * 1.0);
  const margin = 70;
  const lo = margin + g / 2, hi = GROUND - margin - g / 2;
  const gy = clamp(prevGy + rand(-150, 150), lo, hi);
  pillars.push({
    x, gy, g, seed: Math.floor(Math.random() * 1000), passed: false,
    coin: { dy: rand(-(g / 2 - 34), g / 2 - 34), got: false, ph: rand(0, 6.28) }
  });
}

// ---------- audio ----------
let ac = null, muted = false;
function audio() {
  if (muted) return null;
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch (e) { return null; }
}
function tone(f1, f2, dur, type, vol, delay) {
  const a = audio(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain();
    const t0 = a.currentTime + (delay || 0);
    o.type = type;
    o.frequency.setValueAtTime(f1, t0);
    o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  } catch (e) {}
}
const sfx = {
  flap: () => tone(380, 640, 0.09, 'square', 0.05),
  coin: () => { tone(880, 880, 0.08, 'sine', 0.12); tone(1320, 1320, 0.16, 'sine', 0.12, 0.07); },
  die: () => tone(260, 50, 0.4, 'sawtooth', 0.09)
};

// ---------- input ----------
function flap() {
  if (state === 'ready') {
    state = 'playing';
    readyEl.hidden = true; hud.hidden = false;
    dino.vy = FLAP; flapKick = 1; sfx.flap();
  } else if (state === 'playing') {
    dino.vy = FLAP; flapKick = 1; sfx.flap();
    for (let i = 0; i < 3; i++) {
      particles.push({ x: dino.x - 22, y: dino.y + 10, vx: rand(-1.8, -0.6), vy: rand(0.2, 1.2),
        life: 22, max: 22, r: rand(2.5, 4.5), color: '#f1dca6', grav: 0 });
    }
  } else if (state === 'over' && performance.now() - overAt > 450) {
    reset();
    state = 'playing';
    overEl.hidden = true; hud.hidden = false;
    dino.vy = FLAP; flapKick = 1; sfx.flap();
  }
}
$('frame').addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.closest && e.target.closest('button')) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    if (!e.repeat) flap();
  }
});
muteBtn.addEventListener('click', () => {
  muted = !muted;
  muteBtn.textContent = muted ? 'Sound off' : 'Sound on';
  muteBtn.setAttribute('aria-pressed', String(muted));
});

// ---------- game logic ----------
function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function hitCircles() {
  return [
    { x: dino.x + 1, y: dino.y + 1, r: 13 },
    { x: dino.x + 22, y: dino.y - 12, r: 9 }
  ];
}

function sparks(x, y, n, colors) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2), s = rand(1.5, 4.2);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.8,
      life: 34, max: 34, r: rand(2, 4), color: colors[i % colors.length], grav: 0.12 });
  }
}

function die() {
  state = 'over';
  overAt = performance.now();
  if (!reduceMotion) shake = 12;
  sfx.die();
  sparks(dino.x + 10, dino.y - 4, 16, ['#4fae5a', '#cfe9a8', '#f08a3c']);
  if (score > best) {
    best = score;
    try { localStorage.setItem('flappyDinoBest', String(best)); } catch (e) {}
  }
  fScore.textContent = String(score);
  fBest.textContent = String(best);
  hud.hidden = true;
  overEl.hidden = false;
}

function update(k) {
  t += k;
  for (const c of clouds) {
    c.x -= c.sp * k;
    if (c.x < -90) { c.x = W + 60; c.y = rand(40, 220); }
  }
  flapKick = Math.max(0, flapKick - 0.08 * k);
  shake = Math.max(0, shake - 0.7 * k);

  if (state === 'ready') {
    dino.y = 270 + Math.sin(t * 0.08) * 8;
    dino.angle = Math.sin(t * 0.08) * 0.05;
    scroll += 1.2 * k;
  } else if (state === 'playing') {
    speed = 2.7 + Math.min(gates, 40) * 0.025;
    dino.vy += GRAV * k;
    dino.y += dino.vy * k;
    dino.angle = clamp(dino.vy * 0.06, -0.45, 1.1);
    scroll += speed * k;

    if (dino.y < 18) { dino.y = 18; dino.vy = Math.max(dino.vy, 0); }

    for (const p of pillars) p.x -= speed * k;
    while (pillars[0] && pillars[0].x < -PW - 20) pillars.shift();
    let last = pillars[pillars.length - 1];
    while (last.x < W + 20) {
      spawn(last.x + SPACING, last.gy);
      last = pillars[pillars.length - 1];
    }

    const circles = hitCircles();
    let dead = dino.y + 16 > GROUND;

    for (const p of pillars) {
      if (!p.passed && p.x + PW < dino.x - 24) { p.passed = true; gates++; }
      if (dead) continue;
      const topEnd = p.gy - p.g / 2, botStart = p.gy + p.g / 2;
      for (const c of circles) {
        if (
          circleRect(c.x, c.y, c.r, p.x, -50, PW, topEnd + 50 - CAP) ||
          circleRect(c.x, c.y, c.r, p.x - 4, topEnd - CAP, PW + 8, CAP) ||
          circleRect(c.x, c.y, c.r, p.x, botStart + CAP, PW, GROUND - botStart) ||
          circleRect(c.x, c.y, c.r, p.x - 4, botStart, PW + 8, CAP)
        ) { dead = true; break; }
      }
      if (!p.coin.got) {
        const cx = p.x + PW / 2, cy = p.gy + p.coin.dy;
        for (const c of circles) {
          const d = Math.hypot(c.x - cx, c.y - cy);
          if (d < c.r + 17) {
            p.coin.got = true;
            score++;
            scoreEl.textContent = String(score);
            sfx.coin();
            sparks(cx, cy, 14, ['#ffd84d', '#fff3a8', '#f5b700']);
            floaters.push({ x: cx, y: cy - 10, text: '+1', life: 40 });
            break;
          }
        }
      }
    }
    if (dead) {
      if (dino.y + 16 > GROUND) dino.y = GROUND - 16;
      die();
    }
  } else if (state === 'over') {
    if (dino.y < GROUND - 16) {
      dino.vy += GRAV * k;
      dino.y = Math.min(dino.y + dino.vy * k, GROUND - 16);
    }
    dino.angle += (1.5 - dino.angle) * 0.08 * k;
  }

  for (const q of particles) { q.x += q.vx * k; q.y += q.vy * k; q.vy += q.grav * k; q.life -= k; }
  particles = particles.filter((q) => q.life > 0);
  for (const f of floaters) { f.y -= 0.9 * k; f.life -= k; }
  floaters = floaters.filter((f) => f.life > 0);
}

// ---------- drawing ----------
const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
skyGrad.addColorStop(0, '#5fb6d9');
skyGrad.addColorStop(0.55, '#a7dbe0');
skyGrad.addColorStop(1, '#fbe6b0');

function drawVolcano(x) {
  const base = GROUND, top = GROUND - 205;
  ctx.fillStyle = '#8d6b72';
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x + 105, top + 6);
  ctx.lineTo(x + 128, top);
  ctx.lineTo(x + 152, top + 8);
  ctx.lineTo(x + 175, top - 2);
  ctx.lineTo(x + 205, top + 10);
  ctx.lineTo(x + 300, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + 105, top + 6);
  ctx.lineTo(x + 128, top);
  ctx.lineTo(x + 70, base);
  ctx.lineTo(x + 20, base);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createRadialGradient(x + 152, top + 4, 2, x + 152, top + 4, 34);
  glow.addColorStop(0, 'rgba(255,150,60,0.95)');
  glow.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x + 110, top - 34, 90, 70);
  ctx.fillStyle = '#ff9a40';
  ctx.beginPath();
  ctx.ellipse(x + 152, top + 4, 24, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const ph = ((t * 0.35 + i * 30) % 120);
    ctx.fillStyle = 'rgba(120,100,110,' + (0.4 * (1 - ph / 120)) + ')';
    ctx.beginPath();
    ctx.arc(x + 152 + Math.sin(ph * 0.08 + i) * 10, top - ph, 9 + ph * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBackground() {
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  const sg = ctx.createRadialGradient(310, 120, 5, 310, 120, 90);
  sg.addColorStop(0, 'rgba(255,248,210,0.9)');
  sg.addColorStop(0.35, 'rgba(255,244,200,0.35)');
  sg.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(210, 20, 200, 200);
  ctx.fillStyle = '#fff6c6';
  ctx.beginPath(); ctx.arc(310, 120, 28, 0, Math.PI * 2); ctx.fill();

  for (const c of clouds) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 34 * c.s, 13 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - 20 * c.s, c.y + 5 * c.s, 22 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 22 * c.s, c.y + 4 * c.s, 24 * c.s, 11 * c.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const vx = -((scroll * 0.12) % 560);
  drawVolcano(vx);
  drawVolcano(vx + 560);

  const hx = (scroll * 0.3) % 400;
  ctx.fillStyle = '#86b98f';
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  for (let x = 0; x <= W; x += 10) {
    ctx.lineTo(x, GROUND - 52 + Math.sin((x + hx) * 0.016) * 14 + Math.sin((x + hx) * 0.041) * 6);
  }
  ctx.lineTo(W, GROUND);
  ctx.closePath();
  ctx.fill();
}

function stone(x, y, w, h, seed) {
  if (h <= 0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#5e4f4b'); g.addColorStop(0.35, '#85726a'); g.addColorStop(1, '#4d413e');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(30,22,20,0.35)';
  ctx.lineWidth = 2;
  for (let yy = y + ((seed * 7) % 30); yy < y + h; yy += 34) {
    if (yy < -10 || yy > H) continue;
    const len = 14 + ((Math.floor(yy) * 3 + seed) % 24);
    ctx.beginPath();
    ctx.moveTo(x + 6, yy);
    ctx.lineTo(x + 6 + len * 0.5, yy + 3);
    ctx.lineTo(x + 6 + len, yy + 1);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#3a2e2b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, y + h);
  ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h);
  ctx.stroke();
}

function cap(x, y, kind) {
  const g = ctx.createLinearGradient(x - 4, 0, x + PW + 4, 0);
  g.addColorStop(0, '#78655d'); g.addColorStop(0.4, '#a08b7e'); g.addColorStop(1, '#66554f');
  ctx.fillStyle = g;
  ctx.fillRect(x - 4, y, PW + 8, CAP);
  ctx.strokeStyle = '#3a2e2b';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x - 4, y, PW + 8, CAP);
  ctx.fillStyle = '#78b05c';
  if (kind === 'top') {
    const e = y + CAP;
    ctx.fillRect(x - 4, e - 6, PW + 8, 6);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x + 4 + i * 12, e, 3.5 + (i % 3) * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillRect(x - 4, y, PW + 8, 6);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x + 4 + i * 12, y, 3 + ((i + 1) % 3) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPillar(p) {
  const topEnd = p.gy - p.g / 2, botStart = p.gy + p.g / 2;
  stone(p.x, -40, PW, topEnd - CAP + 40, p.seed);
  cap(p.x, topEnd - CAP, 'top');
  stone(p.x, botStart + CAP, PW, GROUND - botStart - CAP + 6, p.seed + 5);
  cap(p.x, botStart, 'bottom');
}

function drawCoin(cx, cy, ph) {
  const sx = 0.8 + 0.2 * Math.cos(t * 0.07 + ph);
  const bob = Math.sin(t * 0.06 + ph) * 3;
  ctx.save();
  ctx.translate(cx, cy + bob);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 32);
  glow.addColorStop(0, 'rgba(255,214,60,0.45)');
  glow.addColorStop(1, 'rgba(255,214,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-34, -34, 68, 68);
  ctx.scale(sx, 1);
  ctx.fillStyle = '#d38b00';
  ctx.beginPath(); ctx.arc(0, 0, 17.5, 0, Math.PI * 2); ctx.fill();
  const inner = ctx.createRadialGradient(-5, -6, 2, 0, 0, 16);
  inner.addColorStop(0, '#fff09a'); inner.addColorStop(0.7, '#f7bd10'); inner.addColorStop(1, '#e8a200');
  ctx.fillStyle = inner;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c98400';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '15px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,244,180,0.95)';
  ctx.fillText('AJ', 0.8, 1.6);
  ctx.fillStyle = '#7a4600';
  ctx.fillText('AJ', 0, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 13.5, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
  ctx.restore();
}

function drawGround() {
  ctx.fillStyle = '#e6c27d';
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#6f9f45';
  ctx.fillRect(0, GROUND, W, 12);
  ctx.fillStyle = '#4f7a31';
  ctx.fillRect(0, GROUND + 12, W, 3);
  for (let i = -1; i < 9; i++) {
    const x = i * 56 - (scroll % 56);
    ctx.fillStyle = '#5c8c38';
    ctx.beginPath();
    ctx.moveTo(x, GROUND);
    ctx.lineTo(x + 5, GROUND - 11);
    ctx.lineTo(x + 10, GROUND);
    ctx.lineTo(x + 15, GROUND - 8);
    ctx.lineTo(x + 20, GROUND);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#d3a95f';
  for (let i = -1; i < 12; i++) {
    const x = i * 40 - (scroll % 40);
    ctx.beginPath();
    ctx.ellipse(x + 8, GROUND + 32 + ((i * 7 % 3 + 3) % 3) * 14, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDino() {
  const d = dino;
  const OUT = '#1d4a28', GREEN = '#4fae5a', DARK = '#3a9448', BELLY = '#d3eaa9', SPIKE = '#f08a3c';
  const wag = Math.sin(t * 0.25) * (state === 'playing' ? 4 : 2);
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.angle);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUT;

  // tail
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.moveTo(-12, -4);
  ctx.quadraticCurveTo(-30, -6 + wag, -44, 6 + wag * 1.4);
  ctx.quadraticCurveTo(-28, 16, -10, 12);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // back leg
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.ellipse(-5 - flapKick * 5, 15 + flapKick * 3, 8, 5.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // spikes
  ctx.fillStyle = SPIKE;
  for (const sx of [-12, -4, 4, 11]) {
    const yb = -15 * Math.sqrt(1 - (sx / 20) * (sx / 20));
    ctx.beginPath();
    ctx.moveTo(sx - 4.5, yb + 3);
    ctx.lineTo(sx, yb - 9);
    ctx.lineTo(sx + 4.5, yb + 3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // body
  ctx.fillStyle = GREEN;
  ctx.beginPath(); ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = BELLY;
  ctx.beginPath(); ctx.ellipse(3, 6, 12, 7, 0, 0, Math.PI * 2); ctx.fill();

  // head + snout (unified outline)
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(19, -15, 15, 12, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(31, -11, 9, 7, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = GREEN;
  ctx.beginPath(); ctx.ellipse(19, -15, 15, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(31, -11, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5;

  // eye
  if (state === 'over') {
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18.5, -23); ctx.lineTo(26.5, -15);
    ctx.moveTo(26.5, -23); ctx.lineTo(18.5, -15);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(22.5, -19, 5.3, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath(); ctx.arc(24.2, -18.8, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(25, -19.8, 0.9, 0, Math.PI * 2); ctx.fill();
  }

  // nostril + mouth
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.arc(36, -14, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath();
  if (state === 'over') {
    ctx.moveTo(25, -5); ctx.quadraticCurveTo(31, -9, 37, -6);
  } else {
    ctx.moveTo(25, -7); ctx.quadraticCurveTo(31, -3, 37, -8);
  }
  ctx.stroke();

  // tiny arm
  ctx.lineWidth = 2.2;
  ctx.fillStyle = GREEN;
  ctx.beginPath(); ctx.ellipse(13, 3 - flapKick * 4, 5.5, 3, -0.3 - flapKick * 0.6, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // front leg
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.ellipse(8 + flapKick * 4, 16 + flapKick * 3, 8, 5.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.color;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life / 20, 0, 1);
    ctx.font = '22px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#3a2a1a';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = '#ffe36b';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  drawBackground();
  for (const p of pillars) drawPillar(p);
  for (const p of pillars) {
    if (!p.coin.got) drawCoin(p.x + PW / 2, p.gy + p.coin.dy, p.coin.ph);
  }
  drawGround();
  drawParticles();
  drawDino();
  ctx.restore();
}

// ---------- loop ----------
reset();
let last = performance.now();
function frame(now) {
  const k = Math.min((now - last) / 16.667, 2.5);
  last = now;
  update(k);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
