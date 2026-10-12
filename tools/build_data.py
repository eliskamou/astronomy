"""Stáhne katalog d3-celestial (© Olaf Frohn, BSD-3) a zkompaktní ho do data/sky.json.

Spuštění: python3 tools/build_data.py
"""
import json
import math
import urllib.request
from bisect import bisect
from pathlib import Path

SRC = 'https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/'
OUT = Path(__file__).resolve().parent.parent / 'data' / 'sky.json'
MAG_LIMIT = 5.5      # slabší hvězdy vynecháme (kromě těch v obrazcích)
NAMED_MAG = 2.3      # vlastní jména jen u jasných hvězd
STEP = 1.0           # zhuštění hranic po 1° (hranice vedou po rovnoběžkách/poledníkech)
GROUPS = ['obtočná', 'zimní', 'jarní', 'letní', 'podzimní', 'jižní']
CIRCUMPOLAR = {'UMa', 'UMi', 'Cas', 'Cep', 'Dra', 'Cam'}   # z Prahy nikdy nezapadají (aspoň hlavní obrazec)
CZ_FIX = {'UMi': 'Malá medvědice', 'Cha': 'Chameleon'}
STAR_CZ = {'Sirius': 'Sírius', 'Capella': 'Kapella', 'Arcturus': 'Arktur', 'Betelgeuse': 'Betelgeuze',
           'Spica': 'Spika', 'Castor': 'Kastor', 'Polaris': 'Polárka', 'Alphard': 'Alfard'}


def fetch(name):
    with urllib.request.urlopen(SRC + name) as r:
        return json.load(r)


def ra360(ra):
    return round(ra % 360, 2)


def group(id_, ra, top_dec):
    """Skupina dle viditelnosti z ČR (50° s. š.) a ročního období, kdy je souhvězdí večer na jihu."""
    if top_dec < -30:   # ani nejsevernější hvězda obrazce nevystoupí nad ~10°
        return 'jižní'
    if id_ in CIRCUMPOLAR:
        return 'obtočná'
    return ['podzimní', 'zimní', 'jarní', 'letní', 'podzimní'][bisect([3.5, 8.3, 14.8, 21.5], ra / 15)]


def densify(ring):
    out = []
    for (a1, d1), (a2, d2) in zip(ring, ring[1:] + ring[:1]):
        da = (a2 - a1 + 180) % 360 - 180          # kratší cesta přes 0h
        n = max(1, math.ceil(max(abs(da), abs(d2 - d1)) / STEP))
        out += [[ra360(a1 + da * k / n), round(d1 + (d2 - d1) * k / n, 2)] for k in range(n)]
    return out


def main():
    stars = [(f['id'], *f['geometry']['coordinates'], f['properties']['mag'], f['properties']['bv'])
             for f in fetch('stars.6.json')['features']]
    names = fetch('starnames.json')

    def nearest(ra, dec):
        cd = math.cos(math.radians(dec))
        return min(range(len(stars)),
                   key=lambda i: (((stars[i][1] - ra + 180) % 360 - 180) * cd) ** 2 + (stars[i][2] - dec) ** 2)

    cons = {}
    for f in fetch('constellations.json')['features']:
        p = f['properties']
        cons.setdefault(f['id'], {
            'id': f['id'], 'la': p['name'], 'cz': CZ_FIX.get(f['id'], p['cz'].replace(' ', ' ')),
            'gen': p['gen'], 'rank': int(p['rank']), 'c': [ra360(f['geometry']['coordinates'][0]),
                                                          f['geometry']['coordinates'][1]],
            'lines': [], 'bounds': []})
    for f in fetch('constellations.lines.json')['features']:
        cons[f['id']]['lines'] += [[nearest(*pt) for pt in line] for line in f['geometry']['coordinates']]
    for f in fetch('constellations.bounds.json')['features']:
        g = f['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        cons[f['id']]['bounds'] += [densify(poly[0][:-1] if poly[0][0] == poly[0][-1] else poly[0]) for poly in polys]

    # Ponecháme jasné hvězdy a hvězdy obrazců, přečíslujeme indexy.
    used = {i for c in cons.values() for line in c['lines'] for i in line}
    keep = [i for i, s in enumerate(stars) if s[3] <= MAG_LIMIT or i in used]
    new = {old: k for k, old in enumerate(keep)}
    for c in cons.values():
        c['group'] = group(c['id'], c['c'][0], max(stars[i][2] for line in c['lines'] for i in line))
        c['lines'] = [[new[i] for i in line] for line in c['lines']]

    star_names = []
    for k, i in enumerate(keep):
        n = names.get(str(stars[i][0]), {})
        if n.get('name') and stars[i][3] < NAMED_MAG:
            star_names.append([k, STAR_CZ.get(n['name'], n['name']), n['c']])

    OUT.write_text(json.dumps({
        'groups': GROUPS,
        'stars': [[ra360(s[1]), s[2], s[3], round(float(s[4] or .6), 1)] for s in (stars[i] for i in keep)],
        'names': star_names,
        'cons': list(cons.values()),
    }, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{OUT}: {len(keep)} hvězd, {len(cons)} souhvězdí, {OUT.stat().st_size // 1024} kB')


if __name__ == '__main__':
    main()
