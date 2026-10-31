import { formatStation } from '@bridge/alignment';
import type { ProjectFile } from '@bridge/model';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import type { IconName } from '../icons/Icon.tsx';
import type { ElementCollection } from './commands.ts';

/** Pohľad aplikácie (zhodné s `ViewMode` vo `Viewport`). */
export type BrowserView = '3d' | '2d' | 'section' | 'parameters';

/** Čo vyberie klik na položku prehliadača. */
export type BrowserTarget =
  | { type: 'view'; mode: BrowserView }
  | { type: 'alignment'; index: number }
  | { type: 'element'; collection: ElementCollection; id: string }
  | { type: 'studyArea' }
  | { type: 'parameter'; id: string };

export interface BrowserNode {
  /** stabilný kľúč (zbalenie, výber) */
  key: string;
  label: string;
  /** doplnková informácia za názvom (druh podpery, staničenie, polia) */
  detail?: string;
  icon: IconName;
  /** počet chýb prvku (odznak) */
  issues?: number;
  target?: BrowserTarget;
  /** prvok sa dá premenovať a odstrániť z kontextového menu */
  editable?: boolean;
  children?: BrowserNode[];
}

export interface BrowserInput {
  project: Pick<
    ProjectFile,
    | 'alignments'
    | 'bridgeAxes'
    | 'superstructures'
    | 'supports'
    | 'profiles'
    | 'terrains'
    | 'planLines'
    | 'parameters'
    | 'studyArea'
  >;
  /** počty chýb: os podľa názvu, prvok podľa id, parameter podľa názvu */
  issues: {
    alignment: (name: string) => number;
    element: (id: string) => number;
    parameter: (name: string) => number;
  };
  /** dĺžky polí NK [m] podľa id NK */
  spans: ReadonlyMap<string, readonly number[]>;
  /** pohľady v poradí kariet */
  views: readonly { mode: BrowserView; label: string }[];
}

const VIEW_ICONS: Record<BrowserView, IconName> = {
  '3d': 'cube',
  '2d': 'plan',
  section: 'section',
  parameters: 'parameters',
};

const element = (collection: ElementCollection, id: string): BrowserTarget => ({
  type: 'element',
  collection,
  id,
});

const withIssues = (node: BrowserNode, issues: number): BrowserNode =>
  issues > 0 ? { ...node, issues } : node;

/**
 * Strom prehliadača projektu (ADR 0016): pohľady, model hierarchicky (os cesty → os mosta → NK → podpery podľa
 * staničenia, oblasť mosta), podklady, prierezy a parametre. Prvky s neplatným odkazom sú v skupine Nepriradené.
 */
