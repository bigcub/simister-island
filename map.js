/* The map: geometry helpers shared with the simulation, and the SVG drawing of the
   junction for a given point in the works. Map units are metres, x east, y south,
   with the roundabout's middle at 0,0. */
(() => {
  const G = window.GEO;
  const LANE = G.lane;
  const NS = 'http://www.w3.org/2000/svg';

  const pairs = (f) => { const o = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
  const pathD = (pts) => pts.length ? 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') : '';

  // Offset a polyline to its left (positive d) or right, by a constant or per-point amount.
  // Left is the driver's left: the nearside on British roads.
  function offset(pts, d) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let hx = b[0] - a[0], hy = b[1] - a[1];
      const l = Math.hypot(hx, hy) || 1;
      hx /= l; hy /= l;
      const k = typeof d === 'number' ? d : d[i];
      out.push([pts[i][0] + hy * k, pts[i][1] - hx * k]);
    }
    return out;
  }

  function smooth(arr, half) {
    const n = arr.length, out = new Float32Array(n);
    let sum = 0, cnt = 0;
    for (let i = 0; i < Math.min(n, half); i++) { sum += arr[i]; cnt++; }
    for (let i = 0; i < n; i++) {
      if (i + half < n) { sum += arr[i + half]; cnt++; }
      if (i - half - 1 >= 0) { sum -= arr[i - half - 1]; cnt--; }
      out[i] = sum / cnt;
    }
    return out;
  }

  // Resample a route every STEP metres, with its heading, lane count, lane position
  // (smoothed, so lane changes are gradual) and a speed limit from its curvature.
  const STEP = 2.5;
  function resample(key, future) {
    const r = G.routes[key], pts = pairs(r.p);
    const futureLanes = G.future.lanes;
    const xs = [], ys = [], Ls = [], us = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const seg = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.round(seg / STEP));
      const L = (future && futureLanes[r.w[i]]) || r.l[i];
      for (let k = 0; k < n; k++) {
        xs.push(x1 + (x2 - x1) * k / n); ys.push(y1 + (y2 - y1) * k / n);
        Ls.push(L); us.push(r.u[i]);
      }
    }
    xs.push(pts.at(-1)[0]); ys.push(pts.at(-1)[1]); Ls.push(Ls.at(-1)); us.push(us.at(-1));
    const n = xs.length;
    const hx = new Float32Array(n), hy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      const dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1;
      hx[i] = dx / l; hy[i] = dy / l;
    }
    // curvature over about 20 m gives a comfortable cornering speed
    const vlim = new Float32Array(n);
    const W = 4;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - W), b = Math.min(n - 1, i + W);
      let dth = Math.atan2(hy[b], hx[b]) - Math.atan2(hy[a], hx[a]);
      dth = Math.abs(Math.atan2(Math.sin(dth), Math.cos(dth)));
      const R = ((b - a) * STEP) / Math.max(dth, 1e-4);
      vlim[i] = Math.min(31, Math.sqrt(2.4 * R));
    }
    // brake in time for bends ahead
    for (let i = n - 2; i >= 0; i--) vlim[i] = Math.min(vlim[i], Math.sqrt(vlim[i + 1] ** 2 + 2 * 1.6 * STEP));
    return {
      key, n, step: STEP, len: (n - 1) * STEP,
      x: Float32Array.from(xs), y: Float32Array.from(ys), hx, hy,
      L: smooth(Ls, 8), u: smooth(us, 14), vlim,
    };
  }

  // Lane coordinate q (0 = nearside lane) to a lateral offset, positive to the left.
  const laneOffset = (L, q) => ((L - 1) / 2 - q) * LANE;

  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  // ---------- drawing ----------
  const roadsById = new Map(G.roads.filter((r) => r.id).map((r) => [r.id, r]));
  const loopPts = pairs(G.future.loop);
  const LOOP_ID = 'loop';
  const SHOULDER = new Set(G.future.shoulder);
  const CLOSED = new Set(G.future.closed);
  // the M66 southbound slip to the roundabout crosses over the loop on a new bridge
  const OVER_LOOP = 151326555;

  let svg, layers = {};

  function init(svgEl) {
    svg = svgEl;
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('path', { d: 'M0 0V6' }, pat);
    for (const name of ['land', 'streams', 'roads', 'works', 'mw', 'ribbons', 'routeHi', 'labels', 'shields']) {
      layers[name] = el('g', { class: name === 'routeHi' ? 'route-hi' : name }, svg);
    }
    drawLand();
    drawRoads();
    drawLabels();
  }

  function drawLand() {
    const order = ['field', 'grass', 'town', 'works', 'park', 'golf', 'wood', 'water'];
    const byKind = {};
    for (const a of G.land) (byKind[a.k] ||= []).push(a);
    for (const k of order) {
      if (!byKind[k]) continue;
      el('path', { class: 'l-' + k, d: byKind[k].map((a) => pathD(pairs(a.p)) + 'Z').join('') }, layers.land);
    }
    for (const s of G.streams) el('path', { class: 'stream ' + s.k, d: pathD(pairs(s.p)) }, layers.streams);
  }

  function drawRoads() {
    const order = ['minor', 'tertiary', 'secondary', 'primary', 'trunk'];
    for (const pass of ['case', 'top']) {
      for (const c of order) {
        const d = G.roads.filter((r) => r.c === c).map((r) => pathD(pairs(r.p))).join('');
        el('path', { class: (pass === 'case' ? 'r-case ' : '') + 'r-' + c, d }, layers.roads);
      }
    }
  }

  // Motorways, links and the roundabout at their real width, with lane lines.
  // Redrawn when the layout changes (before the scheme, with the loop, finished).
  function drawMotorways(st) {
    const g = layers.mw;
    g.textContent = '';
    const items = [];
    for (const r of G.roads) {
      if (!(r.c === 'mw' || r.c === 'link' || r.c === 'ring')) continue;
      const closed = st.loopOpen && CLOSED.has(r.id);
      const lanes = (st.done && G.future.lanes[r.id]) || r.l;
      const shoulder = st.done && SHOULDER.has(r.id);
      let z = r.z;
      if (st.loopOpen && r.id === OVER_LOOP) z = 2;
      items.push({ pts: pairs(r.p), lanes, shoulder, closed, bridge: r.b, z });
    }
    if (st.loopOpen) items.push({ pts: loopPts, lanes: 2, z: 1, bridge: 1, loop: true });
    const zs = [...new Set(items.map((i) => i.z))].sort((a, b) => a - b);
    for (const z of zs) {
      const lvl = items.filter((i) => i.z === z);
      for (const pass of ['case', 'top', 'lane']) {
        for (const it of lvl) {
          const w = it.lanes * LANE + (it.shoulder ? 3.3 : 0) + 0.8;
          const d = pathD(it.pts);
          if (pass === 'case') {
            el('path', { class: 'case' + (it.bridge ? ' bridge' : '') + (it.closed ? ' closed' : ''), d, style: `stroke-width:calc(${w.toFixed(1)}px + var(--k) * ${it.bridge ? 3.2 : 2}px)` }, g);
          } else if (pass === 'top') {
            el('path', { class: 'top' + (it.closed ? ' closed' : ''), d, 'stroke-width': w.toFixed(1) }, g);
          } else if (!it.closed) {
            const W = w - 0.8, start = -W / 2;
            const lines = [];
            for (let k = 1; k < it.lanes; k++) lines.push(pathD(offset(it.pts, start + k * LANE)));
            if (lines.length) el('path', { class: 'lane', d: lines.join('') }, g);
            if (it.shoulder) el('path', { class: 'shoulder', d: pathD(offset(it.pts, start + it.lanes * LANE)) }, g);
          }
        }
      }
    }
    if (st.loopOpen) {
      // a cross on the closed slip
      for (const id of CLOSED) {
        const r = roadsById.get(id);
        const p = pairs(r.p), m = p[Math.floor(p.length / 2)];
        el('path', { class: 'closed-x', d: `M${m[0] - 6},${m[1] - 6}L${m[0] + 6},${m[1] + 6}M${m[0] + 6},${m[1] - 6}L${m[0] - 6},${m[1] + 6}` }, g);
      }
    }
  }

  // The works: the loop's site, the part of it built so far, and the stretches under traffic management.
  let loopBuilt = null, loopLen = 0;
  function drawWorks(st) {
    const g = layers.works;
    g.textContent = '';
    loopBuilt = null;
    if (!st.works) return;
    // M60 J17 to J18 and the M66 through the junction are under traffic management
    const bands = [1218598437, 197713171, 112188549, 477555979, 1508135141, 522092982, 259187067];
    el('path', { class: 'works-band', d: bands.map((id) => pathD(pairs(roadsById.get(id).p))).join(''), 'stroke-width': 38 }, g);
    if (st.loopOpen) return;
    el('path', { class: 'loop-site', d: pathD(loopPts), 'stroke-width': 30 }, g);
    if (st.loopProgress > 0) {
      loopBuilt = el('path', { class: 'loop-built', d: pathD(loopPts), 'stroke-width': 2 * LANE + 0.8 }, g);
      loopLen = loopBuilt.getTotalLength();
      setLoopProgress(st.loopProgress);
    }
  }
  function setLoopProgress(p) {
    if (!loopBuilt) return;
    // build from both ends towards the middle, as the viaduct and the loop go up together
    const half = (loopLen * p) / 2;
    loopBuilt.style.strokeDasharray = `${half} ${Math.max(0, loopLen - 2 * half)} ${half} 0`;
  }

  // ---------- labels ----------
  // Shields and destinations at the four arms, a fixed screen size: positioned in
  // metres, scaled by metres-per-pixel on every view change.
  const ARMS_AT = { w: 'w-e', s: 's-n', n: 'n-s', e: 'e-w' };
  let shieldEls = [], featureEls = {};
  function pointAt(key, dist) {
    // on the approach: the first half of the route
    const all = pairs(G.routes[key].p), p = all.slice(0, Math.ceil(all.length / 2));
    let best = p[0], bd = Infinity;
    for (const q of p) {
      const d = Math.abs(Math.hypot(q[0], q[1]) - dist);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function drawLabels() {
    const g = layers.labels;
    for (const [name, x, y, kind] of G.areaLabels) {
      el('text', { class: 'area-l' + (kind === 'water' ? ' water' : ''), x, y }, g).textContent = name;
    }
    const big = new Set(['Prestwich', 'Whitefield']);
    for (const [name, x, y] of G.places) {
      el('text', { class: 'place-l' + (big.has(name) ? '' : ' small'), x, y }, g).textContent = name;
    }
    featureEls.loop = el('text', { class: 'feature-l', x: -70, y: -440 }, g);
    featureEls.loop.textContent = 'Northern Loop';
    featureEls.viaduct = el('text', { class: 'feature-l', x: -30, y: -205 }, g);
    featureEls.viaduct.textContent = 'Simister Pike Fold Viaduct';
    const cp = pairs(roadsById.get([...CLOSED][0]).p), cm = cp[Math.floor(cp.length / 2)];
    featureEls.closed = el('text', { class: 'feature-l', x: cm[0] - 10, y: cm[1] + 28 }, g);
    featureEls.closed.textContent = 'Slip closed';
    const arms = window.ARMS;
    for (const [arm, key] of Object.entries(ARMS_AT)) {
      const [x, y] = pointAt(key, 520);
      const sg = el('g', { class: 'shield mw', 'data-x': x, 'data-y': y }, layers.shields);
      el('rect', { x: -19, y: -10, width: 38, height: 20, rx: 4 }, sg);
      el('text', { x: 0, y: 0.5 }, sg).textContent = arms[arm].road;
      const t = el('text', { class: 'dest-l', x: 0, y: 26, 'text-anchor': 'middle' }, sg);
      t.textContent = arms[arm].label;
      shieldEls.push(sg);
    }
  }
  function placeShields(k) {
    for (const sg of shieldEls) sg.setAttribute('transform', `translate(${sg.dataset.x},${sg.dataset.y}) scale(${k})`);
  }

  // ---------- lane colours and the chosen route ----------
  // Ribbons run along each route's lanes near the junction. Routes that share a lane
  // sit side by side as thinner stripes.
  const STRIPE = { 'w-n': -1, 'w-s': 1, 'w-s-2029': 1, 'n-e': -1, 'n-w': 1, 'e-s': -1, 'e-n': 1, 's-w': -1, 's-e': 1 };
  const RIBBON_R = 640;
  function lanePath(R, i0, i1, stripe) {
    const out = [];
    for (let i = i0; i <= i1; i += 2) {
      const L = R.L[i], q = R.u[i] * (L - 1);
      const off = laneOffset(L, q) + stripe * 0.24 * LANE;
      out.push([R.x[i] + R.hy[i] * off, R.y[i] - R.hx[i] * off]);
    }
    return out;
  }
  function drawRibbons(routes, show) {
    const g = layers.ribbons;
    g.textContent = '';
    if (!show) return;
    for (const R of routes) {
      const dest = R.key.split('-')[1];
      let a = 0, b = R.n - 1;
      while (a < b && Math.hypot(R.x[a], R.y[a]) > RIBBON_R) a++;
      while (b > a && Math.hypot(R.x[b], R.y[b]) > RIBBON_R) b--;
      if (b - a < 4) continue;
      const stripe = STRIPE[R.key] || 0;
      const w = stripe ? LANE * 0.42 : LANE * 0.7;
      el('path', { class: 'to-' + dest, 'data-route': R.key, d: pathD(lanePath(R, a, b, stripe)), 'stroke-width': w }, g);
    }
  }
  function highlight(R) {
    const g = layers.routeHi;
    g.textContent = '';
    layers.ribbons.classList.toggle('dim', !!R);
    for (const p of layers.ribbons.children) p.classList.toggle('on', !!R && p.dataset.route === R.key);
    if (!R) return;
    const dest = R.key.split('-')[1];
    const d = pathD(lanePath(R, 0, R.n - 1, 0));
    el('path', { class: 'glow to-' + dest, d }, g);
    el('path', { class: 'line to-' + dest, d }, g);
  }

  function setLabels(st) {
    featureEls.loop.style.display = st.loopProgress > 0 || st.loopOpen ? '' : 'none';
    featureEls.viaduct.style.display = st.loopProgress > 0.3 || st.loopOpen ? '' : 'none';
    featureEls.closed.style.display = st.loopOpen ? '' : 'none';
  }

  window.MAP = { G, LANE, pairs, offset, resample, laneOffset, init, drawMotorways, drawWorks, setLoopProgress, drawRibbons, highlight, placeShields, setLabels, layers: () => layers };
})();
