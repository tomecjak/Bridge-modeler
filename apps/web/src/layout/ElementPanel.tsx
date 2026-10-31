import { formatStation } from '@bridge/alignment';
import type {
  AbutmentGeometry,
  BridgeAxis,
  ParameterUnit,
  ProfileDefinition,
  StationFunction,
  Superstructure,
  Support,
  TerrainSurface,
} from '@bridge/model';
import type { SupportResult } from '@bridge/sections';
import { formatNumber } from '../format/number.ts';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';
import { terrainSize } from '../import/importTerrain.ts';
import type { ElementCollection, ElementCollections } from '../store/commands.ts';
import {
  parsePointList,
  renameProfileParameter,
  renameProfilePoint,
} from '../store/profileEdit.ts';
import { projectStore, useProject } from '../store/projectStore.ts';
import type { SectionResult } from '../store/sections.ts';
import type { DeckSpans } from '../store/supports.ts';
import { defaultGeometry } from '../store/supports.ts';
import { ExpressionInput } from '../views/ExpressionInput.tsx';
import { StationField, StationFunctionEditor } from '../views/StationFunctionEditor.tsx';
import { TextField } from '../views/TextField.tsx';
import { SectionResultDetails } from './SectionPanel.tsx';

interface Props {
  collection: ElementCollection;
  id: string;
  result: SectionResult | undefined;
  supportResult: SupportResult | undefined;
  spans: DeckSpans | undefined;
  onRemoved: () => void;
  /** sťahuje sa terén zo ZBGIS */
  terrainBusy: boolean;
  onRedownloadTerrain: (id: string) => void;
}

const UNITS: ParameterUnit[] = ['length', 'angle', 'slope', 'none'];

function update<K extends ElementCollection>(
  collection: K,
  id: string,
  changes: Partial<Omit<ElementCollections[K], 'id'>>,
) {
  projectStore.getState().dispatch({ type: 'updateElement', collection, id, changes } as never);
}

/** Editor vybraného prvku mosta (os mosta, prierez, NK) v pravom paneli. */
export function ElementPanel({
  collection,
  id,
  result,
  supportResult,
  spans,
  onRemoved,
  terrainBusy,
  onRedownloadTerrain,
}: Props) {
  const project = useProject((s) => s.project);
  const element = (project[collection] as { id: string; name: string }[]).find((e) => e.id === id);
  return (
    <aside className="panel panel-right panel-wide" aria-labelledby="element-panel-title">
      <h2 id="element-panel-title" className="panel-title">
        {sk.elements.titles[collection]}
        {element ? `: ${element.name}` : ''}
      </h2>
      {!element && <p className="panel-empty">{sk.properties.nothingSelected}</p>}
      {element && collection === 'bridgeAxes' && <BridgeAxisEditor axis={element as BridgeAxis} />}
      {element && collection === 'profiles' && <ProfileEditor def={element as ProfileDefinition} />}
      {element && collection === 'superstructures' && (
        <SuperstructureEditor sup={element as Superstructure} result={result} spans={spans} />
      )}
      {element && collection === 'supports' && (
        <SupportEditor support={element as Support} result={supportResult} />
      )}
      {element && collection === 'terrains' && (
        <TerrainEditor
          terrain={element as TerrainSurface}
          busy={terrainBusy}
          onRedownload={() => onRedownloadTerrain(id)}
        />
      )}
      {element && (
        <button
          type="button"
          className="button danger"
          onClick={() => {
            projectStore.getState().dispatch({ type: 'removeElement', collection, id });
            onRemoved();
          }}
        >
          {sk.elements.remove}
        </button>
      )}
    </aside>
  );
}

