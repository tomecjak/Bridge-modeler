# Inbox — podklady od Jakuba

Sem hádž všetko, čo má Claude Code spracovať: LandXML z Civil 3D, CSV kontrolné body, výkresy
(PDF/DWG/DXF), štandard hladín, poznámky. Názvy a štruktúra sú ľubovoľné.

Postup: Claude súbor prezrie, zistené fakty (súradnicový systém, jednotky, konvencie uhlov) zapíše
do `PLAN.md` alebo ADR a dáta potrebné pre golden testy skopíruje do príslušného podadresára
`fixtures/<oblasť>/` so záznamom v `SOURCES.md`. Testy čítajú len z `fixtures/<oblasť>/`, nikdy z inboxu.
