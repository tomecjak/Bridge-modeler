import {
  type BridgeType,
  type Brief,
  effectiveFreeWidth,
  parseRoadCategory,
  ROAD_CATEGORY_SUGGESTIONS,
} from '@bridge/model';
import { formatNumber, parseNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { projectStore, useProject } from '../store/projectStore.ts';
import { Field } from '../views/Field.tsx';
import { TextField } from '../views/TextField.tsx';

const BRIDGE_TYPES: BridgeType[] = ['road', 'railway', 'footbridge', 'ecoduct'];

const update = (changes: Partial<Brief>) =>
  projectStore.getState().dispatch({ type: 'updateBrief', changes });

/** Zadanie projektu (Fáza 10a): stavba, objekt, projektanti, druh mosta, kategória a voľná šírka na moste. */
export function BriefPanel() {
  const t = sk.brief;
  const name = useProject((s) => s.project.name);
  const brief = useProject((s) => s.project.brief);
  const category = parseRoadCategory(brief.roadCategory);
  const freeWidth = effectiveFreeWidth(brief);
  const categoryInvalid = brief.roadCategory.trim() !== '' && !category;

  return (
    <aside className="panel panel-right panel-wide" aria-labelledby="brief-panel-title">
      <h2 id="brief-panel-title" className="panel-title">
        {t.title}
      </h2>
      <div className="sf-editor">
        <Field label={t.projectName}>
          <TextField
            value={name}
            ariaLabel={t.projectName}
            onCommit={(v) =>
              v !== '' && projectStore.getState().dispatch({ type: 'setProjectName', name: v })
            }
          />
        </Field>

        <h3 className="panel-subtitle">{t.construction}</h3>
        <div className="brief-grid">
          <Field label={t.number}>
            <TextField
              value={brief.construction.number}
              ariaLabel={`${t.construction} – ${t.number}`}
              onCommit={(number) => update({ construction: { ...brief.construction, number } })}
            />
          </Field>
          <Field label={t.name}>
            <TextField
              value={brief.construction.name}
              ariaLabel={`${t.construction} – ${t.name}`}
              onCommit={(n) => update({ construction: { ...brief.construction, name: n } })}
            />
          </Field>
        </div>

        <h3 className="panel-subtitle">{t.object}</h3>
        <div className="brief-grid">
          <Field label={t.number}>
            <TextField
              value={brief.object.number}
              ariaLabel={`${t.object} – ${t.number}`}
              onCommit={(number) => update({ object: { ...brief.object, number } })}
            />
          </Field>
          <Field label={t.name}>
            <TextField
              value={brief.object.name}
              ariaLabel={`${t.object} – ${t.name}`}
              onCommit={(n) => update({ object: { ...brief.object, name: n } })}
            />
          </Field>
        </div>

        <Field label={t.bridgeType}>
          <select
            value={brief.bridgeType ?? ''}
            aria-label={t.bridgeType}
            onChange={(e) =>
              update({ bridgeType: e.target.value === '' ? null : (e.target.value as BridgeType) })
            }
          >
            <option value="">{t.bridgeTypes.none}</option>
            {BRIDGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.bridgeTypes[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.obstacle}>
          <TextField
            value={brief.obstacle}
            ariaLabel={t.obstacle}
            onCommit={(obstacle) => update({ obstacle })}
          />
        </Field>

        <Field label={t.roadCategory}>
          <TextField
            value={brief.roadCategory}
            ariaLabel={t.roadCategory}
            list="road-categories"
            placeholder="C 9,5/70"
            invalid={categoryInvalid}
            onCommit={(roadCategory) => update({ roadCategory })}
          />
          <datalist id="road-categories">
            {ROAD_CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <p className={categoryInvalid ? 'hint notice' : 'hint'}>
          {categoryInvalid ? t.invalidCategory : t.roadCategoryHint}
        </p>

        <Field label={t.freeWidth}>
          <div className="brief-width">
            <TextField
              value={freeWidth === undefined ? '' : formatNumber(freeWidth * 1000, 0)}
              ariaLabel={t.freeWidth}
              placeholder={t.freeWidthUnknown}
              onCommit={(text) => {
                if (text === '') {
                  update({ freeWidth: null });
                  return;
                }
                const mm = parseNumber(text);
                if (mm !== undefined && mm > 0) update({ freeWidth: mm / 1000 });
              }}
            />
            {brief.freeWidth !== null && category && (
              <button type="button" className="button" onClick={() => update({ freeWidth: null })}>
                {t.useCategory}
              </button>
            )}
          </div>
        </Field>
        {freeWidth !== undefined && (
          <p className="hint">
            {brief.freeWidth === null ? t.freeWidthFromCategory : t.freeWidthManual}
          </p>
        )}

        <h3 className="panel-subtitle">{t.people}</h3>
        <Field label={t.client}>
          <TextField
            value={brief.client}
            ariaLabel={t.client}
            onCommit={(client) => update({ client })}
          />
        </Field>
        <Field label={t.responsibleDesigner}>
          <TextField
            value={brief.responsibleDesigner}
            ariaLabel={t.responsibleDesigner}
            onCommit={(responsibleDesigner) => update({ responsibleDesigner })}
          />
        </Field>
        <Field label={t.designer}>
          <TextField
            value={brief.designer}
            ariaLabel={t.designer}
            onCommit={(designer) => update({ designer })}
          />
        </Field>
      </div>
    </aside>
  );
}
