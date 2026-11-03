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
  - **Kontroly**: tabuľka; dvojklik zatvorí okno a ukáže prvok.
  - Stav `ViewMode` ostáva. `section` (s upravovaným prierezom), `parameters` a `checks` sú okná nad
    posledným pohľadom 3D / 2D.
- **Ikony** sú prekreslené v jednom štýle:
  - mriežka 24 × 24, ťah 1,5 px;
  - mostné prvky sú dvojtónové: prvok plnou farbou, okolie (NK, zem, podpera) na 38 %.

## Dôsledky

- Pohľady majú viac plochy, 2D zobrazuje pôdorys, profil aj rez naraz.
- Pridanie nástroja ostáva: položka v `appRibbon.tsx` + stav v `App.tsx`. Ak sa nemá zobrazovať v lište,
  pridá sa jej id do `Toolbar.tsx`.
- Komponent `Ribbon` je odstránený, `Ribbon.tsx` drží len dátové typy.
- Otvorené:
  - otvorenie okna v samostatnom okne prehliadača (druhý monitor) zatiaľ nie je;
  - kontroly v pravom paneli namiesto okna podľa návrhu sú možné neskôr.
