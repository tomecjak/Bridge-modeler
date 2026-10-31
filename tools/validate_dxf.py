"""Kontrola DXF z aplikácie cez ezdxf (audit štruktúry, handle, odkazov a tabuliek).

Použitie:
    python3 -m venv tools/.venv && tools/.venv/bin/pip install ezdxf
    tools/.venv/bin/python tools/validate_dxf.py súbor.dxf [...]

Vráti nenulový kód, ak ezdxf súbor nenačíta alebo audit nájde chyby. Je to len vývojový nástroj, nie runtime
závislosť aplikácie (ADR 0012); otvorenie v AutoCADe overuje projektant.
"""

import sys

import ezdxf
from ezdxf import recover


def check(path: str) -> bool:
    try:
        doc, auditor = recover.readfile(path)
    except (IOError, ezdxf.DXFStructureError) as e:
        print(f"CHYBA  {path}: {e}")
        return False
    # opravy pri načítaní (recover) aj pri audite znamenajú, že AutoCAD by súbor mohol odmietnuť
    audit = doc.audit()
    fixes = auditor.fixes + audit.fixes
    errors = auditor.errors + audit.errors
    ok = not errors and not fixes
    layers = sorted(layer.dxf.name for layer in doc.layers)
    entities = len(doc.modelspace())
    print(
        f"{'OK    ' if ok else 'CHYBA '} {path}: {doc.dxfversion}, $INSUNITS={doc.header.get('$INSUNITS')}, "
        f"{entities} entít, hladiny {', '.join(layers)}; opravy {len(fixes)}, chyby {len(errors)}"
    )
    for e in errors:
        print(f"        chyba: {e.message}")
    for f in fixes:
        print(f"        oprava: {f.message}")
    return ok


if __name__ == "__main__":
    results = [check(p) for p in sys.argv[1:]]
    sys.exit(0 if results and all(results) else 1)
