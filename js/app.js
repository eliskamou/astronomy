// Vstupní bod: načte data a přepíná tři módy – Výuka (atlas), Obloha v čase, Test.
import { RAD, PRAGUE, vec, radec, angle, lst } from './astro.js';
import { $, clamp, conName, fmtDate } from './util.js';
import { SkyView, DOME_FOV } from './render.js';
import { Deck } from './srs.js';
import { Quiz } from './quiz.js';

async function loadSky() {
  const sky = await (await fetch('data/sky.json')).json();
  sky.starVec = sky.stars.map(([ra, dec]) => vec(ra, dec));
  sky.byId = {};
  for (const c of sky.cons) {
    sky.byId[c.id] = c;
    c.v = vec(...c.c);
    c.boundVec = c.bounds.map(poly => poly.map(p => vec(...p)));
    const pts = c.lines.flat().map(i => sky.starVec[i]);
    c.mid = radec([0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0)));                  // těžiště obrazce
    c.extent = Math.max(...pts.map(p => angle(vec(...c.mid), p)));                         // úhlový poloměr obrazce
  }
  return sky;
}

const sky = await loadSky(), deck = new Deck(), canvas = $('#sky'), view = new SkyView(canvas, sky);

/** Nejlepší interval přes všechny úrovně → barva tečky v seznamu. */
const mastery = id => {
  const ivl = Math.max(...[0, 1, 2].map(l => deck.cards[`${id}:${l}`]?.ivl ?? -1));
  return ivl < 0 ? '' : ivl >= 21 ? 'm3' : ivl >= 1 ? 'm2' : 'm1';
};

const atlas = {
  sel: 'UMa', center: sky.byId.UMa.c, fov: 90,
  enter() { this.select(this.sel); },
  render() {
    view.draw({ center: this.center, fov: this.fov, mag: 5.5, lines: 'all', bounds: $('#at-bounds').checked,
      labels: $('#at-lang').value || null, highlight: this.sel });
  },
  click(id) { if (id) this.select(id); },
  select(id, recenter) {
    const c = sky.byId[id];
    this.sel = id;
    if (recenter) this.center = c.mid;
    const stars = sky.names.filter(n => n[2] === id).map(n => n[1]).join(', ');
    $('#at-info').innerHTML = `<p class="big">${c.cz}</p><p><i>${c.la}</i>, 2. pád <i>${c.gen}</i>, zkratka ${c.id}</p>`
      + `<p class="hint">Skupina: ${c.group}${stars ? ` · Jasné hvězdy: ${stars}` : ''}</p>`;
    $('#at-list').innerHTML = sky.groups.map(g => `<h3>${g}</h3>` + sky.cons
      .filter(c => c.group === g)
      .sort((a, b) => a.cz.localeCompare(b.cz, 'cs'))
      .map(c => `<button data-id="${c.id}" class="${mastery(c.id)}${c.id === id ? ' sel' : ''}">${c.cz}</button>`)
      .join('')).join('');
    this.render();
  },
};

const planet = {
  play: null, sel: null,
  date() { return new Date(new Date().getFullYear(), 0, 1 + Math.floor(this.doy), 0, Math.round(this.min)); },
  enter() { this.doy === undefined ? this.now() : this.render(); },
  now() {
    const d = new Date();
    this.doy = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 864e5);
    this.min = d.getHours() * 60 + d.getMinutes();
    this.render();
  },
  render() {
    const date = this.date();
    $('#pl-doy').value = this.doy;
    $('#pl-min').value = this.min;
    $('#pl-when').textContent = fmtDate(date);
    view.draw({ center: [lst(date), PRAGUE.lat], fov: DOME_FOV, dome: true, date, mag: 5,
      lines: $('#pl-lines').checked ? 'all' : 'none', labels: $('#pl-lang').value || null, highlight: this.sel });
  },
  click(id) {
    this.sel = id;
    $('#pl-hit').textContent = id ? conName(sky.byId[id], 'both') : '';
    this.render();
  },
  toggle(kind) {
    this.play = this.play === kind ? null : kind;
    $('#pl-day').textContent = this.play === 'day' ? '⏸ den' : '▶ den';
    $('#pl-year').textContent = this.play === 'year' ? '⏸ rok' : '▶ rok';
    this.tick();
  },
  /** Animace: „den“ posouvá čas (otáčení oblohy), „rok“ datum při stejné hodině (roční období). */
  tick() {
    if (!this.play || mode !== planet) return;
    if (this.play === 'day') this.min += 2; else this.doy += 0.25;
    if (this.min >= 1440) { this.min -= 1440; this.doy++; }
    this.doy %= 365;
    this.render();
    requestAnimationFrame(() => this.tick());
  },
};

