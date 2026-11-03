# 0025 — Pracovná plocha bez ribbonu: lišta nástrojov, 2D výkresy a samostatné okná

- Stav: Prijaté (nahrádza časť ADR 0016 o ribbone a kartách pohľadov)
- Dátum: 2026-11-03

## Kontext

Projektant si odsúhlasil nový návrh rozhrania (plátno „Modelér mostov — dizajn“). Ribbon v štýle Revitu
(ADR 0016) zaberal veľa miesta. Karty pohľadov 3D / 2D / Prierez / Parametre / Kontroly rozdeľovali prácu,
ktorú projektant chce vidieť naraz. Prehliadač projektu vľavo a vlastnosti vpravo ostávajú (ADR 0016).

## Rozhodnutie

- **Horná lišta**:
  - logo a názov projektu,
  - Nový / Otvoriť / Uložiť, späť / znova,
  - pole „Prejsť na km“,
  - menu Export (DXF, SVG, STEP),
  - hlavné tlačidlo Importovať LandXML,
  - prepínač témy (ADR 0024).
- **Lišta nástrojov nad pohľadmi** namiesto ribbonu:
  - prepínač **3D | 2D výkresy**,
  - za ním skupiny ikon s popisom v tooltipe.
  - Dátový model nástrojov (`ribbonTabs`, `contextualTab`, `placementTab`) sa nemení.
  - Kontextová karta vybraného prvku sa zobrazí ako zvýraznený riadok s popismi pod lištou.
  - Čo sa zobrazí, rozhoduje čistá funkcia `visibleItems`:
    - nastavenia pôdorysu a profilu len v 2D, prepínače scény len v 3D;
    - výbery podkladu a osi profilu sú vo vlastnostiach pohľadu;
    - „Prejsť na“ a import sú v hornej lište.
- **2D výkresy**: pôdorys hore; pod ním vedľa seba pozdĺžny rez a priečny rez na staničení s posuvníkom.
  Vlastnosti pohľadu 2D obsahujú aj výsledky prierezu.
- **Samostatné okná** (`AppWindow`) nad pracovnou plochou. Zmeny sa ukladajú priebežne do modelu, okno len
  zatvára pohľad.
  - **Editor prierezu**: nástroje kontextovej karty v hlavičke, vlastnosti prierezu vpravo v okne.
    Esc okno nezatvára, patrí nástrojom.
  - **Parametre a staničné funkcie**: tabuľka vľavo, editor vybraného parametra vpravo.
  - Tlačidlom v hlavičke sa okno presunie do samostatného okna prehliadača (napr. na druhý monitor).
    Portál React do nového dokumentu so skopírovanými štýlmi a témou; pracovná plocha ostane voľná.
    Zatvorenie jedného zavrie aj druhé.
  - Stav `ViewMode` ostáva. `section` (s upravovaným prierezom) a `parameters` sú okná nad posledným
    pohľadom 3D / 2D.
- **Kontroly** sú v pravom paneli namiesto vlastností:
  - súhrn chýb, upozornení a skupín bez problémov;
  - problémy ako karty po skupinách; klik vyberie prvok, dvojklik ho ukáže.
  - Otvárajú sa odkazom pod prehliadačom projektu alebo zo stavového riadka.
- **Prázdny projekt** (2D bez osi): plocha na pustenie LandXML, otvorenie projektu a karty ďalších podkladov.
- **Ikony** sú prekreslené v jednom štýle:
  - mriežka 24 × 24, ťah 1,5 px;
  - mostné prvky sú dvojtónové: prvok plnou farbou, okolie (NK, zem, podpera) na 38 %.

## Dôsledky

- Pohľady majú viac plochy, 2D zobrazuje pôdorys, profil aj rez naraz.
- Pridanie nástroja ostáva: položka v `appRibbon.tsx` + stav v `App.tsx`. Ak sa nemá zobrazovať v lište,
  pridá sa jej id do `Toolbar.tsx`.
- Komponent `Ribbon` je odstránený, `Ribbon.tsx` drží len dátové typy.
- Samostatné okno prehliadača nesleduje zmenu témy po otvorení a pri vývoji (HMR) nedostane nové štýly.
  Stačí ho zavrieť a otvoriť znova.
