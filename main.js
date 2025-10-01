(() => {
  'use strict';

  // ---------- CSS Var -----------
  const root = document.documentElement;
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  function parseColor(str){
    if (str.startsWith('#')) {
      const v = str.slice(1);
      const n = v.length === 3
        ? v.split('').map(x => parseInt(x+x,16))
        : [v.slice(0,2), v.slice(2,4), v.slice(4,6)].map(x => parseInt(x,16));
      return n;
    }
    const m = str.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return m ? [ +m[1], +m[2], +m[3] ] : [155,120,220];
  }

  let MAIN_COLOR = parseColor(cssVar('--main-color'));
  let EDGE = `rgba(${MAIN_COLOR[0]}, ${MAIN_COLOR[1]}, ${MAIN_COLOR[2]}, 0.5)`;

  window.addEventListener('main-color-changed', () => {
    MAIN_COLOR = parseColor(cssVar('--main-color'));
    EDGE = `rgba(${MAIN_COLOR[0]}, ${MAIN_COLOR[1]}, ${MAIN_COLOR[2]}, 0.5)`;
    render();
  });

  // ---------- Canvas setup ----------
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  let W = 0, H = 0, MIN = 0;
  let SCALE = 0.7;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;

    W = Math.floor(w * DPR);
    H = Math.floor(h * DPR);
    MIN = Math.min(W, H);

    SCALE = (window.innerWidth <= 768) ? 0.9 : 0.7;
    render();
  }
  window.addEventListener('resize', resize);

  // ---------- 3D math ----------
  const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const muls = (a, s) => V(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => V(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
  const len = a => Math.hypot(a.x, a.y, a.z);
  const norm = a => { const l = len(a) || 1; return V(a.x / l, a.y / l, a.z / l); };

  // Quaternions
  const Q = (x = 0, y = 0, z = 0, w = 1) => ({ x, y, z, w });
  const qMul = (a, b) => Q(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  );
  const qFromAxisAngle = (axis, ang) => {
    axis = norm(axis);
    const s = Math.sin(ang / 2);
    return Q(axis.x * s, axis.y * s, axis.z * s, Math.cos(ang / 2));
  };
  const qFromTo = (a, b) => {
    a = norm(a); b = norm(b);
    const c = cross(a, b);
    const d = dot(a, b);
    if (d < -0.999999) {
      const ax = Math.abs(a.x) > 0.9 ? V(0, 1, 0) : V(1, 0, 0);
      return qFromAxisAngle(ax, Math.PI);
    }
    const s = Math.sqrt((1 + d) * 2);
    return Q(c.x / s, c.y / s, c.z / s, s / 2);
  };
  const qRotate = (q, v) => {
    const t = qMul(q, Q(v.x, v.y, v.z, 0));
    const r = qMul(t, Q(-q.x, -q.y, -q.z, q.w));
    return V(r.x, r.y, r.z);
  };
  const qSlerp = (a, b, t) => {
    let ch = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
    if (ch < 0) { b = Q(-b.x, -b.y, -b.z, -b.w); ch = -ch; }
    if (ch > 0.9995) {
      return Q(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
        a.w + (b.w - a.w) * t
      );
    }
    const half = Math.acos(ch);
    const sinH = Math.sqrt(1 - ch * ch);
    const ra = Math.sin((1 - t) * half) / sinH;
    const rb = Math.sin(t * half) / sinH;
    return Q(a.x * ra + b.x * rb, a.y * ra + b.y * rb, a.z * ra + b.z * rb, a.w * ra + b.w * rb);
  };

  // ---------- D20 geometry ----------
  const PHI = (1 + Math.sqrt(5)) / 2;
  const verts = [
    V(-1, PHI, 0), V(1, PHI, 0), V(-1, -PHI, 0), V(1, -PHI, 0),
    V(0, -1, PHI), V(0, 1, PHI), V(0, -1, -PHI), V(0, 1, -PHI),
    V(PHI, 0, -1), V(PHI, 0, 1), V(-PHI, 0, -1), V(-PHI, 0, 1)
  ].map(v => muls(norm(v), 1));

  const faces = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]
  ];

  const faceNumbers = Array.from({ length: 20 }, (_, i) => i + 1);

  const faceData = faces.map(idx => {
    const a = verts[idx[0]], b = verts[idx[1]], c = verts[idx[2]];
    const n = norm(cross(sub(b, a), sub(c, a)));
    const center = muls(add(add(a, b), c), 1 / 3);
    return { idx, n, center };
  });

  // Lighting
  const light = norm(V(-0.6, 0.8, 0.5));

  // ---------- Projection ----------
  function project(v) {
    const z = v.z + 3.5;
    const p = 1.0 / z;
    return { x: W / 2 + v.x * p * MIN * SCALE, y: H / 2 + v.y * p * MIN * SCALE, z };
  }

  // ---------- Render ----------
  let orientation = Q();

  function render() {
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.45, MIN * 0.05, W * 0.5, H * 0.45, MIN * 0.6);
    vg.addColorStop(0, '#0000');
    vg.addColorStop(1, '#0007');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    const tv = verts.map(v => qRotate(orientation, v));

    const items = faceData.map((f, i) => {
      const a = tv[f.idx[0]], b = tv[f.idx[1]], c = tv[f.idx[2]];
      const center = muls(add(add(a, b), c), 1 / 3);
      const n = norm(cross(sub(b, a), sub(c, a)));
      const depth = (a.z + b.z + c.z) / 3;
      return { i, a, b, c, center, n, depth };
    }).sort((x, y) => x.depth - y.depth);

    items.forEach(it => {
      if (dot(it.n, V(0, 0, 1)) <= 0) return;

      const pa = project(it.a), pb = project(it.b), pc = project(it.c);

      const nl = Math.max(0, dot(norm(it.n), light));
      let brightness = 0.35 + 0.65 * nl;
      brightness = Math.min(1, Math.max(0.35, brightness));

      const base = MAIN_COLOR;
      const col  = base.map(v => Math.min(255, Math.floor(v * brightness)));

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineTo(pc.x, pc.y);
      ctx.closePath();

      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.fill();

      ctx.strokeStyle = EDGE;
      ctx.lineWidth   = 1.2 * DPR;
      ctx.stroke();

      const pcen = project(it.center);
      const nIdx = faceNumbers[it.i];
      const lum  = 0.30 + 0.70 * nl;

      if (lum > 0.20) {
        ctx.save();
        ctx.translate(pcen.x, pcen.y);

        const fs = Math.max(12, (MIN / DPR) * 0.024) * DPR;
        ctx.font = `${fs}px Cinzel, Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let fill = '#ffffff';
        if (lum <= 0.35) fill = '#6e7380';
        else if (lum <= 0.58) fill = '#b7bcc8';

        ctx.fillStyle = fill;
        ctx.fillText(nIdx, 0, 1);

        ctx.lineWidth = 0.7 * DPR;
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.strokeText(nIdx, 0, 1);

        ctx.restore();
      }
    });

    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 1 * DPR;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, MIN * 0.30, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---------- Helpers ----------
  function targetQuaternionForFace(i) {
    const n = faceData[i].n;
    const toCam = qFromTo(n, V(0, 0, 1));
    const spin  = qFromAxisAngle(V(0, 0, 1), Math.PI * 2 * Math.random());
    return qMul(spin, toCam);
  }

  // ---------- Crit UI ----------
  const bigEl  = document.getElementById('big');
  const critEl = document.getElementById('crit');

  function showCrit(text, cls) {
    critEl.textContent = text;
    critEl.className   = `ribbon show ${cls}`;
    bigEl.classList.add('pulse');
    const hint = document.querySelector('.hint');
    if (hint) hint.style.opacity = 0.25;
  }
  function clearCrit() {
    critEl.className = 'ribbon';
    bigEl.classList.remove('pulse');
    const hint = document.querySelector('.hint');
    if (hint) hint.style.opacity = 0.8;
  }

  // ---------- Roll ----------
  let anim = null;

  function roll() {
    if (anim) return;

    clearCrit();
    bigEl.classList.remove('show');

    const outcome = 1 + Math.floor(Math.random() * 20);
    const faceIdx = outcome - 1;

    const qTarget = targetQuaternionForFace(faceIdx);
    const qStart  = qMul(
      qFromAxisAngle(V(1, 0, 0), Math.random() * Math.PI * 2),
      qFromAxisAngle(V(0, 1, 0), Math.random() * Math.PI * 2),
    );

    const dur       = 5000;
    const spinAxis  = norm(V(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5));
    const spinTotal = Math.PI * 14;
    const t0 = performance.now();

    function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

    anim = function step(now) {
      let t = (now - t0) / dur;
      if (t > 1) t = 1;

      const e    = easeOutCubic(t);
      const spin = qFromAxisAngle(spinAxis, (1 - e) * spinTotal);

      orientation = qMul(qSlerp(qStart, qTarget, e), spin);
      render();

      if (t < 1) requestAnimationFrame(step);
      else {
        anim = null;
        finalize();
      }
    };

    requestAnimationFrame(anim);

    function finalize() {
      orientation = targetQuaternionForFace(faceIdx);
      render();

      bigEl.textContent = outcome;
      bigEl.classList.add('show');

      if (outcome === 20) showCrit('Критический успех', 'crit-success');
      else if (outcome === 1) showCrit('Критический провал', 'crit-fail');
    }
  }

  // ---------- Init ----------
  const wrap = document.querySelector('.wrap');

  orientation = targetQuaternionForFace(19);

  function kickoff() {
    resize();
    requestAnimationFrame(() => requestAnimationFrame(resize));
  }

  if (document.readyState === 'complete') kickoff();
  else window.addEventListener('load', kickoff);

  document.fonts?.ready.then(() => requestAnimationFrame(resize));

  window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(resize));
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  window.addEventListener('pageshow', (e) => { if (e.persisted) resize(); });

  new ResizeObserver(() => requestAnimationFrame(resize)).observe(wrap);

  bigEl.textContent = 20;
  bigEl.classList.add('show');

  const btn = document.getElementById('btn');
  btn.addEventListener('click', roll);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); roll(); }, { passive: false });
  document.addEventListener('keydown', (e) => { if (e.code === 'Space') roll(); });
})();
