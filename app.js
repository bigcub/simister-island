/* The page: the view (pan and zoom), the works timeline, the panel, and the loop that
   runs the simulation and draws it. */
(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), svg = $('map'), canvas = $('cars'), ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = window.PHASES;

  MAP.init(svg);
  SIM.readColours();

  // ---------- the date and what it means for the layout ----------
  function stateAt(t) {
    return {
      t,
      works: t >= P.worksStart && t < P.open,
      loopProgress: Math.max(0, Math.min(1, (t - P.loopBuildStart) / (P.loopSwitch - P.loopBuildStart))),
      loopOpen: t >= P.loopSwitch,
      done: t >= P.open,
    };
  }
  const layoutKey = (st) => `${st.works}|${st.loopOpen}|${st.done}|${st.loopProgress > 0}`;
  let st = null, lastKey = '';
  let lanesOn = true, selectedKey = null;

  function setDate(t, fromSlider) {
    st = stateAt(t);
    const key = layoutKey(st);
    if (key !== lastKey) {
      lastKey = key;
      MAP.drawMotorways(st);
      MAP.drawWorks(st);
      SIM.setState(st);
      redrawRibbons();
    }
    MAP.setLoopProgress(st.loopProgress);
    MAP.setLabels(st);
    if (!fromSlider) $('tl').value = t;
    renderWhen(t);
    renderMoves();
    markEvents(t);
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function renderWhen(t) {
    const y = Math.floor(t), m = Math.min(11, Math.floor((t - y) * 12));
    $('tl-when').textContent = `${MONTHS[m]} ${y}`;
    let what;
    if (t < P.worksStart) what = 'Before the works: the roundabout carries M60 traffic';
    else if (st.done) what = 'The new layout: the Northern Loop open, five lanes J17 to J18';
    else {
      const past = window.TIMELINE.filter((e) => e.t <= t + 0.005).at(-1);
      what = st.loopOpen ? 'The Northern Loop is open; finishing works' : past ? past.title : 'Works under way';
    }
    $('tl-what').textContent = what;
    const jump = t < P.worksStart ? 'before' : Math.abs(t - P.now) < 0.03 ? 'now' : st.done ? 'after' : '';
    for (const b of document.querySelectorAll('.tl-jump button')) b.setAttribute('aria-current', b.dataset.jump === jump);
  }

  function buildTicks() {
    const box = $('tl-ticks'), min = +$('tl').min, max = +$('tl').max;
    const pct = (t) => ((t - min) / (max - min)) * 100 + '%';
    const band = document.createElement('span');
    band.className = 'band';
    band.style.left = pct(P.worksStart);
    band.style.width = `calc(${pct(P.open)} - ${pct(P.worksStart)})`;
    box.appendChild(band);
    for (let y = Math.ceil(min); y <= max; y++) {
      const s = document.createElement('span');
      s.className = 'yr'; s.style.left = pct(y); s.textContent = y;
      box.appendChild(s);
    }
    for (const e of window.TIMELINE) {
      if (e.t < min) continue;
      const s = document.createElement('span');
      s.className = 'ev' + (e.planned ? ' planned' : ''); s.style.left = pct(e.t);
      box.appendChild(s);
    }
    const now = document.createElement('span');
    now.className = 'now'; now.style.left = pct(P.now); now.textContent = 'Now';
    box.appendChild(now);
  }

  // ---------- the view ----------
  const view = { cx: 0, cy: 0, s: 1 };
  let W = 0, H = 0, dpr = 1;
  let userMoved = false; // once the user pans or zooms, a resize keeps their view
  const FIT = [-720, -640, 720, 600]; // x0, y0, x1, y1 in metres

  function insets() {
    // the panel sits at the side on wide screens and along the bottom on phones
    const hidden = stage.classList.contains('panel-hidden');
    const p = $('panel').getBoundingClientRect();
    const side = p.top < H / 3;
    const r = side && !hidden ? W - p.left : 0;
    const b = side ? 0 : H - p.top;
    const foot = $('foot').getBoundingClientRect();
    return { r, b, foot: H - foot.top + 8, top: 70 };
  }
  function fit(animate) {
    const ins = insets();
    const availW = W - ins.r - 24, availH = H - Math.max(ins.b, ins.foot) - ins.top;
    const s = Math.min(availW / (FIT[2] - FIT[0]), availH / (FIT[3] - FIT[1]));
    const mx = (FIT[0] + FIT[2]) / 2, my = (FIT[1] + FIT[3]) / 2;
    // centre the box in the space the panel and the foot leave
    const target = { s, cx: mx + (ins.r / 2) / s, cy: my - (ins.top - Math.max(ins.b, ins.foot)) / 2 / s };
    animateTo(target, animate);
  }
  let anim = null;
  function animateTo(target, animate) {
    if (!animate || reduced) { Object.assign(view, target); apply(); return; }
    const from = { ...view }, t0 = performance.now(), dur = 450;
    anim = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      view.s = Math.exp(Math.log(from.s) + (Math.log(target.s) - Math.log(from.s)) * e);
      view.cx = from.cx + (target.cx - from.cx) * e;
      view.cy = from.cy + (target.cy - from.cy) * e;
      apply();
      if (p >= 1) anim = null;
    };
  }

  function resize() {
    const r = $('mapwrap').getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    apply();
  }

  function apply() {
    view.s = Math.max(0.12, Math.min(14, view.s));
    const k = 1 / view.s;
    svg.setAttribute('viewBox', `${view.cx - (W / 2) * k} ${view.cy - (H / 2) * k} ${W * k} ${H * k}`);
    svg.style.setProperty('--k', k);
    svg.classList.toggle('zoomed-out', view.s < 0.75);
    MAP.placeShields(k);
    // a round number of metres for the scale bar
    const steps = [10, 20, 50, 100, 200, 500, 1000, 2000];
    const m = steps.find((x) => x * view.s >= 70) || 2000;
    $('scale-bar').style.width = m * view.s + 'px';
    $('scale-label').textContent = m >= 1000 ? `${m / 1000} km` : `${m} m`;
    needsDraw = true;
  }

  function zoomAt(f, px, py) {
    userMoved = true;
    const k = 1 / view.s;
    const mx = view.cx + (px - W / 2) * k, my = view.cy + (py - H / 2) * k;
    view.s *= f;
    view.s = Math.max(0.12, Math.min(14, view.s));
    const k2 = 1 / view.s;
    view.cx = mx - (px - W / 2) * k2; view.cy = my - (py - H / 2) * k2;
    apply();
  }

  // drag, wheel and pinch
  const pointers = new Map();
  let dragMoved = false, pinch = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = false;
    anim = null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) { hover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (pointers.size === 1) {
      if (Math.abs(dx) + Math.abs(dy) > 2) { dragMoved = true; svg.classList.add('dragging'); SIM.follow(null); }
      view.cx -= dx / view.s; view.cy -= dy / view.s;
      userMoved = true;
      apply();
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = svg.getBoundingClientRect();
      zoomAt(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.d = d;
      dragMoved = true;
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    svg.classList.remove('dragging');
    if (!dragMoved && pointers.size === 0 && e.type === 'pointerup') click(e);
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointerleave', () => { $('tip').hidden = true; });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  function toMap(e) {
    const r = svg.getBoundingClientRect(), k = 1 / view.s;
    return [view.cx + (e.clientX - r.left - W / 2) * k, view.cy + (e.clientY - r.top - H / 2) * k, e.clientX - r.left, e.clientY - r.top];
  }
  const ARMS = window.ARMS;
  function hover(e) {
    const [x, y, px, py] = toMap(e);
    const c = SIM.pick(x, y, 1 / view.s);
    const tip = $('tip');
    if (!c) { tip.hidden = true; return; }
    const o = c.R.key[0], d = c.dest;
    tip.innerHTML = `<b>To ${ARMS[d].short}</b><span>${ARMS[o].from}${c.R.kind === 'loop' ? ', by the Northern Loop' : ''}</span>`;
    tip.style.left = px + 'px'; tip.style.top = py + 'px';
    tip.hidden = false;
  }
  function click(e) {
    const [x, y] = toMap(e);
    const c = SIM.pick(x, y, 1 / view.s);
    if (c) {
      SIM.follow(c);
      select(c.R.key.replace('-2029', ''), true);
    } else if (selectedKey) {
      SIM.follow(null);
      select(null);
    }
  }

  $('zin').onclick = () => zoomAt(1.6, W / 2, H / 2);
  $('zout').onclick = () => zoomAt(1 / 1.6, W / 2, H / 2);
  $('zfit').onclick = () => { SIM.follow(null); userMoved = false; fit(true); };
  $('theme').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    SIM.readColours();
    needsDraw = true;
  };

  // ---------- lanes, routes and the panel ----------
  function liveKey(id) { return id === 'w-s' && st.loopOpen ? 'w-s-2029' : id; }
  function redrawRibbons() {
    MAP.drawRibbons(SIM.activeRoutes(), lanesOn);
    MAP.highlight(selectedKey ? SIM.route(liveKey(selectedKey)) : null);
  }
  $('lanes').onclick = () => {
    lanesOn = !lanesOn;
    $('lanes').setAttribute('aria-pressed', lanesOn);
    redrawRibbons();
  };

  function select(id, fromMap) {
    selectedKey = id === selectedKey && !fromMap ? null : id;
    SIM.select(selectedKey ? liveKey(selectedKey) : null);
    MAP.highlight(selectedKey ? SIM.route(liveKey(selectedKey)) : null);
    renderMoves();
    if (selectedKey && fromMap) {
      showTab('routes');
      const row = document.querySelector(`.mv[data-id="${selectedKey}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
    needsDraw = true;
  }

  const KIND_LABEL = { through: 'Straight on', link: 'Slip road', island: 'Round the island' };
  function renderMoves() {
    const box = $('moves');
    const groups = ['w', 'n', 'e', 's'];
    let html = '';
    for (const o of groups) {
      html += `<h3 class="group-h"><span class="shield-chip">${ARMS[o].road}</span>${ARMS[o].from}</h3>`;
      for (const m of window.MOVES.filter((x) => x.id[0] === o)) {
        const d = m.id[2];
        const open = m.id === selectedKey;
        const viaLoop = m.id === 'w-s' && st && st.loopOpen;
        const kind = viaLoop ? '<span class="kind loop">Northern Loop</span>' : `<span class="kind ${m.kind}">${KIND_LABEL[m.kind]}</span>`;
        let body = '';
        if (open) {
          const now = viaLoop && m.after ? m.after : m.text;
          const extra = !viaLoop && m.after ? `<p class="after"><b>After the works</b>${m.after}</p>` : viaLoop ? `<p class="after"><b>Before the works</b>${m.text}</p>` : '';
          body = `<div class="mv-body"><p>${now}</p>${extra}</div>`;
        }
        html += `<div class="mv${open ? ' open' : ''}" data-id="${m.id}"><button class="mv-row" type="button" aria-expanded="${open}">
          <span class="mv-dot to-${d}"></span><span class="mv-to"><b>To ${ARMS[d].short}</b><span>${ARMS[d].to}</span></span>${kind}</button>${body}</div>`;
      }
    }
    box.innerHTML = html;
  }
  $('moves').addEventListener('click', (e) => {
    const row = e.target.closest('.mv');
    if (row && e.target.closest('.mv-row')) { SIM.follow(null); select(row.dataset.id); }
  });

  function renderWorks() {
    $('figures').innerHTML = window.FACTS.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('scheme').innerHTML = window.SCHEME.map(([b, s]) => `<li><b>${b}</b><span>${s}</span></li>`).join('');
    $('events').innerHTML = window.TIMELINE.map((e, i) => `<li class="${e.planned ? 'planned' : ''}" data-i="${i}"><button type="button">
      <span class="pip"></span><span><span class="ev-date">${e.date}</span><span class="ev-title">${e.title}</span><span class="ev-text">${e.text}</span></span></button></li>`).join('');
  }
  $('events').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const ev = window.TIMELINE[+li.dataset.i];
    setDate(Math.max(+$('tl').min, ev.t + 0.01));
  });
  function markEvents(t) {
    const items = document.querySelectorAll('#events li');
    let here = -1;
    window.TIMELINE.forEach((e, i) => { if (e.t <= t + 0.005) here = i; });
    items.forEach((li, i) => { li.classList.toggle('past', i < here); li.classList.toggle('here', i === here); });
  }

  function showTab(name) {
    for (const t of ['routes', 'works', 'about']) {
      $('t-' + t).setAttribute('aria-selected', t === name);
      $('pane-' + t).hidden = t !== name;
    }
  }
  for (const t of ['routes', 'works', 'about']) $('t-' + t).onclick = () => { showTab(t); if (stage.classList.contains('panel-hidden')) togglePanel(); };

  function togglePanel() {
    stage.classList.toggle('panel-hidden');
    const hidden = stage.classList.contains('panel-hidden');
    $('show-panel').hidden = !hidden || matchMedia('(max-width: 720px)').matches;
    setTimeout(() => fit(true), 320);
  }
  $('hide-panel').onclick = togglePanel;
  $('show-panel').onclick = togglePanel;

  // ---------- timeline controls ----------
  $('tl').addEventListener('input', (e) => setDate(+e.target.value, true));
  for (const b of document.querySelectorAll('.tl-jump button')) {
    b.onclick = () => setDate(b.dataset.jump === 'before' ? 2025.6 : b.dataset.jump === 'now' ? P.now : 2029.3);
  }

  // ---------- traffic controls ----------
  let playing = !reduced;
  function setPlaying(p) {
    playing = p;
    $('play').setAttribute('aria-pressed', p);
    $('play-label').textContent = p ? 'Pause traffic' : 'Run traffic';
  }
  $('play').onclick = () => setPlaying(!playing);
  for (const b of document.querySelectorAll('[data-level]')) {
    b.onclick = () => {
      for (const o of document.querySelectorAll('[data-level]')) o.setAttribute('aria-pressed', o === b);
      SIM.setLevel(+b.dataset.level);
    };
  }
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === '+' || e.key === '=') zoomAt(1.4, W / 2, H / 2);
    else if (e.key === '-') zoomAt(1 / 1.4, W / 2, H / 2);
    else if (e.key === 'Escape') { SIM.follow(null); select(null); }
  });

  // the J17 to J19 stopwatch
  const fmt = (s) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
  let clockAt = 0;
  function renderClock(now) {
    if (now - clockAt < 500) return;
    clockAt = now;
    $('clock-before').textContent = fmt(SIM.average('old'));
    $('clock-after').textContent = fmt(SIM.average('new'));
    $('clock-before').parentElement.classList.toggle('live', !st.loopOpen);
    $('clock-after').parentElement.classList.toggle('live', st.loopOpen);
    const both = SIM.average('old') != null && SIM.average('new') != null;
    $('clock-note').textContent = both
      ? 'Average of the last few cars in the simulation, from one side of the map to the other. Try it at rush hour.'
      : st.loopOpen
        ? 'Timing the loop. Drag the timeline back before Q3 2028 to time the roundabout too.'
        : 'Average time across the map in the simulation. Drag the timeline past Q3 2028 to time the loop.';
  }

  // ---------- the frame loop ----------
  let needsDraw = true, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (anim) anim(now);
    if (playing) {
      const sub = Math.ceil(dt / 0.05);
      for (let i = 0; i < sub; i++) SIM.step(dt / sub);
      needsDraw = true;
    }
    const f = SIM.following();
    if (f) {
      view.cx += (f.x - view.cx) * 0.12;
      view.cy += (f.y - view.cy) * 0.12;
      apply();
    }
    if (needsDraw) {
      SIM.draw(ctx, view, W, H, dpr);
      needsDraw = false;
    }
    renderClock(now);
    requestAnimationFrame(frame);
  }

  // ---------- start ----------
  // ?t=2029.3 opens at a date on the timeline; ?at=x,y,zoom at a view (metres from the roundabout, pixels per metre)
  const q = new URLSearchParams(location.search);
  const qt = parseFloat(q.get('t'));
  buildTicks();
  renderWorks();
  setDate(Number.isFinite(qt) ? Math.max(+$('tl').min, Math.min(+$('tl').max, qt)) : P.now);
  addEventListener('resize', () => { resize(); if (!userMoved) fit(false); });
  resize();
  fit(false);
  const at = (q.get('at') || '').split(',').map(Number);
  if (at.length === 3 && at.every(Number.isFinite)) { view.cx = at[0]; view.cy = at[1]; view.s = at[2]; userMoved = true; apply(); }
  SIM.warm(90);
  setPlaying(playing);
  requestAnimationFrame(frame);
})();
