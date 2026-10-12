// Rozložené opakování (zjednodušené SM-2): karta = souhvězdí × úroveň.
import { store } from './util.js';

const KEY = 'souhvezdi.srs', MINUTE = 6e4, DAY = 864e5;
const FACTOR = [0, 0.6, 1, 1.3];   // násobek intervalu pro známky 1 = těžké, 2 = dobré, 3 = snadné
const MAX_LEARNING = 6;            // kolik rozpracovaných karet smí běžet, než přidáme nové

export class Deck {
  cards = store.get(KEY, {});

  /** Zapíše odpověď se známkou 0 = špatně … 3 = snadno a naplánuje další opakování. */
  grade(key, g, now = Date.now()) {
    const c = this.cards[key] ??= { ease: 2.5, ivl: 0, due: 0, lapses: 0 };
    if (!g) Object.assign(c, { ease: Math.max(1.3, c.ease - 0.2), ivl: 0, lapses: c.lapses + 1 });
    else {
      c.ease = Math.max(1.3, c.ease + (g - 2) * 0.15);
      // Nová / zapomenutá karta jde přes krok 10 min, pak 1 den; dál interval roste s „lehkostí“.
      c.ivl = c.ivl >= 1 ? Math.min(365, c.ivl * c.ease * FACTOR[g]) : c.ivl > 0 || g === 3 ? 1 : 10 / 1440;
    }
    c.due = now + (c.ivl ? c.ivl * DAY * (0.95 + Math.random() * 0.1) : MINUTE);   // ±5 % proti shlukování
    store.set(KEY, this.cards);
    return c;
  }

  /** Nejdéle čekající splatná karta, jinak nová, jinak ta nejbližší (procvičování napřed). */
  next(keys, avoid, now = Date.now()) {
    const due = k => this.cards[k].due;
    const seen = keys.filter(k => this.cards[k] && k !== avoid).sort((a, b) => due(a) - due(b));
    const learning = seen.filter(k => this.cards[k].ivl < 1).length;
    return seen.find(k => due(k) <= now)
      ?? (learning < MAX_LEARNING ? keys.find(k => !this.cards[k]) : undefined)
      ?? seen[0] ?? keys[0];
  }

  reset() { this.cards = {}; store.set(KEY, this.cards); }
}
