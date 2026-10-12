// Testovací mód: tři úrovně obtížnosti, otázky „Co to je?“ a „Kde je?“, plánování přes Deck.
import { RAD, PRAGUE, vec, angle, lst, sun, altitude } from './astro.js';
import { DOME_FOV } from './render.js';
import { $, clamp, pick, shuffle, conName, fmtDate, store } from './util.js';

const SETTINGS = 'souhvezdi.settings';
const LEVEL = { FIGURE: 0, CHART: 1, SKY: 2 };
const norm = s => s.normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase();   // bez diakritiky a mezer
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n < 5 ? few : many}`;
const when = ivl => !ivl ? 'za minutu' : ivl < 1 ? 'za 10 min' : `za ${plural(Math.round(ivl), 'den', 'dny', 'dní')}`;

/** Náhodný noční okamžik během roku, kdy je souhvězdí z Prahy dobře nad obzorem. */
function nightWhenVisible(c) {
  const minAlt = Math.min(25, 85 - Math.abs(PRAGUE.lat - c.mid[1]));
  for (let i = 0; ; i++) {
    const date = new Date(Date.now() + (Math.random() - 0.5) * 365 * 864e5);
    if (i > 5000 || altitude(vec(...sun(date)), date) < -12 && altitude(c.v, date) > minAlt) return date;
  }
}

export class Quiz {
  constructor(sky, view, deck) {
    Object.assign(this, { sky, view, deck });
    this.s = { level: 0, lang: 'cz', mode: 'choices', groups: sky.groups.filter(g => g !== 'jižní'), ...store.get(SETTINGS) };
    $('#q-groups').innerHTML = sky.groups.map(g => `<label><input type="checkbox" value="${g}"> ${g}</label>`).join('');
    for (const k of ['level', 'lang', 'mode']) $(`#q-${k}`).value = this.s[k];
    for (const cb of $('#q-groups').querySelectorAll('input')) cb.checked = this.s.groups.includes(cb.value);
    $('#q-settings').open = matchMedia('(min-width: 761px)').matches;   // na mobilu sbalené, ať je vidět otázka
    $('#q-settings').onchange = () => this.saveSettings();
    $('#q-choices').onclick = e => e.target.dataset.id && this.answer(e.target.dataset.id === this.q.c.id);
    $('#q-form').onsubmit = e => { e.preventDefault(); this.state === 'ask' && this.q.type === 'name' ? this.answer(norm($('#q-input').value) === norm(this.q.c[this.q.lang])) : this.advance(); };
    $('#q-skip').onclick = () => this.answer(false);
    $('#q-next').onclick = () => this.advance();
    $('#q-reset').onclick = () => confirm('Opravdu smazat veškerý pokrok?') && (this.deck.reset(), this.next());
  }

  saveSettings() {
    this.s = {
      level: +$('#q-level').value, lang: $('#q-lang').value, mode: $('#q-mode').value,
      groups: [...$('#q-groups').querySelectorAll(':checked')].map(cb => cb.value),
    };
    store.set(SETTINGS, this.s);
    this.next();
  }

  /** Karty ve vybraných skupinách; důležitější (jasnější) souhvězdí přicházejí na řadu dřív. */
  pool() {
    const { level, groups } = this.s;
    return this.sky.cons
      .filter(c => groups.includes(c.group) && !(level === LEVEL.SKY && c.group === 'jižní'))
      .sort((a, b) => a.rank - b.rank)
      .map(c => `${c.id}:${level}`);
  }

  enter() { this.q ? this.update() : this.next(); }
  render() { if (this.q) this.draw(); }

  next() {
    const keys = this.pool();
    if (!keys.length) {
      this.q = null;
      $('#q-text').textContent = 'Vyber aspoň jednu skupinu souhvězdí.';
      for (const el of ['#q-scene', '#q-choices', '#q-form', '#q-feedback', '#q-skip', '#q-next']) $(el).hidden = true;
      return;
    }
    $('#q-scene').hidden = $('#q-feedback').hidden = false;
    this.key = this.deck.next(keys, this.key);
    const [id, level] = this.key.split(':');
    const c = this.sky.byId[id];
    this.q = {
      c, level: +level,
      type: +level !== LEVEL.FIGURE && Math.random() < 0.5 ? 'find' : 'name',
      lang: this.s.lang === 'mix' ? pick(['cz', 'la']) : this.s.lang,
    };
    this.q.scene = this.scene(c, this.q.level);
    this.clicked = null;
    this.deck.cards[this.key] ? this.ask() : (this.state = 'intro', this.update());   // nové souhvězdí nejdřív ukážeme
  }

  ask() {
    if (this.state === 'intro') this.q.scene = this.scene(this.q.c, this.q.level);   // jiný výřez, ať se nehádá z paměti
    this.state = 'ask';
    this.t0 = performance.now();
    $('#q-choices').innerHTML = this.choices().map((c, i) =>
      `<button data-id="${c.id}">${i + 1}. ${conName(c, this.q.lang)}</button>`).join('');
    $('#q-input').value = '';
    this.update();
    if (this.s.mode === 'type' && this.q.type === 'name') $('#q-input').focus();
  }

  advance() { this.state === 'intro' ? this.ask() : this.state === 'answered' && this.next(); }

  scene(c, level) {
    if (level === LEVEL.FIGURE) return { center: c.mid, fov: Math.max(20, c.extent * 2.6) };
    if (level === LEVEL.CHART) {
      const j = () => (Math.random() - 0.5) * 24;
      return { center: [c.mid[0] + j() / Math.cos(c.mid[1] * RAD), clamp(c.mid[1] + j(), -89, 89)], fov: Math.max(70, c.extent * 2.4) };
    }
    const date = nightWhenVisible(c);
    return { center: [lst(date), PRAGUE.lat], fov: DOME_FOV, dome: true, date };
  }

  /** Správná odpověď + 2 sousední souhvězdí (záměrně matoucí) + 1 náhodné. */
  choices() {
    const { c } = this.q;
    const others = this.sky.cons.filter(o => o.id !== c.id).sort((a, b) => angle(c.v, a.v) - angle(c.v, b.v));
    return shuffle([c, ...shuffle(others.slice(0, 5)).slice(0, 2), pick(others.slice(5))]);
  }

  click(id) {
    if (this.state === 'ask' && this.q.type === 'find' && id) this.answer(id === this.q.c.id, id);
  }

  /** Známka podle správnosti a rychlosti vybavení: rychlá odpověď = snadné, pomalá = těžké. */
  answer(ok, clicked = null) {
    if (this.state !== 'ask') return;
    const secs = (performance.now() - this.t0) / 1000;
    const card = this.deck.grade(this.key, ok ? (secs < 5 ? 3 : secs > 15 ? 1 : 2) : 0);
    const { c } = this.q;
    Object.assign(this, { state: 'answered', clicked });
    const fb = $('#q-feedback');
    fb.className = ok ? 'ok' : 'bad';
    fb.textContent = `${ok ? '✓ Správně' : '✗ Špatně'}: ${conName(c, 'both')} (2. pád ${c.gen}).`
      + (clicked && !ok ? ` Kliknuto na: ${conName(this.sky.byId[clicked], 'both')}.` : '')
      + ` Znovu ${when(card.ivl)}.`;
    this.update();
  }

  draw() {
    const { c, level, type, scene } = this.q, shown = this.state !== 'ask';
    this.view.draw({
      ...scene, mag: level === LEVEL.SKY ? 4.5 : 5,
      only: level === LEVEL.FIGURE ? c.id : null,
      starScale: level === LEVEL.FIGURE ? 2 : 1,
      lines: level === LEVEL.CHART ? 'all' : 'none',
      bounds: level === LEVEL.CHART,
      highlight: shown || (type === 'name' && level !== LEVEL.SKY) ? c.id : null,
      mark: !shown && type === 'name' && level === LEVEL.SKY ? c.id : null,
      labels: shown ? 'both' : null,
      labelIds: [c.id, this.clicked],
    });
  }

  update() {
    this.draw();
    const { c, type, lang, level, scene } = this.q, st = this.state, asking = st === 'ask' && type === 'name';
    const what = ['', 'zvýrazněné ', 'označené '][level];
    $('#q-text').textContent = st === 'intro' ? `Nové souhvězdí: ${conName(c, 'both')}`
      : type === 'find' ? `Klikni na souhvězdí ${conName(c, lang)}.`
      : `Jak se jmenuje ${what}souhvězdí ${lang === 'cz' ? 'česky' : 'latinsky'}?`;
    $('#q-scene').textContent = scene.date ? `Obloha nad Prahou, ${fmtDate(scene.date)}` : '';
    $('#q-choices').hidden = !asking || this.s.mode !== 'choices';
    $('#q-form').hidden = !asking || this.s.mode !== 'type';
    $('#q-skip').hidden = st !== 'ask';
    $('#q-next').hidden = st === 'ask';
    $('#q-next').textContent = st === 'intro' ? 'Vyzkoušet ⏎' : 'Další ⏎';
    if (st !== 'answered') $('#q-feedback').textContent = '';
    this.stats();
  }

  stats() {
    const now = Date.now(), cards = this.pool().map(k => this.deck.cards[k]);
    const count = f => cards.filter(f).length;
    $('#q-stats').textContent = `K opakování ${count(x => x?.due <= now)} · nová ${count(x => !x)}`
      + ` · zvládnutá ${count(x => x?.ivl >= 21)} / ${cards.length}`;
  }

  /** Klávesy: Enter = pokračovat, 1–4 = volba odpovědi. */
  onKey(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter') this.advance();
    else if (!$('#q-choices').hidden) $('#q-choices').children[e.key - 1]?.click();
  }
}