export function browserTree(input: BrowserInput): BrowserNode[] {
  const { project, issues, spans } = input;
  const t = sk.browser;

  const supportNode = (id: string): BrowserNode | undefined => {
    const s = project.supports.find((x) => x.id === id);
    if (!s) return undefined;
    return withIssues(
      {
        key: `supports:${s.id}`,
        label: s.name,
        detail: `${sk.supports.kinds[s.kind]} · ${formatStation(s.station, 3)}`,
        icon: s.kind === 'abutment' ? 'abutment' : 'pier',
        target: element('supports', s.id),
        editable: true,
      },
      issues.element(s.id),
    );
  };

  const deckNode = (id: string): BrowserNode | undefined => {
    const d = project.superstructures.find((x) => x.id === id);
    if (!d) return undefined;
    const profile = project.profiles.find((p) => p.id === d.profile)?.name;
    const lengths = spans.get(d.id) ?? [];
    const detail = [
      profile,
      lengths.length > 0 ? lengths.map((l) => formatNumber(l, 2)).join(' + ') : undefined,
    ]
      .filter((x) => x !== undefined)
      .join(' · ');
    const children = project.supports
      .filter((s) => s.superstructure === d.id)
      .sort((a, b) => a.station - b.station)
      .flatMap((s) => supportNode(s.id) ?? []);
    return withIssues(
      {
        key: `superstructures:${d.id}`,
        label: d.name,
        ...(detail ? { detail } : {}),
        icon: 'deck',
        target: element('superstructures', d.id),
        editable: true,
        children,
      },
      issues.element(d.id),
    );
  };

  const axisNode = (id: string): BrowserNode | undefined => {
    const a = project.bridgeAxes.find((x) => x.id === id);
    if (!a) return undefined;
    return {
      key: `bridgeAxes:${a.id}`,
      label: a.name,
      icon: 'axis',
      target: element('bridgeAxes', a.id),
      editable: true,
      children: project.superstructures
        .filter((d) => d.bridgeAxis === a.id)
        .sort((x, y) => x.from - y.from)
        .flatMap((d) => deckNode(d.id) ?? []),
    };
  };

  const area = project.studyArea;
  const model: BrowserNode[] = project.alignments.flatMap((road, index) => {
    const axes = project.bridgeAxes.filter((a) => a.alignment === road.name);
    const hasArea = area?.alignment === road.name;
    if (axes.length === 0 && !hasArea) return [];
    const children: BrowserNode[] = axes.flatMap((a) => axisNode(a.id) ?? []);
    if (area && hasArea) {
      children.push({
        key: 'studyArea',
        label: t.studyArea,
        detail: `${formatStation(area.from, 0)} – ${formatStation(area.to, 0)}`,
        icon: 'area',
        target: { type: 'studyArea' },
      });
    }
    return [
      withIssues(
        {
          key: `alignment:${road.name}`,
          label: road.name || '—',
          icon: 'landxml',
          target: { type: 'alignment', index },
          children,
        },
        issues.alignment(road.name),
      ),
    ];
  });

  // prvky, ktorých nadradený prvok chýba (napr. po ručnej úprave súboru)
  const roads = new Set(project.alignments.map((a) => a.name));
  const axisIds = new Set(project.bridgeAxes.map((a) => a.id));
  const deckIds = new Set(project.superstructures.map((d) => d.id));
  const orphans: BrowserNode[] = [
    ...project.bridgeAxes
      .filter((a) => !roads.has(a.alignment))
      .flatMap((a) => axisNode(a.id) ?? []),
    ...project.superstructures
      .filter((d) => !axisIds.has(d.bridgeAxis))
      .flatMap((d) => deckNode(d.id) ?? []),
    ...project.supports
      .filter((s) => !deckIds.has(s.superstructure))
      .flatMap((s) => supportNode(s.id) ?? []),
  ];
  if (orphans.length > 0) {
    model.push({ key: 'unassigned', label: t.unassigned, icon: 'folder', children: orphans });
  }

  const sources: BrowserNode[] = [
    {
      key: 'alignments',
      label: t.alignments,
      icon: 'folder',
      children: project.alignments.map((road, index) =>
        withIssues(
          {
            key: `source-alignment:${road.name}`,
            label: road.name || '—',
            icon: 'landxml',
            target: { type: 'alignment', index },
          },
          issues.alignment(road.name),
        ),
      ),
    },
    {
      key: 'terrains',
      label: t.terrains,
      icon: 'folder',
      children: project.terrains.map((ter) => ({
        key: `terrains:${ter.id}`,
        label: ter.name,
        icon: 'terrain',
        target: element('terrains', ter.id),
        editable: true,
      })),
    },
    {
      key: 'planLines',
      label: t.planLines,
      icon: 'folder',
      children: project.planLines.map((l) => ({
        key: `planLines:${l.id}`,
        label: l.name,
        icon: 'line',
        target: element('planLines', l.id),
        editable: true,
      })),
    },
  ];

  return [
    {
      key: 'views',
      label: t.views,
      icon: 'folder',
      children: input.views.map((v) => ({
        key: `view:${v.mode}`,
        label: v.label,
        icon: VIEW_ICONS[v.mode],
        target: { type: 'view', mode: v.mode },
      })),
    },
    { key: 'model', label: t.model, icon: 'folder', children: model },
    { key: 'sources', label: t.sources, icon: 'folder', children: sources },
    {
      key: 'profiles',
      label: t.profiles,
      icon: 'folder',
      children: project.profiles.map((p) => ({
        key: `profiles:${p.id}`,
        label: p.name,
        icon: 'section',
        target: element('profiles', p.id),
        editable: true,
      })),
    },
    {
      key: 'parameters',
      label: t.parameters,
      icon: 'folder',
      children: project.parameters.map((p) =>
        withIssues(
          {
            key: `parameters:${p.id}`,
            label: p.name || '—',
            icon: 'parameters',
            target: { type: 'parameter', id: p.id },
            editable: true,
          },
          issues.parameter(p.name),
        ),
      ),
    },
  ];
}

/** Zhodujú sa dva ciele výberu? (zvýraznenie aktuálneho výberu v strome) */
export function sameTarget(a: BrowserTarget | undefined, b: BrowserTarget | undefined): boolean {
  if (!a || !b || a.type !== b.type) return false;
  switch (a.type) {
    case 'view':
      return b.type === 'view' && a.mode === b.mode;
    case 'alignment':
      return b.type === 'alignment' && a.index === b.index;
    case 'element':
      return b.type === 'element' && a.collection === b.collection && a.id === b.id;
    case 'studyArea':
      return true;
    case 'parameter':
      return b.type === 'parameter' && a.id === b.id;
  }
}
