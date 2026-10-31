import type { LibraryEntry, ProfileLibrary } from '@bridge/model';
import { builtinProfileLibrary } from '@bridge/sections';
import { useEffect, useMemo, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { cloudProfileLibrary, detectCloud } from '../persistence/cloudLibrary.ts';
import { projectProfileLibrary } from '../store/profileLibrary.ts';
import { projectStore, useProject } from '../store/projectStore.ts';

export type SourceKey = 'builtin' | 'cloud' | 'project' | 'file';
export type CloudLibrary = ReturnType<typeof cloudProfileLibrary>;

/**
 * Zdroje prierezov (Fáza 8b, 9, 10a): zabudované šablóny, firemná knižnica (Worker + D1, ak beží), prierezy
 * projektu a voliteľne importovaný súbor. Zdroje sú za rozhraním `ProfileLibrary` a načítajú sa asynchrónne.
 */
export function useProfileSources(file?: { name: string; library: ProfileLibrary }) {
  const profiles = useProject((s) => s.project.profiles);
  const builtin = useMemo(() => builtinProfileLibrary(sk.library.sources.builtin), []);
  const project = useMemo(
    () => projectProfileLibrary(projectStore, sk.library.sources.project),
    [],
  );
  const [entries, setEntries] = useState<Record<SourceKey, LibraryEntry[]>>({
    builtin: [],
    cloud: [],
    project: [],
    file: [],
  });
  /** firemná knižnica (ADR 0015), ak beží Worker s API; inak sa zdroj nezobrazí */
  const [cloud, setCloud] = useState<{ email: string; library: CloudLibrary }>();
  const [cloudError, setCloudError] = useState<string>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    void detectCloud().then((who) => {
      if (alive && who) setCloud({ email: who.email, library: cloudProfileLibrary() });
    });
    return () => {
      alive = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: prierezy projektu a revízia vyvolajú nové načítanie
  useEffect(() => {
    let alive = true;
    const cloudList = cloud
      ? cloud.library.list().catch((e: unknown) => {
          setCloudError(e instanceof Error ? e.message : String(e));
          return [];
        })
      : [];
    void Promise.all([builtin.list(), cloudList, project.list(), file?.library.list() ?? []]).then(
      ([b, c, p, f]) => {
        if (alive) setEntries({ builtin: b, cloud: c, project: p, file: f });
      },
    );
    return () => {
      alive = false;
    };
  }, [builtin, project, file, profiles, cloud, revision]);

  const sources: { key: SourceKey; title: string }[] = [
    { key: 'builtin', title: sk.library.sources.builtin },
    ...(cloud ? [{ key: 'cloud' as const, title: sk.library.sources.cloud(cloud.email) }] : []),
    { key: 'project', title: sk.library.sources.project },
    ...(file ? [{ key: 'file' as const, title: sk.library.sources.file(file.name) }] : []),
  ];

  return {
    entries,
    sources,
    cloud,
    cloudError,
    setCloudError,
    /** po zmene vo firemnej knižnici načíta zdroje znova */
    refresh: () => setRevision((r) => r + 1),
  };
}
