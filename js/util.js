export const $ = s => document.querySelector(s);
export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

/** Název souhvězdí v jazyce 'cz' | 'la' | 'both'. */
export const conName = (c, lang) => lang === 'both' && c.cz !== c.la ? `${c.cz} · ${c.la}` : c[lang === 'both' ? 'cz' : lang];

export const fmtDate = d => d.toLocaleString('cs-CZ', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Obecné uložení do localStorage (v soukromém režimu může selhat – aplikace pak jen nepamatuje). */
export const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignorovat */ } },
};
