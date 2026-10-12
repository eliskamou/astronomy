// Sférická astronomie: jednotkové vektory v rovníkových souřadnicích (stupně), čas, Slunce.
export const RAD = Math.PI / 180;
export const PRAGUE = { lat: 50.08, lon: 14.42 };

export const vec = (ra, dec) => {
  const a = ra * RAD, d = dec * RAD;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const radec = ([x, y, z]) => [(Math.atan2(y, x) / RAD + 360) % 360, Math.asin(z / Math.hypot(x, y, z)) / RAD];
export const angle = (a, b) => Math.acos(Math.min(1, dot(a, b))) / RAD;

const daysJ2000 = date => date / 864e5 - 10957.5;

/** Místní hvězdný čas ve stupních = rektascenze bodu v zenitu. */
export const lst = (date, lon = PRAGUE.lon) =>
  ((280.46061837 + 360.98564736629 * daysJ2000(date) + lon) % 360 + 360) % 360;

/** Přibližná poloha Slunce [ra, dec] (přesnost ~0,01°, pro mapu oblohy stačí). */
export function sun(date) {
  const d = daysJ2000(date), g = (357.528 + 0.9856003 * d) * RAD;
  const l = (280.46 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = 23.439 * RAD;
  return [Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)) / RAD, Math.asin(Math.sin(e) * Math.sin(l)) / RAD];
}

export const zenith = date => [lst(date), PRAGUE.lat];
export const altitude = (v, date) => 90 - angle(v, vec(...zenith(date)));
