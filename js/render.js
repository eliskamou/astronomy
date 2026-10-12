// Kreslení oblohy ve stereografické projekci (zachovává tvary obrazců) a určení souhvězdí pod kurzorem.
import { RAD, vec, dot, sun } from './astro.js';
import { clamp, conName } from './util.js';

const COLOR = {
  ground: '#03050b', night: [6, 10, 24], day: [62, 104, 165],
  line: 'rgba(110,160,255,.5)', hi: '#ffc94d', hiFill: 'rgba(130,170,255,.12)',
  bound: 'rgba(160,180,255,.2)', label: 'rgba(190,205,255,.75)', horizon: '#56628a', halo: 'rgba(5,8,18,.85)',
};
const starColor = bv => bv < 0 ? '#b5ccff' : bv < 0.5 ? '#eef2ff' : bv < 1 ? '#fff3dc' : '#ffcf9e';
const mix = (a, b, t) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t))})`;
const RINGS = [0, 14, 28, 44, 64, 90, 120];        // vzdálenosti (px), kde hledáme volné místo pro popisek
const RINGS_HI = [...RINGS, 160, 210, 270];          // zvýrazněný popisek se umístí vždy, klidně dál

/** Protíná úsečka [x1, y1, x2, y2] obdélník [l, t, r, b]? (Liang–Barsky) */
function segHitsRect([x1, y1, x2, y2], [l, t, r, b]) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - l], [dx, r - x1], [-dy, y1 - t], [dy, b - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const u = q / p;
    if (p < 0) t0 = Math.max(t0, u); else t1 = Math.min(t1, u);
    if (t0 > t1) return false;
  }
  return true;
}
const rectsOverlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

export const DOME_FOV = 198;                        // celá obloha + okraj pro světové strany
const CARDINALS = [['S', 0, -1], ['V', -1, 0], ['J', 0, 1], ['Z', 1, 0]];   // sever nahoře, východ vlevo

export class SkyView {
  paths = new Map();   // id souhvězdí → Path2D jeho hranic (pro klikání)

  constructor(canvas, sky) {
    Object.assign(this, { canvas, sky, ctx: canvas.getContext('2d') });
    this.resize();
    new ResizeObserver(() => { this.resize(); this.onResize?.(); }).observe(canvas);
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    Object.assign(this, { w: width, h: height, dpr: devicePixelRatio || 1 });
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
  }

  /** Střed pohledu [ra, dec] a zorné pole (průměr ve stupních přes kratší stranu plátna). */
  setView([ra, dec], fov) {
    const a = ra * RAD, d = dec * RAD;
    this.c = vec(ra, dec);
    this.e = [-Math.sin(a), Math.cos(a), 0];                                         // na východ
    this.n = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];  // na sever
    this.s = Math.min(this.w, this.h) / 2 / Math.tan(fov * RAD / 4);
  }

  project(v) {
    const z = 1 + dot(v, this.c);
    return z < 0.15 ? null : [this.w / 2 - dot(v, this.e) / z * this.s, this.h / 2 - dot(v, this.n) / z * this.s];
  }

  /**
   * Vykreslí oblohu. Volby: center, fov, dome (celá obloha nad obzorem; center = zenit), date (Slunce a soumrak),
   * mag (mezní hvězdná velikost), only (jen obrazec jednoho souhvězdí), lines ('all' | 'none'), bounds,
   * highlight (zvýrazněné souhvězdí), mark (kroužek kolem souhvězdí), labels (jazyk | null), labelIds, starScale.
   */
  draw(o) {
    const { ctx, sky, w, h } = this;
    this.setView(o.center, o.fov);
    this.dome = o.dome;
    const P = sky.starVec.map(v => this.project(v));
    const sunV = o.date && vec(...sun(o.date));
    const sunAlt = sunV ? 90 - Math.acos(dot(sunV, this.c)) / RAD : -90;   // platí pro dome (střed = zenit)

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLOR.ground;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    o.dome ? ctx.arc(w / 2, h / 2, this.s, 0, 2 * Math.PI) : ctx.rect(0, 0, w, h);
    ctx.fillStyle = mix(COLOR.night, COLOR.day, clamp((sunAlt + 18) / 18));
    ctx.fill();
    ctx.clip();

    this.buildPaths();
    if (o.bounds) {
      ctx.strokeStyle = COLOR.bound;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const p of this.paths.values()) ctx.stroke(p);
      ctx.setLineDash([]);
      const hp = this.paths.get(o.highlight);
      if (hp) { ctx.fillStyle = COLOR.hiFill; ctx.fill(hp); }
    }

    const target = o.only || o.highlight;
    for (const c of sky.cons) {
      if (c.id === target) this.lines(c, P, COLOR.hi, 2);
      else if (o.lines === 'all' && !o.only) this.lines(c, P, COLOR.line, 1);
    }

    const onlyStars = o.only && new Set(sky.byId[o.only].lines.flat());
    const dim = clamp(-sunAlt / 12, 0.25);   // ve dne hvězdy blednou
    sky.stars.forEach(([, , mag, bv], i) => {
      const p = P[i];
      if (!p || (onlyStars ? !onlyStars.has(i) : mag > (o.mag ?? 5))) return;
      ctx.globalAlpha = dim * Math.min(1, 0.3 + (6 - mag) / 5);
      ctx.fillStyle = starColor(bv);
      ctx.beginPath();
      ctx.arc(p[0], p[1], (o.starScale ?? 1) * Math.max(0.6, (5.8 - mag) * 0.7), 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (sunV && sunAlt > 0) {
      const p = this.project(sunV);
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 2 * Math.PI); ctx.fill();
    }
    if (o.labels) this.labels(o, P);
    if (o.mark) this.mark(sky.byId[o.mark], P);
    ctx.restore();
    if (o.dome) this.horizon();
  }

  buildPaths() {
    this.paths.clear();
    for (const c of this.sky.cons) {
      const path = new Path2D();
      const ok = c.boundVec.every(poly => {
        const pts = poly.map(v => this.project(v));
        if (pts.includes(null)) return false;
        pts.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y));
        path.closePath();
        return true;
      });
      if (ok) this.paths.set(c.id, path);
    }
  }

  lines(c, P, style, width) {
    const { ctx } = this;
    ctx.beginPath();
    for (const line of c.lines) {
      let pen = false;
      for (const i of line) {
        if (P[i]) ctx[pen ? 'lineTo' : 'moveTo'](...P[i]);
        pen = !!P[i];
      }
    }
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /**
   * Popisky se nesmí překrývat s obrazci (ani nenakreslenými) ani mezi sebou a musí ležet ve „svém“ souhvězdí:
   * každý zkouší místa v rostoucích kruzích kolem kotvy a bere první vyhovující. Jinak se vynechá – kromě
   * zvýrazněného, který se umístí vždy (přednostně bez překryvu, pak uvnitř hranic).
   */
  labels({ labels, labelIds, highlight }, P) {
    const { ctx, sky, w, h } = this;
    const segs = sky.cons.flatMap(c => c.lines.flatMap(line => line.slice(1)
      .map((j, k) => P[line[k]] && P[j] && [...P[line[k]], ...P[j]]).filter(Boolean)));
    const placed = [];
    const fits = ([l, t, r, b]) => this.dome
      ? Math.hypot(Math.max(Math.abs(l - w / 2), Math.abs(r - w / 2)), Math.max(Math.abs(t - h / 2), Math.abs(b - h / 2))) < this.s
      : l > 0 && t > 0 && r < w && b < h;
    const rank = c => c.id === highlight ? -1 : labelIds ? labelIds.indexOf(c.id) : c.rank;
    const cons = sky.cons.filter(c => !labelIds || labelIds.includes(c.id)).sort((a, b) => rank(a) - rank(b));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const c of cons) {
      const p = this.project(c.v), hi = c.id === highlight;
      if (!p) continue;
      const text = conName(c, labels);
      ctx.font = hi ? '600 15px system-ui' : '12px system-ui';
      const hw = ctx.measureText(text).width / 2 + 3, hh = hi ? 10 : 8;
      const reach = (hi ? RINGS_HI : RINGS).at(-1) + hw;
      const near = segs.filter(s => Math.min(s[0], s[2]) < p[0] + reach && Math.max(s[0], s[2]) > p[0] - reach
        && Math.min(s[1], s[3]) < p[1] + reach && Math.max(s[1], s[3]) > p[1] - reach);
      const own = this.paths.get(c.id);
      const inside = (x, y) => own && ctx.isPointInPath(own, x * this.dpr, y * this.dpr);
      let best = null, bestCost = Infinity;
      search: for (const r of hi ? RINGS_HI : RINGS) {
        for (let k = 0, n = r ? 12 : 1; k < n; k++) {
          const x = p[0] + r * Math.cos(k * Math.PI / 6), y = p[1] + r * Math.sin(k * Math.PI / 6);
          const rect = [x - hw, y - hh, x + hw, y + hh];
          if (!fits(rect)) continue;
          const cost = 2 * (near.filter(s => segHitsRect(s, rect)).length + placed.filter(q => rectsOverlap(q, rect)).length)
            + !inside(x, y);
          if (cost < bestCost) [best, bestCost] = [rect, cost];
          if (!cost) break search;
        }
      }
      if (!best || (bestCost && !hi)) continue;
      placed.push(best);
      const [x, y] = [(best[0] + best[2]) / 2, (best[1] + best[3]) / 2];
      ctx.strokeStyle = COLOR.halo;   // tmavý lem, aby byl text čitelný i přes hvězdy
      ctx.lineWidth = 3;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = hi ? COLOR.hi : COLOR.label;
      ctx.fillText(text, x, y);
    }
    ctx.textBaseline = 'alphabetic';
  }

  /** Přerušovaný kroužek kolem obrazce – jako „označené souhvězdí“ v papírovém testu. */
  mark(c, P) {
    const pts = c.lines.flat().map(i => P[i]).filter(Boolean);
    if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const { ctx } = this;
    ctx.strokeStyle = COLOR.hi;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 + 18, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  horizon() {
    const { ctx, w, h, s } = this;
    ctx.strokeStyle = COLOR.horizon;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, s, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = COLOR.horizon;
    ctx.font = '600 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [t, x, y] of CARDINALS) ctx.fillText(t, w / 2 + x * (s + 12), h / 2 + y * (s + 12));
    ctx.textBaseline = 'alphabetic';
  }

  /** Id souhvězdí v bodě (CSS pixely), nebo null. */
  hit(x, y) {
    if (this.dome && Math.hypot(x - this.w / 2, y - this.h / 2) > this.s) return null;
    for (const [id, p] of this.paths) if (this.ctx.isPointInPath(p, x * this.dpr, y * this.dpr)) return id;
    return null;
  }
}