const quiz = new Quiz(sky, view, deck);
const modes = { atlas, planet, quiz };
let mode;

function setMode(name) {
  mode = modes[name] ?? atlas;
  name = Object.keys(modes).find(k => modes[k] === mode);
  history.replaceState(null, '', `#${name}`);
  for (const b of $('#tabs').children) b.classList.toggle('on', b.dataset.mode === name);
  for (const k in modes) $(`#${k}`).hidden = k !== name;
  mode.enter();
}

// Ovládání atlasu a oblohy
$('#tabs').onclick = e => e.target.dataset.mode && setMode(e.target.dataset.mode);
$('#at-list').onclick = e => e.target.dataset.id && atlas.select(e.target.dataset.id, true);
$('#at-lang').onchange = $('#at-bounds').onchange = () => atlas.render();
$('#pl-lang').onchange = $('#pl-lines').onchange = () => planet.render();
$('#pl-doy').oninput = e => { planet.doy = +e.target.value; planet.render(); };
$('#pl-min').oninput = e => { planet.min = +e.target.value; planet.render(); };
$('#pl-now').onclick = () => planet.now();
$('#pl-day').onclick = () => planet.toggle('day');
$('#pl-year').onclick = () => planet.toggle('year');
document.onkeydown = e => mode === quiz && quiz.onKey(e);
view.onResize = () => mode.render();

// Plátno: klik/klepnutí vybírá souhvězdí; v atlasu tažení posouvá, kolečko nebo dva prsty zoomují.
const pointers = new Map();
let drag = null, pinch = null;
const spread = () => { const [[x1, y1], [x2, y2]] = pointers.values(); return Math.hypot(x2 - x1, y2 - y1); };
const zoom = fov => { atlas.fov = clamp(fov, 20, 220); atlas.render(); };

canvas.onpointerdown = e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
  drag = pointers.size === 1 ? { x: e.offsetX, y: e.offsetY, moved: false } : null;
  pinch = pointers.size === 2 ? { d: spread(), fov: atlas.fov } : null;
};
canvas.onpointermove = e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (mode !== atlas) return;
  if (pinch) return zoom(pinch.fov * pinch.d / spread());
  if (!drag) return;
  const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  Object.assign(drag, { x: e.offsetX, y: e.offsetY, moved: true });
  const k = 2 / view.s / RAD;   // stupňů na pixel ve středu stereografické projekce
  const [ra, dec] = atlas.center;
  atlas.center = [ra + dx * k / Math.cos(dec * RAD), clamp(dec + dy * k, -89, 89)];
  atlas.render();
};
canvas.onpointerup = canvas.onpointercancel = e => {
  if (e.type === 'pointerup' && drag && !drag.moved) mode.click(view.hit(e.offsetX, e.offsetY));
  pointers.delete(e.pointerId);
  drag = pinch = null;
};
canvas.onwheel = e => {
  if (mode !== atlas) return;
  e.preventDefault();
  zoom(atlas.fov * (e.deltaY > 0 ? 1.1 : 1 / 1.1));
};

setMode(location.hash.slice(1));
