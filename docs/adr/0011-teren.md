# 0011 — Terén: uloženie, zdroje a súradnice

- Stav: Prijaté
- Dátum: 2026-10-31

## Kontext

Fáza 5b pridáva terén: povrch z Civil 3D (LandXML `Surface`, TIN) a DMR 5.0 z ÚGKK (GeoTIFF raster). Terén slúži
na zobrazenie mosta v teréne (3D) a na terénnu čiaru v pozdĺžnom a priečnom reze. Povrchy môžu mať milióny bodov,
projekt je jeden JSON súbor (ADR 0002, 0005) a výstupy musia byť deterministické (princíp 7).

## Rozhodnutie

Rozhodnutia projektanta z 2026-10-31.

**Uloženie v projekte, orezané na koridor.** Pri importe sa povrch oreže na koridor okolo osi cesty (pás `halfWidth`
v rozsahu NK na osi ± `margin`; bez NK celá os) a uloží do projektu (`terrains`, schéma v5):
- TIN: body `x, y, z` za sebou a trojice indexov; zachová sa poradie bodov zo súboru, nepoužité sa vynechajú;
- mriežka rastra: stred bunky [0, 0], krok `dx`, `dy` a súvislé úseky riadkov vnútri koridoru (`row`, `col`, `z[]`);
  bunky bez dát (nodata) sa vynechajú.

Súradnice sú lokálne (ADR 0003) a zaokrúhlené na 1 mm → rovnaký súbor dá rovnaký projekt a projekt ostáva malý
(DMR s krokom 1 m v koridore 300 × 200 m ≈ 60 tis. výšok ≈ 0,5 MB). Pôvodný súbor sa neukladá; pri zmene koridoru
treba terén importovať znova.

**Výpočty** (`packages/terrain`): mriežka sa pri načítaní prevedie na TIN (dva trojuholníky na bunku, uhlopriečka
z ľavého dolného do pravého horného rohu), takže výška v bode aj rezy majú jednu implementáciu. Výška je lineárna
na trojuholníku; mimo povrchu je `undefined`, rez sa tam preruší.

**GeoTIFF cez geotiff.js** — vlastné čítanie TIFF (dlaždice, prediktory, kompresie LZW / Deflate / ZSTD / LERC)
by bolo prácne a krehké; geotiff.js je štandard v prehliadači aj v Node a číta len okno rastra (obálku koridoru).

| Balík | Kde | Dôvod | Licencia | Veľkosť |
|---|---|---|---|---|
| `geotiff` 3.0.5 | packages/terrain, v aplikácii lenivo pri importe GeoTIFF | čítanie GeoTIFF (okno, nodata, GeoKeys) | MIT | doplní sa po buildu (lenivý chunk) |

**Súradnicové systémy.** DMR 5.0 je v S-JTSK (JTSK03, EPSG:8353), podklady z Civil 3D v S-JTSK (JTSK, EPSG:5514).
Rozdiel sa zanedbáva a oba sa berú ako EPSG:5514. Import prijme kód 5514, 8353 alebo raster bez kódu so zápornými
súradnicami; kladné súradnice (klasické S-JTSK) sú typovaná chyba ako pri osi.

## Dôsledky

- Projekt s terénom je väčší; worker 3D sietí terén nedostáva (kopírovanie pri každej zmene by bolo drahé),
  sieť terénu sa zostaví v hlavnom vlákne len pri jeho zmene.
- Import beží v hlavnom vlákne; pri veľmi veľkých LandXML (desiatky MB) môže na chvíľu zamrznúť — presun do workera,
  ak to bude prekážať.
- Ak sa ukáže, že rozdiel JTSK03 – JTSK v mieste stavby nie je zanedbateľný, doplní sa posun pri importe.
