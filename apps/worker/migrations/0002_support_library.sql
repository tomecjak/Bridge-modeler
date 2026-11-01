-- Firemná knižnica podpier (ADR 0019): jeden riadok = jedna položka SupportLibraryEntry, pravidlá ako
-- profile_library (verzia, 409 pri nesúhlase, autori).
CREATE TABLE support_library (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- druh podpery z typu (abutment / pier), na filtrovanie
  kind TEXT NOT NULL,
  description TEXT,
  -- SupportType ako JSON, overený SupportLibraryEntrySchema pred zápisom
  support TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX support_library_name ON support_library (name COLLATE NOCASE);
