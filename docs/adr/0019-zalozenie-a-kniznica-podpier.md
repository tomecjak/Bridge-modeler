# 0019 — Založenie podpier, ložiská z prierezu a knižnica podpier

- Stav: Prijaté
- Dátum: 2026-11-01
- Dopĺňa: ADR 0008, ADR 0015

## Kontext

Podľa ADR 0008 má podpera kótu hornej hrany základu (`foundationTop`) a terén jej výšku neovplyvňuje. Nová podpera
dostane kótu odhadom z nivelety a ložiská pevne ±1,8 m. Typ podpery sa dá prevziať len z inej podpery projektu.
Projektant to chce inak:
- založenie predvolene pod terénom, krytie 0,5 m pri pilieroch, inak výška podpery alebo kóta základovej škáry
  (rozhodnutie 2026-10-31, odpoveď 9);
- ložiská odvodené od prierezu NK v 1/4 šírky spodnej plochy (odpoveď 20);
- jednoduché firemné typy podpier na vizuálny návrh (2026-10-31).

3D worker a worker presného modelu terén zámerne nedostávajú, lebo jeho kopírovanie pri každej zmene je drahé
(ADR 0011).

## Rozhodnutie

Rozhodnutia projektanta z plan mode 10e (2026-11-01).

**Založenie** (`Support.foundation`, nahrádza `foundationTop`):

| Režim | Pole | Horná hrana základu |
|---|---|---|
| `terrain` | `cover` — krytie [m] | terén v strede podpery − krytie |
| `height` | `height` — výška podpery [m] | horná hrana podpery pod najnižším ložiskom − výška |
| `level` | `level` — kóta základovej škáry [m n. m.] | kóta + hrúbka základu (bez základu = spodok podpery) |

- Stred podpery je bod na osi uloženia posunutý o `offset`.
- Všetky polia sú v objekte vždy, takže prepnutie režimu nestratí hodnoty.
- Nový pilier je v režime `terrain` s krytím 0,5 m. Nová opora je v režime `height`, lebo pri opore volí založenie
  projektant (plošné alebo hlbinné).
- Bez terénu v strede podpery platí dočasné pravidlo (pilier 8 m pod spodkom NK, opora 5 m pod ním) s upozornením.
- Horná hrana základu nad terénom v strede podpery dá upozornenie.

**Terén v strede podpery** (`foundation.terrain`, m n. m.):
- aplikácia ho po každom príkaze zosúladí s terénom projektu a zapíše do modelu v tom istom kroku späť, rovnako ako
  konce NK (ADR 0018);
- pri viacerých povrchoch sa berie najvyšší v bode;
- chýba, ak bod leží mimo terénu;
- vyhodnotenie podpery (3D, výkresy, IFC) terén nepotrebuje a číta uloženú hodnotu.

**Ložiská z prierezu NK:**
- spodné plochy sa hľadajú na hlavnom priereze NK na staničení osi uloženia (bez priečnika): hrany vonkajšieho
  obrysu otočené nadol, viditeľné zdola a ležiace na priamke najnižšej z nich (konzoly a nábehy vypadnú);
- jedna spodná plocha → dve ložiská v 1/4 šírky od okrajov;
- viac spodných plôch (trámy) → jedno ložisko pod stredom každej;
- šírka sa meria vodorovne, polohy sa zaokrúhlia na mm;
- použijú sa pri vložení podpery a na požiadanie („Podľa prierezu NK“).

**Typ podpery a knižnica:**
- typ = druh, geometria, základ, uloženie, výška uloženia a založenie (režim, krytie, výška), bez ložísk, posunu
  a terénu;
- vloží sa ako kópia: ložiská z prierezu NK, opora dostane dĺžku podľa šírky NK, stĺpy s počtom rovným počtu
  ložísk dostanú ich osovú vzdialenosť;
- podpera v režime `level` sa uloží ako typ v režime `height` s jej aktuálnou výškou, lebo kóta platí len na
  jednom mieste;
- súbor `{ format: 'bridge-modeler/support-library', version: 1, entries }`, položka
  `{ id, name, kind, description?, support }`;
- rozhranie `Library<E>` je spoločné pre prierezy a podpery (ADR 0013);
- zdroje: zabudované šablóny, firemná knižnica, podpery projektu, súbor;
- typ sa vyberá v kontextovej karte nástroja Podpera (zvlášť pre pilier a oporu) a v Rozložení polí.

**Firemná knižnica v D1** (doplnok ADR 0015):
- tabuľka `support_library` s rovnakými pravidlami ako `profile_library` (verzia, `409` pri nesúhlase, autori);
- API `/api/support-library[/:id]`.

**Súbor:** schéma v10. Migrácia 9 → 10 nastaví režim `level` s kótou `foundationTop − footing.thickness` (pri
výrazoch vznikne výraz), krytie 0,5 a výšku 8 m (pilier) / 4 m (opora). Geometria sa nezmení.

## Dôsledky

- Posun piliera alebo nový terén posunie jeho základ bez ďalšieho zásahu. Výška podpery sa od terénu odvíja, čo
  mení rozhodnutie „Terén a podpery“ z Fázy 5b.
- Model obsahuje odvodenú hodnotu terénu. Súbor je vždy konzistentný a výstupy ju nemusia počítať.
- Založenie sa posudzuje len v strede podpery. Na priečnom svahu môže časť základu vytŕčať bez upozornenia.
- Rozmery zabudovaných šablón sú zástupné, kým ich projektant nepotvrdí.
