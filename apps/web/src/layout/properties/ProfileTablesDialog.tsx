import type { ParameterUnit, ProfileDefinition } from '@bridge/model';
import { sk } from '../../i18n/sk.ts';
import {
  parsePointList,
  renameProfileParameter,
  renameProfilePoint,
} from '../../store/profileEdit.ts';
import { projectStore, useProject } from '../../store/projectStore.ts';
import { ExpressionInput } from '../../views/ExpressionInput.tsx';
import { Field } from '../../views/Field.tsx';
import { TextField } from '../../views/TextField.tsx';
import { Dialog } from './Dialog.tsx';

const UNITS: ParameterUnit[] = ['length', 'angle', 'slope', 'none'];

function update(id: string, changes: Partial<Omit<ProfileDefinition, 'id'>>) {
  projectStore.getState().dispatch({ type: 'updateElement', collection: 'profiles', id, changes });
}

/**
 * Tabuľky prierezu (Fáza 3, 8b): parametre s jednotkami a predvolenými hodnotami, body s výrazmi, obrysy a dutiny,
 * referenčný bod. Graficky sa prierez upravuje v záložke Prierez; vybraný bod sa zvýrazní aj tu.
 */
export function ProfileTablesDialog({
  profileId,
  selectedPoint,
  onSelectPoint,
  onClose,
}: {
  profileId: string;
  selectedPoint: string | undefined;
  onSelectPoint: (name: string | undefined) => void;
  onClose: () => void;
}) {
  const def = useProject((s) => s.project.profiles.find((p) => p.id === profileId));
  if (!def) return null;
  return (
    <Dialog
      icon="section"
      title={sk.properties.profileTablesTitle(def.name)}
      onClose={onClose}
      wide
    >
      <ProfileEditor def={def} selectedPoint={selectedPoint} onSelectPoint={onSelectPoint} />
    </Dialog>
  );
}

function ProfileEditor({
  def,
  selectedPoint,
  onSelectPoint,
}: {
  def: ProfileDefinition;
  selectedPoint: string | undefined;
  onSelectPoint: (name: string | undefined) => void;
}) {
  const set = (next: ProfileDefinition) => {
    const { id: _id, ...changes } = next;
    update(def.id, changes);
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
            <tr
              key={p.name}
              aria-selected={p.name === selectedPoint}
              onFocusCapture={() => onSelectPoint(p.name)}
            >
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
