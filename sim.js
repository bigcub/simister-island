/* The traffic simulation. Cars follow the routes from map.js lane by lane, keep their
   distance with a simple car-following model, and obey the roundabout's signals.
   Drawn on a canvas laid over the map. Demand is made up, not counted. */
(() => {
  const { resample, laneOffset, LANE } = window.MAP;

  // Vehicles a second from each arm at "Busy", and where they go. Illustrative only.
  const DEMAND = { w: 0.42, e: 0.42, n: 0.3, s: 0.3 };
  const SPLIT = {
    w: { e: 0.5, s: 0.35, n: 0.15 },
    e: { w: 0.55, s: 0.2, n: 0.25 },
    n: { s: 0.45, w: 0.35, e: 0.2 },
    s: { n: 0.35, w: 0.45, e: 0.2 },
  };
  const KIND = Object.fromEntries(window.MOVES.map((m) => [m.id, m.kind]));
  KIND['w-s-2029'] = 'loop';

  // The roundabout's arms clockwise, and its signals: an entry stop line on each
  // approach (e) and a stop line on the circulating carriageway just before each
  // entry (c). Two stages: W and E enter while N and S traffic circulates, then swap.
  const ARMS = ['w', 'n', 'e', 's'];
  const GREEN = 16, AMBER = 3, ALLRED = 2;
  const CYCLE = 2 * (GREEN + AMBER + ALLRED);
  function signal(group, t) {
    const c = t % CYCLE, half = GREEN + AMBER + ALLRED;
    const stage = c < half ? 0 : 1, local = c - stage * half;
    const arm = group[1];
    const entryStage = arm === 'w' || arm === 'e' ? 0 : 1;
    const greenStage = group[0] === 'e' ? entryStage : 1 - entryStage;
    if (stage !== greenStage) return 'red';
    return local < GREEN ? 'green' : local < GREEN + AMBER ? 'amber' : 'red';
  }

  const IDM = { a: 1.5, b: 2.2, s0: 2.2, T: 1.1 };
  const CAR_L = 4.6, CAR_W = 1.9;

  let routes = {}, active = {}, cars = [], nextId = 1, simT = 0, level = 1;
  let state = null, speedCap = 31, colours = {};
  const pending = {}, accum = { w: 0, e: 0, n: 0, s: 0 };
  const times = { old: [], new: [] };
  let selected = null, followCar = null;
  let signalHeads = [];

  function routeFor(o, d) {
    const k = o + '-' + d;
    if (k === 'w-s' && state.loopOpen) return active['w-s-2029'];
    return active[k];
  }

  // Signal stop lines along a roundabout route: where it passes each arm's entry point.
  const ARC_START = { WN: 'w', NE: 'n', ES: 'e', SW: 's' };
  const armPts = Object.fromEntries(Object.entries(ARC_START).map(([k, arm]) => [arm, [window.GEO.arcs[k][0], window.GEO.arcs[k][1]]]));
  function stopsFor(R) {
    if (KIND[R.key] !== 'island') return [];
    const o = R.key[0], i0 = ARMS.indexOf(o);
    const plan = [['e' + o, 7], ['c' + ARMS[(i0 + 1) % 4], 12], ['c' + ARMS[(i0 + 2) % 4], 12]];
    const out = [];
    for (const [group, back] of plan) {
      const [ax, ay] = armPts[group[1]];
      let best = -1, bd = 1e9;
      for (let i = 0; i < R.n; i++) {
        const d = Math.hypot(R.x[i] - ax, R.y[i] - ay);
        if (d < bd) { bd = d; best = i; }
      }
      out.push({ group, s: best * R.step - back });
    }
    return out.sort((a, b) => a.s - b.s);
  }

  function setState(st) {
    const layoutKey = (st.done ? 'f' : 'p');
    state = st;
    // build (or reuse) the resampled routes for this layout
    if (!routes[layoutKey]) {
      routes[layoutKey] = {};
      for (const key of Object.keys(window.GEO.routes)) {
        const R = resample(key, st.done);
        R.stops = stopsFor(R);
        R.kind = KIND[key];
        routes[layoutKey][key] = R;
      }
    }
    active = routes[layoutKey];
    // signal heads, one per group, drawn at the nearside of the stop line
    signalHeads = [];
    const seen = new Set();
    for (const R of Object.values(active)) {
      for (const st2 of R.stops) {
        if (seen.has(st2.group)) continue;
        seen.add(st2.group);
        const i = Math.max(0, Math.min(R.n - 1, Math.round(st2.s / R.step)));
        const off = (R.L[i] / 2) * LANE + 1.6;
        signalHeads.push({ group: st2.group, x: R.x[i] + R.hy[i] * off, y: R.y[i] - R.hx[i] * off });
      }
    }
  }

  function activeRoutes() {
    return Object.values(active).filter((R) => R.key !== (state.loopOpen ? 'w-s' : 'w-s-2029'));
  }

  // ---------- spawning ----------
  function pickDest(o) {
    let r = Math.random(), acc = 0;
    for (const [d, p] of Object.entries(SPLIT[o])) { acc += p; if (r < acc) return d; }
    return Object.keys(SPLIT[o])[0];
  }
  function laneJitter(kind) {
    const opts = kind === 'through' ? [-1.2, -0.6, 0, 0.4] : kind === 'island' ? [-0.5, 0, 0.45] : [-0.3, 0, 0.3];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  function trySpawn(R) {
    const dl = laneJitter(R.kind);
    const L = R.L[0], q = Math.max(0, Math.min(L - 1, R.u[0] * (L - 1) + dl));
    const off = laneOffset(L, q);
    const x = R.x[0] + R.hy[0] * off, y = R.y[0] - R.hx[0] * off;
    for (const c of cars) {
      if (Math.abs(c.x - x) < 16 && Math.abs(c.y - y) < 16 && Math.hypot(c.x - x, c.y - y) < 15) return false;
    }
    cars.push({ id: nextId++, R, s: 0, v: Math.min(R.vlim[0], speedCap) * 0.85, dl, lat: off, x, y, hx: R.hx[0], hy: R.hy[0],
      dest: R.key.split('-')[1], born: simT, braking: false });
    return true;
  }

  function spawn(dt) {
    for (const o of ARMS) {
      accum[o] += DEMAND[o] * level * dt;
      while (accum[o] >= 1) {
        accum[o] -= 1;
        if (Math.random() < 0.08) continue; // a little irregularity
        const R = routeFor(o, pickDest(o));
        if (!R) continue;
        (pending[R.key] ||= []).push(R);
      }
    }
    for (const k in pending) {
      const q = pending[k];
      if (q.length > 40) q.length = 40;
      if (q.length && trySpawn(q[0])) q.shift();
    }
  }

  // ---------- moving ----------
  const CELL = 14;
  let grid = new Map();
  function rebuildGrid() {
    grid = new Map();
    for (const c of cars) {
      const k = Math.floor(c.x / CELL) * 100003 + Math.floor(c.y / CELL);
      let b = grid.get(k);
      if (!b) grid.set(k, (b = []));
      b.push(c);
    }
  }
  function findLeader(c) {
    const ax = c.x + c.hx * 22, ay = c.y + c.hy * 22;
    const gx = Math.floor(ax / CELL), gy = Math.floor(ay / CELL);
    let best = null, bestGap = 46;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const b = grid.get((gx + i) * 100003 + gy + j);
      if (!b) continue;
      for (const o of b) {
        if (o === c) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        const along = dx * c.hx + dy * c.hy;
        if (along <= 0.5 || along > bestGap + CAR_L) continue;
        if (Math.abs(dx * c.hy - dy * c.hx) > 1.8) continue;
        if (o.hx * c.hx + o.hy * c.hy < 0.3) continue;
        const gap = along - CAR_L;
        if (gap < bestGap) { bestGap = gap; best = o; }
      }
    }
    return best ? { car: best, gap: Math.max(0.1, bestGap) } : null;
  }

  function idmAcc(v, v0, gap, vl) {
    const ss = IDM.s0 + v * IDM.T + (v * (v - vl)) / (2 * Math.sqrt(IDM.a * IDM.b));
    return IDM.a * (1 - Math.pow(v / Math.max(v0, 0.1), 4) - (gap === Infinity ? 0 : (Math.max(ss, 0) / gap) ** 2));
  }

  function step(dt) {
    simT += dt;
    spawn(dt);
    rebuildGrid();
    for (const c of cars) c.lead = findLeader(c);
    // two cars that each think the other is ahead (side by side at a merge): the older one goes
    for (const c of cars) if (c.lead && c.lead.car.lead && c.lead.car.lead.car === c && c.id < c.lead.car.id) c.lead = null;

    const done = [];
    for (const c of cars) {
      const R = c.R;
      const i = Math.min(R.n - 1, Math.floor(c.s / R.step));
      const ahead = Math.min(R.n - 1, i + Math.round(c.v * 1.5 / R.step));
      const v0 = Math.min(R.vlim[ahead], speedCap);
      let gap = Infinity, vl = 0;
      if (c.lead) { gap = c.lead.gap; vl = c.lead.car.v; }
      for (const stp of R.stops) {
        const d = stp.s - c.s;
        if (d < -1 || d > 120) continue;
        const sig = signal(stp.group, simT);
        if (sig === 'green') continue;
        if (sig === 'amber' && d < (c.v * c.v) / (2 * 3.5)) continue; // too close to stop: go on
        if (d < 0) continue;
        if (d < gap) { gap = Math.max(0.1, d); vl = 0; }
      }
      let a = idmAcc(c.v, v0, gap, vl);
      a = Math.max(-9, Math.min(IDM.a, a));
      c.braking = a < -1.2;
      c.v = Math.max(0, c.v + a * dt);
      c.s += c.v * dt;
      if (c.s >= R.len) { done.push(c); continue; }
      // position, with a lateral offset that eases towards the car's lane
      const j = Math.min(R.n - 2, Math.floor(c.s / R.step)), f = c.s / R.step - j;
      const L = R.L[j], q = Math.max(0, Math.min(L - 1, R.u[j] * (L - 1) + c.dl));
      const target = laneOffset(L, q);
      const maxLat = 1.1 * dt + 0.02 * c.v * dt;
      c.lat += Math.max(-maxLat, Math.min(maxLat, target - c.lat));
      const hx = R.hx[j] + (R.hx[j + 1] - R.hx[j]) * f, hy = R.hy[j] + (R.hy[j + 1] - R.hy[j]) * f;
      const hl = Math.hypot(hx, hy) || 1;
      c.hx = hx / hl; c.hy = hy / hl;
      const cx = R.x[j] + (R.x[j + 1] - R.x[j]) * f, cy = R.y[j] + (R.y[j + 1] - R.y[j]) * f;
      c.x = cx + c.hy * c.lat; c.y = cy - c.hx * c.lat;
    }
    if (done.length) {
      const gone = new Set(done);
      for (const c of done) {
        if (c.R.key === 'w-s') record('old', simT - c.born);
        if (c.R.key === 'w-s-2029') record('new', simT - c.born);
        if (followCar === c) followCar = null;
      }
      cars = cars.filter((c) => !gone.has(c));
    }
  }

  function record(which, t) {
    const a = times[which];
    a.push(t);
    if (a.length > 25) a.shift();
  }

  // The journey time is measured over the whole route (about 3 km from J17's side to
  // J19's side for the old way, 4 km with the loop), so it is comparable between the two.
  function average(which) {
    const a = times[which];
    return a.length >= 3 ? a.reduce((x, y) => x + y, 0) / a.length : null;
  }

  // ---------- drawing ----------
  function readColours() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['w', 's', 'n', 'e']) colours[k] = cs.getPropertyValue('--to-' + k).trim();
    colours.ink = cs.getPropertyValue('--mw-case').trim();
    colours.card = cs.getPropertyValue('--card').trim();
    colours.gold = cs.getPropertyValue('--gold').trim();
  }

  function draw(ctx, view, W, H, dpr) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W * dpr, H * dpr);
    const s = view.s * dpr;
    const ox = (W / 2) * dpr - view.cx * s, oy = (H / 2) * dpr - view.cy * s;
    ctx.setTransform(s, 0, 0, s, ox, oy);
    const k = 1 / view.s; // metres per css pixel
    const minLen = 5.5 * k, minWid = 2.6 * k;
    const len = Math.max(CAR_L, minLen), wid = Math.max(CAR_W, minWid);
    const x0 = view.cx - (W / 2) * k - 10, x1 = view.cx + (W / 2) * k + 10;
    const y0 = view.cy - (H / 2) * k - 10, y1 = view.cy + (H / 2) * k + 10;

    for (const c of cars) {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      const dim = selected && c.R.key !== selected;
      ctx.globalAlpha = dim ? 0.28 : 1;
      ctx.setTransform(s * c.hx, s * c.hy, -s * c.hy, s * c.hx, ox + c.x * s, oy + c.y * s);
      ctx.fillStyle = colours[c.dest];
      ctx.beginPath();
      ctx.roundRect(-len / 2, -wid / 2, len, wid, Math.min(wid / 2, 0.7 * Math.max(1, k)));
      ctx.fill();
      ctx.lineWidth = Math.max(0.25, 0.7 * k);
      ctx.strokeStyle = colours.ink;
      ctx.stroke();
      if (c.braking && view.s > 1.2) {
        ctx.fillStyle = '#ff4a3a';
        ctx.fillRect(-len / 2 - 0.1, -wid / 2 + 0.15, 0.45, wid - 0.3);
      }
      if (c === followCar) {
        ctx.lineWidth = 2.2 * k;
        ctx.strokeStyle = colours.gold;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(len, 9 * k), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(s, 0, 0, s, ox, oy);
    // signal heads
    const r = Math.max(1.3, 3.4 * k);
    for (const h of signalHeads) {
      const sig = signal(h.group, simT);
      ctx.fillStyle = colours.ink;
      ctx.beginPath(); ctx.arc(h.x, h.y, r * 1.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sig === 'green' ? '#3fbf6a' : sig === 'amber' ? '#f2b33d' : '#e8453c';
      ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function pick(x, y, k) {
    let best = null, bd = Math.max(8, 14 * k);
    for (const c of cars) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function warm(seconds) {
    for (let t = 0; t < seconds; t += 0.1) step(0.1);
  }

  window.SIM = {
    setState, step, draw, pick, warm, readColours, activeRoutes, average,
    setLevel: (l) => { level = l; },
    select: (key) => { selected = key; },
    follow: (c) => { followCar = c; },
    following: () => followCar,
    route: (key) => active[key],
    count: () => cars.length,
    reset: () => { cars = []; for (const k in pending) pending[k].length = 0; },
  };
})();
