import type { SupportLibraryEntry } from '@bridge/model';
import { builtinSupportLibrary } from '@bridge/sections';
import { useEffect, useMemo, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import {
  type CloudLibrary,
  cloudSupportLibrary,
  detectCloud,
} from '../persistence/cloudLibrary.ts';
import type { SupportSource } from '../store/supportTypes.ts';

/**
 * Zdroje typov podpier (ADR 0019): zabudované šablóny, firemná knižnica (Worker + D1, ak beží), podpery projektu
 * a importovaný súbor. Zdieľa ich karta nástroja Podpera, Rozloženie polí a dialóg Knižnica podpier.
 */
export function useSupportSources(projectEntries: readonly SupportLibraryEntry[]) {
  const t = sk.supportLibrary.sources;
  const builtin = useMemo(() => builtinSupportLibrary(t.builtin), [t.builtin]);
  const [builtinEntries, setBuiltinEntries] = useState<SupportLibraryEntry[]>([]);
  const [cloud, setCloud] = useState<{
    email: string;
    library: CloudLibrary<SupportLibraryEntry>;
  }>();
  const [cloudEntries, setCloudEntries] = useState<SupportLibraryEntry[]>([]);
  const [cloudError, setCloudError] = useState<string>();
  const [file, setFile] = useState<{ name: string; entries: SupportLibraryEntry[] }>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    void builtin.list().then(setBuiltinEntries);
  }, [builtin]);

  useEffect(() => {
    let alive = true;
    void detectCloud().then((who) => {
      if (alive && who) setCloud({ email: who.email, library: cloudSupportLibrary() });
    });
    return () => {
      alive = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revízia vyvolá nové načítanie po zmene
  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    cloud.library
      .list()
      .then((entries) => {
        if (alive) setCloudEntries(entries);
      })
      .catch((e: unknown) => setCloudError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [cloud, revision]);

  const sources = useMemo(
    (): SupportSource[] => [
      { key: 'builtin', title: t.builtin, entries: builtinEntries },
      ...(cloud
        ? [{ key: 'cloud' as const, title: t.cloud(cloud.email), entries: cloudEntries }]
        : []),
      { key: 'project', title: t.project, entries: projectEntries },
      ...(file ? [{ key: 'file' as const, title: t.file(file.name), entries: file.entries }] : []),
    ],
    [t, builtinEntries, cloud, cloudEntries, projectEntries, file],
  );

  return {
    sources,
    cloud,
    cloudError,
    setCloudError,
    file,
    setFile,
    /** po zmene vo firemnej knižnici načíta zoznam znova */
    refresh: () => setRevision((r) => r + 1),
  };
}

export type SupportSources = ReturnType<typeof useSupportSources>;
