-- Firemná knižnica prierezov (ADR 0015): jeden riadok = jedna položka LibraryEntry (ADR 0013).
CREATE TABLE profile_library (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  typology TEXT,
  description TEXT,
  -- ProfileDefinition ako JSON, overený LibraryEntrySchema pred zápisom
  profile TEXT NOT NULL,
  -- zvyšuje sa pri každej zmene; uloženie s inou očakávanou verziou sa odmietne (409)
  version INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX profile_library_name ON profile_library (name COLLATE NOCASE);
