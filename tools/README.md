# Pomocné skripty

Skripty mimo bežného TypeScript buildu, napr. validácia IFC cez IfcOpenShell (Python) — pribudne vo Fáze 7
(`validate_ifc.py`).

- `src/drawing-samples.ts` (`pnpm drawings:samples [adresár]`): vzorové výkresy mosta 212-00 (pôdorys v S-JTSK,
  pozdĺžny a priečny rez) ako DXF a SVG, predvolene do `fixtures/local/drawings/` (neverzuje sa).
- `validate_dxf.py`: kontrola DXF cez ezdxf (ADR 0012):
  `python3 -m venv tools/.venv && tools/.venv/bin/pip install ezdxf`, potom
  `tools/.venv/bin/python tools/validate_dxf.py fixtures/local/drawings/*.dxf`.
