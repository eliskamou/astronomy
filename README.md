# Souhvězdí

Výuková aplikace ke kurzu astronomie: všech 88 souhvězdí česky i latinsky.

- **Výuka:** atlas s obrazci, hranicemi a jasnými hvězdami. Seznam je rozdělený na obtočná, zimní, jarní, letní, podzimní a jižní souhvězdí, jako v sylabu kurzu Planetária Praha.
- **Obloha v čase:** celá obloha nad Prahou pro libovolné datum a čas. Animace ukazují otáčení oblohy během noci a střídání souhvězdí během roku. Den se mění podle polohy Slunce.
- **Test:** rozložené opakování (zjednodušené SM-2). Známka se odvozuje ze správnosti a z toho, jak rychle odpovíš. Úrovně:
  1. *Obrazec*: jen hvězdy a čáry jednoho souhvězdí.
  2. *Mapa*: hvězdná mapa s obrazci a hranicemi. Úkolem je pojmenovat zvýrazněné souhvězdí nebo na hledané kliknout.
  3. *Obloha z ČR*: noční obloha z Prahy v náhodný den a hodinu, bez čar. Úkolem je pojmenovat souhvězdí v kroužku nebo ho najít. Odpovídá papírovým testům s „holou“ mapou oblohy.

## Spuštění

```sh
python3 -m http.server 8000   # v této složce
```
a otevři <http://localhost:8000>. Pokrok se ukládá v prohlížeči (localStorage).

**Na telefonu:** stejný server je vidět i z mobilu ve stejné Wi-Fi na adrese `http://<IP-adresa-Macu>:8000`. IP adresu Macu zjistíš příkazem `ipconfig getifaddr en0`. Rozložení se přizpůsobí šířce displeje: mapa je nahoře, otázka hned pod ní a v atlasu funguje zoom dvěma prsty. Přes „Přidat na plochu“ se aplikace otevírá jako samostatná app. Pokrok na telefonu je oddělený od pokroku na notebooku.

## Data

`data/sky.json` vytváří `python3 tools/build_data.py` z katalogu [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3, © Olaf Frohn): hvězdy do 5,5 mag, obrazce, hranice IAU a české názvy.

## Struktura

| soubor | obsah |
|---|---|
| `js/app.js` | načtení dat, přepínání módů, atlas a obloha v čase |
| `js/quiz.js` | testovací mód |
| `js/srs.js` | plánování opakování |
| `js/render.js` | kreslení oblohy (stereografická projekce) a klikání |
| `js/astro.js` | souřadnice, hvězdný čas, Slunce |
| `js/util.js` | drobné pomocné funkce |
