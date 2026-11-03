import {
  type BridgeType,
  type Brief,
  effectiveFreeWidth,
  parseRoadCategory,
  ROAD_CATEGORY_SUGGESTIONS,
} from '@bridge/model';
import { formatNumber, parseNumber } from '../../format/number.ts';
import { sk } from '../../i18n/sk.ts';
import { projectStore, useProject } from '../../store/projectStore.ts';
import { Dialog } from './Dialog.tsx';
import { PropertyGroups, type PropertyRow } from './PropertyGrid.tsx';

const BRIDGE_TYPES: BridgeType[] = ['road', 'railway', 'footbridge', 'ecoduct'];

const update = (changes: Partial<Brief>) =>
  projectStore.getState().dispatch({ type: 'updateBrief', changes });

/**
 * Informácie o projekte (Správa, ako Project Information v Revite): stavba, objekt, druh mosta, kategória cesty
 * s voľnou šírkou na moste (b z kategórie, ak nie je zadaná ručne) a projektanti.
 */
export function ProjectInfoDialog({ onClose }: { onClose: () => void }) {
  const t = sk.brief;
  const name = useProject((s) => s.project.name);
  const brief = useProject((s) => s.project.brief);
  const category = parseRoadCategory(brief.roadCategory);
  const freeWidth = effectiveFreeWidth(brief);
  const categoryInvalid = brief.roadCategory.trim() !== '' && !category;

  const freeWidthRow: PropertyRow = {
    kind: 'text',
    label: t.freeWidth,
    value: freeWidth === undefined ? '' : formatNumber(freeWidth * 1000, 0),
    placeholder: t.freeWidthUnknown,
    onCommit: (text) => {
      if (text === '') {
        update({ freeWidth: null });
        return;
      }
      const mm = parseNumber(text);
      if (mm !== undefined && mm > 0) update({ freeWidth: mm / 1000 });
    },
    ...(brief.freeWidth !== null && category
      ? { action: { label: t.useCategory, onClick: () => update({ freeWidth: null }) } }
      : {}),
  };

  return (
    <Dialog icon="info" title={sk.ribbon.projectInfo} onClose={onClose} wide>
      <PropertyGroups
        groups={[
          {
            id: 'brief-project',
            title: sk.properties.identity,
            rows: [
              {
                kind: 'text',
                label: t.projectName,
                value: name,
                onCommit: (v) =>
                  v !== '' && projectStore.getState().dispatch({ type: 'setProjectName', name: v }),
              },
            ],
          },
          {
            id: 'brief-construction',
            title: t.construction,
            rows: [
              {
                kind: 'text',
                label: `${t.construction} – ${t.number}`,
                value: brief.construction.number,
                onCommit: (number) => update({ construction: { ...brief.construction, number } }),
              },
              {
                kind: 'text',
                label: `${t.construction} – ${t.name}`,
                value: brief.construction.name,
                onCommit: (n) => update({ construction: { ...brief.construction, name: n } }),
              },
              {
                kind: 'text',
                label: `${t.object} – ${t.number}`,
                value: brief.object.number,
                onCommit: (number) => update({ object: { ...brief.object, number } }),
              },
              {
                kind: 'text',
                label: `${t.object} – ${t.name}`,
                value: brief.object.name,
                onCommit: (n) => update({ object: { ...brief.object, name: n } }),
              },
            ],
          },
          {
            id: 'brief-bridge',
            title: t.bridge,
            rows: [
              {
                kind: 'select',
                label: t.bridgeType,
                value: brief.bridgeType ?? '',
                options: [
                  { value: '', label: t.bridgeTypes.none },
                  ...BRIDGE_TYPES.map((type) => ({ value: type, label: t.bridgeTypes[type] })),
                ],
                onChange: (v) => update({ bridgeType: v === '' ? null : (v as BridgeType) }),
              },
              {
                kind: 'text',
                label: t.obstacle,
                value: brief.obstacle,
                onCommit: (obstacle) => update({ obstacle }),
              },
              {
                kind: 'text',
                label: t.roadCategory,
                value: brief.roadCategory,
                list: 'road-categories',
                placeholder: 'C 9,5/70',
                invalid: categoryInvalid,
                onCommit: (roadCategory) => update({ roadCategory }),
              },
              {
                kind: 'note',
                text: categoryInvalid ? t.invalidCategory : t.roadCategoryHint,
                tone: categoryInvalid ? 'warning' : 'muted',
              },
              freeWidthRow,
              ...(freeWidth === undefined
                ? []
                : [
                    {
                      kind: 'note' as const,
                      text: brief.freeWidth === null ? t.freeWidthFromCategory : t.freeWidthManual,
                    },
                  ]),
            ],
          },
          {
            id: 'brief-people',
            title: t.people,
            rows: [
              {
                kind: 'text',
                label: t.client,
                value: brief.client,
                onCommit: (client) => update({ client }),
              },
              {
                kind: 'text',
                label: t.responsibleDesigner,
                value: brief.responsibleDesigner,
                onCommit: (responsibleDesigner) => update({ responsibleDesigner }),
              },
              {
                kind: 'text',
                label: t.designer,
                value: brief.designer,
                onCommit: (designer) => update({ designer }),
              },
            ],
          },
        ]}
      />
      <datalist id="road-categories">
        {ROAD_CATEGORY_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </Dialog>
  );
}
