# Návod: kontrolné body osi z Civil 3D

Kontrolné body slúžia na golden testy výpočtu osi (Fáza 1). Pre každý bod potrebujem staničenie,
E, N, Z a smerník a výpočet sa s nimi musí zhodovať na ≤ 1 mm a ≤ 1e-5 rad. Exportuj ich z toho
istého výkresu a tej istej osi (101-00) ako `Trasa LandXML.xml`.

Názvy menu sú z anglického Civil 3D 2024. Ak sa niečo volá trochu inak, nevadí — dôležitý je obsah
a presnosť stĺpcov v kroku 1.

## 1. Nastav presnosť a smerník

**Settings** → pravým na výkres → **Edit Drawing Settings…** → záložka **Ambient Settings**:

| Skupina | Nastavenie | Hodnota |
|---|---|---|
| Coordinate | Precision | **4** |
| Station | Precision | **4** |
| Elevation | Precision | **4** |
| Direction | Unit | Degree |
| Direction | Format | **Decimal** (DD.DDDD) |
| Direction | Precision | **8** |
| Direction | Measurement Type | **North Azimuth** |
| Grade/Slope | Precision | 6 |

Bez toho výkaz zaokrúhli súradnice na cm a smerník na sekundy, čo na test s toleranciou 1 mm nestačí.
Výkres po exporte neukladaj, ak nechceš tieto nastavenia ponechať.

## 2. Výkaz osi v pravidelnom kroku

**Toolbox** (Home → Palettes → Toolbox) → **Reports Manager** → **Alignment** →
**Incremental_Station_Report** → pravým → **Execute…**

- os: **101-00**
- rozsah: celá os (od −7 724,35 do 4 802,90)
- krok (Station Increment): **10 m**
- formát: XLS, CSV alebo HTML — čokoľvek z toho

Výkaz má obsahovať staničenie, Northing, Easting a smer dotyčnice (Tangential Direction).

## 3. Výkaz geometrických bodov osi

Rovnaký postup, výkaz **Alignment → Station_and_Curve_Report** (alebo PI_Station_Report).
Potrebujem z neho staničenia, súradnice a smery na **stykoch prvkov** (TS, SC, CS, ST, PC, PT,
aj styky prechodnica–prechodnica). Práve tam sa najčastejšie prejaví chyba vo výpočte klotoidy.

## 4. Výkaz nivelety

**Reports Manager** → **Profile** → **Incremental_Station_Report** (ak ho tam nemáš, tak
**PVI_Station_and_Curve** a pošli oba, ktoré nájdeš).

- niveleta: **Niveleta-101-00**
- rozsah: −1 296,65 až 4 802,90 (celá niveleta)
- krok: **10 m**

Výkaz má obsahovať staničenie, výšku a sklon.

## 5. Ulož do inboxu

Súbory ulož do `fixtures/inbox/` **tak, ako ich Civil vygeneroval** — needituj ich, neprepisuj
stĺpce ani nekopíruj čísla ručne. Zvyšok (prevod na CSV pre testy) urobím ja.

Pripíš k nim (stačí do správy v chate):
- ktorý výkres a os (napr. `101-00_Koridor.dwg`, 101-00) a dátum exportu,
- či si v kroku 1 nastavil **North Azimuth** (ak nie, aký typ smeru výkaz obsahuje).

## Ak výkazy nejdú

Náhradné riešenie: **Home → Points → Point Creation Tools → Alignments → Measure alignment**
(krok 10 m) a **At Geometry Points**, potom body exportuj cez **Export Points** vo formáte PENZD
(comma delimited). Pri bodoch na niveletu (výšky) použi **Profile Geometry Points** alebo bodom
priraď výšku z nivelety. Smerník v tomto exporte chýba — test vtedy overí polohu a výšku a smer
skontrolujem len nepriamo (zo susedných bodov); napíš mi, ak to tak bude.
