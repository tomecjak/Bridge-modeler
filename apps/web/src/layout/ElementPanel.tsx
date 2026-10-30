import type {
  BridgeAxis,
  ParameterUnit,
  ProfileDefinition,
  StationFunction,
  Superstructure,
} from '@bridge/model';
import { formatModelIssue } from '../i18n/modelIssues.ts';
import { sk } from '../i18n/sk.ts';
import type { ElementCollection, ElementCollections } from '../store/commands.ts';
import {
  parsePointList,
  renameProfileParameter,
  renameProfilePoint,
} from '../store/profileEdit.ts';
import { projectStore, useProject } from '../store/projectStore.ts';
import type { SectionResult } from '../store/sections.ts';
import { ExpressionInput } from '../views/ExpressionInput.tsx';
import { StationField, StationFunctionEditor } from '../views/StationFunctionEditor.tsx';
import { TextField } from '../views/TextField.tsx';
import { SectionResultDetails } from './SectionPanel.tsx';

interface Props {
  collection: ElementCollection;
  id: string;
  result: SectionResult | undefined;
  onRemoved: () => void;
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
export function ElementPanel({ collection, id, result, onRemoved }: Props) {
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
        <SuperstructureEditor sup={element as Superstructure} result={result} />
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
}: {
  sup: Superstructure;
  result: SectionResult | undefined;
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