/** Terén (ADR 0011): názov, zdroj, veľkosť a koridor, na ktorý bol orezaný. */
function TerrainEditor({
  terrain,
  busy,
  onRedownload,
}: {
  terrain: TerrainSurface;
  busy: boolean;
  onRedownload: () => void;
}) {
  const t = sk.terrain;
  const size = terrainSize(terrain);
  return (
    <div className="sf-editor">
      <Field label={sk.elements.name}>
        <TextField
          value={terrain.name}
          ariaLabel={sk.elements.name}
          onCommit={(name) => update('terrains', terrain.id, { name })}
        />
      </Field>
      <dl className="props">
        <dt>{t.source}</dt>
        <dd>{t.sources[terrain.source]}</dd>
        <dt>{t.size}</dt>
        <dd>
          {t.points(size.points)} ·{' '}
          {terrain.data.kind === 'tin' ? t.triangles(size.cells) : t.cells(size.cells)}
        </dd>
        <dt>{t.area}</dt>
        <dd>
          {terrain.corridor.shape === 'rectangle'
            ? t.rectangleUsed(terrain.corridor.margin)
            : t.corridorUsed(terrain.corridor.halfWidth, terrain.corridor.margin)}
        </dd>
        {terrain.attribution && (
          <>
            <dt>{t.attribution}</dt>
            <dd>{terrain.attribution}</dd>
          </>
        )}
      </dl>
      {terrain.source === 'zbgis' ? (
        <>
          <button type="button" className="button" disabled={busy} onClick={onRedownload}>
            {t.redownload}
          </button>
          <p className="hint">{t.redownloadHint}</p>
        </>
      ) : (
        <p className="hint">{t.reimportHint}</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}

function BridgeAxisEditor({ axis }: { axis: BridgeAxis }) {
  const alignments = useProject((s) => s.project.alignments);
  const set = (changes: Partial<BridgeAxis>) => update('bridgeAxes', axis.id, changes);
  const range = { from: 0, to: 100 };
  return (
    <div className="sf-editor">
      <Field label={sk.elements.name}>
        <TextField
          value={axis.name}
          ariaLabel={sk.elements.name}
          onCommit={(name) => set({ name })}
        />
      </Field>
      <Field label={sk.elements.alignment}>
        <select
          value={axis.alignment}
          aria-label={sk.elements.alignment}
          onChange={(e) => set({ alignment: e.target.value })}
        >
          {!alignments.some((a) => a.name === axis.alignment) && (
            <option value={axis.alignment}>{axis.alignment} (?)</option>
          )}
          {alignments.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <h3 className="panel-subtitle">{sk.elements.horizontalOffset}</h3>
      <StationFunctionEditor
        law={axis.horizontalOffset}
        range={range}
        onChange={(horizontalOffset) => set({ horizontalOffset })}
      />
      <h3 className="panel-subtitle">{sk.elements.verticalOffset}</h3>
      <StationFunctionEditor
        law={axis.verticalOffset}
        range={range}
        onChange={(verticalOffset) => set({ verticalOffset })}
      />
    </div>
  );
}

function ProfileEditor({ def }: { def: ProfileDefinition }) {
  const set = (next: ProfileDefinition) => {
    const { id: _id, ...changes } = next;
    update('profiles', def.id, changes);
  };
  const setParam = (i: number, changes: Partial<ProfileDefinition['parameters'][number]>) =>
    set({ ...def, parameters: def.parameters.map((p, j) => (j === i ? { ...p, ...changes } : p)) });
  const setPoint = (i: number, changes: Partial<ProfileDefinition['points'][number]>) =>
    set({ ...def, points: def.points.map((p, j) => (j === i ? { ...p, ...changes } : p)) });
  const setLoop = (i: number, changes: Partial<ProfileDefinition['loops'][number]>) =>
    set({ ...def, loops: def.loops.map((l, j) => (j === i ? { ...l, ...changes } : l)) });

  return (
    <div className="sf-editor">
      <Field label={sk.elements.name}>
        <TextField
          value={def.name}
          ariaLabel={sk.elements.name}
          onCommit={(name) => set({ ...def, name })}
        />
      </Field>
      <p className="hint">{sk.elements.profileHint}</p>

      <h3 className="panel-subtitle">{sk.elements.profileParameters}</h3>
      <table className="mini-table">
        <tbody>
          {def.parameters.map((p, i) => (
            <tr key={p.name}>
              <td>
                <TextField
                  className="mono"
                  value={p.name}
                  ariaLabel={sk.parameters.name}
                  onCommit={(name) => set(renameProfileParameter(def, p.name, name))}
                />
              </td>
              <td>
                <select
                  value={p.unit}
                  aria-label={sk.parameters.unit}
                  onChange={(e) => setParam(i, { unit: e.target.value as ParameterUnit })}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {sk.parameters.units[u]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="wide">
                <ExpressionInput
                  value={p.default}
                  ariaLabel={sk.elements.default}
                  onCommit={(v) => setParam(i, { default: v })}
                />
              </td>
              <td>
                <RemoveButton
                  label={p.name}
                  onClick={() =>
                    set({ ...def, parameters: def.parameters.filter((_, j) => j !== i) })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="button"
        onClick={() =>
          set({
            ...def,
            parameters: [
              ...def.parameters,
              {
                name: nextName(
                  def.parameters.map((p) => p.name),
                  'p',
                ),
                unit: 'length',
                default: '0',
              },
            ],
          })
        }
      >
        {sk.elements.addParameter}
      </button>

      <h3 className="panel-subtitle">{sk.elements.points}</h3>
      <table className="mini-table">
        <thead>
          <tr>
            <th>{sk.parameters.name}</th>
            <th>x [m]</th>
            <th>y [m]</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {def.points.map((p, i) => (
            <tr key={p.name}>
              <td>
                <TextField
                  className="mono point-name"
                  value={p.name}
                  ariaLabel={sk.parameters.name}
                  onCommit={(name) => set(renameProfilePoint(def, p.name, name))}
                />
              </td>
              <td>
                <ExpressionInput
                  value={p.x}
                  ariaLabel={`${p.name} x`}
                  onCommit={(x) => setPoint(i, { x })}
                />
              </td>
              <td>
                <ExpressionInput
                  value={p.y}
                  ariaLabel={`${p.name} y`}
                  onCommit={(y) => setPoint(i, { y })}
                />
              </td>
              <td>
                <RemoveButton
                  label={p.name}
                  onClick={() => set({ ...def, points: def.points.filter((_, j) => j !== i) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="button"
        onClick={() =>
          set({
            ...def,
            points: [
              ...def.points,
              {
                name: nextName(
                  def.points.map((p) => p.name),
                  'P',
                ),
                x: '0',
                y: '0',
              },
            ],
          })
        }
      >
        {sk.elements.addPoint}
      </button>

      <h3 className="panel-subtitle">{sk.elements.loops}</h3>
      {def.loops.map((l, i) => (
        <div key={l.name} className="segment">
          <div className="segment-grid">
            <Field label={sk.elements.name}>
              <TextField
                value={l.name}
                ariaLabel={sk.elements.name}
                onCommit={(name) => setLoop(i, { name })}
              />
            </Field>
            <Field label={sk.elements.role}>
              <select
                value={l.role}
                aria-label={sk.elements.role}
                onChange={(e) => setLoop(i, { role: e.target.value as 'outer' | 'void' })}
              >
                <option value="outer">{sk.elements.roles.outer}</option>
                <option value="void">{sk.elements.roles.void}</option>
              </select>
            </Field>
          </div>
          <Field label={sk.elements.loopPoints}>
            <TextField
              className="mono"
              value={l.points.join(' ')}
              ariaLabel={sk.elements.loopPoints}
              onCommit={(text) => setLoop(i, { points: parsePointList(text) })}
            />
          </Field>
          <RemoveButton
            label={l.name}
            onClick={() => set({ ...def, loops: def.loops.filter((_, j) => j !== i) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="button"
        onClick={() =>
          set({
            ...def,
            loops: [
              ...def.loops,
              {
                name: nextName(
                  def.loops.map((l) => l.name),
                  'dutina',
                ),
                role: 'void',
                points: [],
              },
            ],
          })
        }
      >
        {sk.elements.addLoop}
      </button>

      <Field label={sk.elements.referencePoint}>
        <select
          value={def.referencePoint}
          aria-label={sk.elements.referencePoint}
          onChange={(e) => set({ ...def, referencePoint: e.target.value })}
        >
          {def.points.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function SuperstructureEditor({
  sup,
  result,
  spans,
}: {
  sup: Superstructure;
  result: SectionResult | undefined;
  spans: DeckSpans | undefined;
}) {
  const axes = useProject((s) => s.project.bridgeAxes);
  const profiles = useProject((s) => s.project.profiles);
  const profile = profiles.find((p) => p.id === sup.profile);
  const set = (changes: Partial<Superstructure>) => update('superstructures', sup.id, changes);
  const setLaw = (name: string, law: StationFunction | undefined) => {
    const laws = { ...sup.parameterLaws };
    if (law) laws[name] = law;
    else delete laws[name];
    set({ parameterLaws: laws });
  };
  const range = { from: sup.from, to: sup.to };
  return (
    <div className="sf-editor">
      <Field label={sk.elements.name}>
        <TextField
          value={sup.name}
          ariaLabel={sk.elements.name}
          onCommit={(name) => set({ name })}
        />
      </Field>
      <div className="segment-grid">
        <Field label={sk.elements.bridgeAxis}>
          <select
            value={sup.bridgeAxis}
            aria-label={sk.elements.bridgeAxis}
            onChange={(e) => set({ bridgeAxis: e.target.value })}
          >
            {axes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={sk.elements.profile}>
          <select
            value={sup.profile}
            aria-label={sk.elements.profile}
            onChange={(e) => set({ profile: e.target.value })}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={sk.stationFunction.from}>
          <StationField
            ariaLabel={sk.stationFunction.from}
            value={sup.from}
            onCommit={(from) => set({ from })}
          />
        </Field>
        <Field label={sk.stationFunction.to}>
          <StationField
            ariaLabel={sk.stationFunction.to}
            value={sup.to}
            onCommit={(to) => set({ to })}
          />
        </Field>
      </div>
      <Field label={sk.elements.orientation}>
        <select
          value={sup.orientation}
          aria-label={sk.elements.orientation}
          onChange={(e) => set({ orientation: e.target.value as Superstructure['orientation'] })}
        >
          <option value="vertical">{sk.elements.orientations.vertical}</option>
          <option value="normalToGrade">{sk.elements.orientations.normalToGrade}</option>
        </select>
      </Field>

      {result && <SectionResultDetails result={result} />}
      <SpanList spans={spans} />

      <h3 className="panel-subtitle">{sk.elements.laws}</h3>
      {profile?.parameters.map((p) => {
        const law = sup.parameterLaws[p.name];
        return (
          <div key={p.name} className="segment">
            <div className="segment-head">
              <span className="mono">{p.name}</span>
              {law ? (
                <button type="button" className="link" onClick={() => setLaw(p.name, undefined)}>
                  {sk.elements.defaultRestore(p.default)}
                </button>
              ) : (
                <button
                  type="button"
                  className="link"
                  onClick={() => setLaw(p.name, { kind: 'constant', value: p.default })}
                >
                  {sk.elements.defaultOverride(p.default)}
                </button>
              )}
            </div>
            {p.description && <p className="hint">{p.description}</p>}
            {law && (
              <StationFunctionEditor
                law={law}
                range={range}
                onChange={(next) => setLaw(p.name, next)}
              />
            )}
          </div>
        );
      })}
      {Object.keys(sup.parameterLaws)
        .filter((name) => !profile?.parameters.some((p) => p.name === name))
        .map((name) => (
          <p key={name} className="issue issue-error">
            {formatModelIssue({ code: 'UnknownProfileParameter', name })}
          </p>
        ))}
    </div>
  );
}

function SpanList({ spans }: { spans: DeckSpans | undefined }) {
  if (!spans) return <p className="hint">{sk.supports.noSupports}</p>;
  return (
    <>
      <h3 className="panel-subtitle">{sk.supports.spans}</h3>
      {spans.spans.length > 0 && (
        <table className="mini-table">
          <tbody>
            {spans.spans.map((s) => (
              <tr key={s.index}>
                <td>{sk.supports.span(s.index + 1)}</td>
                <td>
                  {s.from.support.name} – {s.to.support.name}
                </td>
                <td className="num">{formatNumber(s.length, 3)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {spans.deckLength !== undefined && spans.overallLength !== undefined && (
        <table className="mini-table">
          <tbody>
            <tr>
              <td>{sk.supports.deckLength}</td>
              <td className="num">{formatNumber(spans.deckLength, 3)} m</td>
            </tr>
            <tr>
              <td>{sk.supports.overallLength}</td>
              <td className="num">{formatNumber(spans.overallLength, 3)} m</td>
            </tr>
          </tbody>
        </table>
      )}
      <IssueItems issues={spans.issues} />
    </>
  );
}

function IssueItems({ issues }: { issues: SupportResult['issues'] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issues">
      {issues.map((i) => (
        <li
          key={formatModelIssue(i)}
          className={i.severity === 'warning' ? 'issue issue-warning' : 'issue issue-error'}
        >
          {formatModelIssue(i)}
        </li>
      ))}
    </ul>
  );
}

/** Rozmery opory po častiach (ADR 0010): prah, driek, záverný múrik, krídla. */
function AbutmentFields({
  geometry: g,
  onChange,
}: {
  geometry: AbutmentGeometry;
  onChange: (geometry: AbutmentGeometry) => void;
}) {
  const dims = sk.supports.dimensions;
  const t = sk.supports.abutment;
  const field = (key: string, value: string, apply: (v: string) => AbutmentGeometry) => (
    <Field key={key} label={dims[key] ?? key}>
      <ExpressionInput
        value={value}
        ariaLabel={dims[key] ?? key}
        onCommit={(v) => onChange(apply(v))}
      />
    </Field>
  );
  const wing = (k: 'angle' | 'length' | 'thickness' | 'endHeight') => (v: string) => ({
    ...g,
    wings: { ...g.wings, [k]: v },
  });
  return (
    <>
      <h3 className="panel-subtitle">{t.seat}</h3>
      <div className="segment-grid">
        {field('length', g.length, (length) => ({ ...g, length }))}
        {field('seatLength', g.seatLength, (seatLength) => ({ ...g, seatLength }))}
        {field('seatHeight', g.seatHeight, (seatHeight) => ({ ...g, seatHeight }))}
        {field('frontOffset', g.frontOffset, (frontOffset) => ({ ...g, frontOffset }))}
      </div>
      <h3 className="panel-subtitle">{t.stem}</h3>
      <div className="segment-grid">
        {field('stemThickness', g.stemThickness, (stemThickness) => ({ ...g, stemThickness }))}
      </div>
      <p className="hint">{t.stemHint}</p>
      <h3 className="panel-subtitle">{t.backwall}</h3>
      <div className="segment-grid">
        {field('backwallThickness', g.backwallThickness, (backwallThickness) => ({
          ...g,
          backwallThickness,
        }))}
        {field('gap', g.gap, (gap) => ({ ...g, gap }))}
      </div>
      <h3 className="panel-subtitle">{t.wings}</h3>
      <div className="segment-grid">
        <Field label={t.wingSupport}>
          <select
            value={g.wings.support}
            aria-label={t.wingSupport}
            onChange={(e) =>
              onChange({
                ...g,
                wings: {
                  ...g.wings,
                  support: e.target.value as AbutmentGeometry['wings']['support'],
                },
              })
            }
          >
            <option value="hung">{t.wingSupports.hung}</option>
            <option value="founded">{t.wingSupports.founded}</option>
          </select>
        </Field>
        {field('wingAngle', g.wings.angle, wing('angle'))}
        {field('wingLength', g.wings.length, wing('length'))}
        {field('wingThickness', g.wings.thickness, wing('thickness'))}
        {g.wings.support === 'hung' && field('wingEndHeight', g.wings.endHeight, wing('endHeight'))}
      </div>
    </>
  );
}

function SupportEditor({
  support,
  result,
}: {
  support: Support;
  result: SupportResult | undefined;
}) {
  const decks = useProject((s) => s.project.superstructures);
  const set = (changes: Partial<Support>) => update('supports', support.id, changes);
  const g = support.geometry;
  const dimensionKeys =
    g.type === 'wall'
      ? ['thickness', 'length']
      : g.type === 'abutment'
        ? []
        : g.shape === 'circle'
          ? ['diameter', 'count', 'spacing']
          : ['width', 'depth', 'count', 'spacing'];
  const dims = sk.supports.dimensions;
  return (
    <div className="sf-editor">
      <Field label={sk.elements.name}>
        <TextField
          value={support.name}
          ariaLabel={sk.elements.name}
          onCommit={(name) => set({ name })}
        />
      </Field>
      <div className="segment-grid">
        <Field label={sk.supports.kind}>
          <select
            value={support.kind}
            aria-label={sk.supports.kind}
            onChange={(e) => set({ kind: e.target.value as Support['kind'] })}
          >
            <option value="abutment">{sk.supports.kinds.abutment}</option>
            <option value="pier">{sk.supports.kinds.pier}</option>
          </select>
        </Field>
        <Field label={sk.supports.deck}>
          <select
            value={support.superstructure}
            aria-label={sk.supports.deck}
            onChange={(e) => set({ superstructure: e.target.value })}
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={sk.supports.station}>
          <StationField
            ariaLabel={sk.supports.station}
            value={support.station}
            onCommit={(station) => set({ station })}
          />
        </Field>
        <Field label={sk.supports.crossingAngle}>
          <ExpressionInput
            value={support.crossingAngle}
            ariaLabel={sk.supports.crossingAngle}
            onCommit={(crossingAngle) => set({ crossingAngle })}
          />
        </Field>
        <Field label={sk.supports.offset}>
          <ExpressionInput
            value={support.offset}
            ariaLabel={sk.supports.offset}
            onCommit={(offset) => set({ offset })}
          />
        </Field>
        <Field label={sk.supports.foundationTop}>
          <ExpressionInput
            value={support.foundationTop}
            ariaLabel={sk.supports.foundationTop}
            onCommit={(foundationTop) => set({ foundationTop })}
          />
        </Field>
      </div>

      <h3 className="panel-subtitle">{sk.supports.geometry}</h3>
      <div className="segment-grid">
        <Field label={sk.supports.type}>
          <select
            value={g.type}
            aria-label={sk.supports.type}
            onChange={(e) =>
              set({ geometry: defaultGeometry(e.target.value as Support['geometry']['type']) })
            }
          >
            <option value="wall">{sk.supports.types.wall}</option>
            <option value="columns">{sk.supports.types.columns}</option>
            <option value="abutment">{sk.supports.types.abutment}</option>
          </select>
        </Field>
        {g.type === 'columns' && (
          <Field label={sk.supports.shape}>
            <select
              value={g.shape}
              aria-label={sk.supports.shape}
              onChange={(e) =>
                set({ geometry: { ...g, shape: e.target.value as 'circle' | 'rect' } })
              }
            >
              <option value="circle">{sk.supports.shapes.circle}</option>
              <option value="rect">{sk.supports.shapes.rect}</option>
            </select>
          </Field>
        )}
        {dimensionKeys.map((k) => (
          <Field key={k} label={dims[k] ?? k}>
            <ExpressionInput
              value={(g as unknown as Record<string, string>)[k] ?? ''}
              ariaLabel={dims[k] ?? k}
              onCommit={(v) => set({ geometry: { ...g, [k]: v } as Support['geometry'] })}
            />
          </Field>
        ))}
      </div>
      {g.type === 'abutment' && (
        <AbutmentFields geometry={g} onChange={(geometry) => set({ geometry })} />
      )}

      <h3 className="panel-subtitle">{sk.supports.footing}</h3>
      <p className="hint">{sk.supports.footingHint}</p>
      <div className="segment-grid">
        {(['length', 'width', 'thickness'] as const).map((k) => (
          <Field key={k} label={sk.supports.footingFields[k]}>
            <ExpressionInput
              value={support.footing[k]}
              ariaLabel={sk.supports.footingFields[k]}
              onCommit={(v) => set({ footing: { ...support.footing, [k]: v } })}
            />
          </Field>
        ))}
      </div>

      <h3 className="panel-subtitle">{sk.supports.bearings}</h3>
      <div className="segment-grid">
        <Field label={sk.supports.connection}>
          <select
            value={support.connection}
            aria-label={sk.supports.connection}
            onChange={(e) => set({ connection: e.target.value as Support['connection'] })}
          >
            <option value="bearing">{sk.supports.connections.bearing}</option>
            <option value="hinge">{sk.supports.connections.hinge}</option>
            <option value="fixed">{sk.supports.connections.fixed}</option>
          </select>
        </Field>
        <Field label={sk.supports.bearingHeight}>
          <ExpressionInput
            value={support.bearingHeight}
            ariaLabel={sk.supports.bearingHeight}
            onCommit={(bearingHeight) => set({ bearingHeight })}
          />
        </Field>
      </div>
      <table className="mini-table">
        <thead>
          <tr>
            <th>{sk.supports.bearingX}</th>
            <th className="num">{sk.supports.bearingStation}</th>
            <th className="num">{sk.supports.seat}</th>
            <th className="num">{sk.supports.height}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {support.bearings.map((b, i) => {
            const r = result?.bearings.find((x) => x.index === i);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: ložiská sú určené poradím
              <tr key={i}>
                <td>
                  <ExpressionInput
                    value={b}
                    ariaLabel={`${sk.supports.bearingX} ${i + 1}`}
                    onCommit={(v) =>
                      set({ bearings: support.bearings.map((x, j) => (j === i ? v : x)) })
                    }
                  />
                </td>
                <td className="num">{r ? formatStation(r.station) : '—'}</td>
                <td className="num">{r ? formatNumber(r.seat, 3) : '—'}</td>
                <td className="num">{r ? formatNumber(r.height, 3) : '—'}</td>
                <td>
                  <RemoveButton
                    label={`${i + 1}`}
                    onClick={() => set({ bearings: support.bearings.filter((_, j) => j !== i) })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="button"
        onClick={() => set({ bearings: [...support.bearings, '0'] })}
      >
        {sk.supports.addBearing}
      </button>
      {result && result.bearings.length > 0 && (
        <p className="hint">
          {sk.supports.heightRange(
            formatNumber(result.height.min, 3),
            formatNumber(result.height.max, 3),
          )}
        </p>
      )}
      {result && <IssueItems issues={result.issues} />}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`${sk.parameters.remove} ${label}`}
      onClick={onClick}
    >
      ×
    </button>
  );
}

function nextName(existing: readonly string[], prefix: string): string {
  let i = 1;
  while (existing.includes(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}
