import { sk } from '../i18n/sk.ts';
import type { StepId, WorkflowStep } from '../store/workflow.ts';

export interface StepAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  steps: readonly WorkflowStep[];
  /** tlačidlá rozbaleného kroku */
  actions: Partial<Record<StepId, readonly StepAction[]>>;
  expanded: StepId | undefined;
  onExpand: (id: StepId | undefined) => void;
}

const MARK: Record<WorkflowStep['status'], string> = {
  done: '✓',
  warning: '!',
  todo: '○',
  none: '→',
};

/**
 * Postup návrhu mosta (Fáza 10a): kroky so stavom z projektu. Nie je to sprievodca — kroky sa dajú otvárať
 * v ľubovoľnom poradí; rozbalený krok ukáže nápovedu a tlačidlá, ktoré otvoria správny pohľad alebo nástroj.
 */
export function WorkflowPanel({ steps, actions, expanded, onExpand }: Props) {
  const t = sk.workflow;
  return (
    <section className="workflow" aria-labelledby="workflow-title">
      <h2 id="workflow-title" className="panel-title">
        {t.title}
      </h2>
      <ol className="workflow-steps">
        {steps.map((step, i) => {
          const open = step.id === expanded;
          return (
            <li key={step.id} className="workflow-step" data-status={step.status}>
              <button
                type="button"
                className="workflow-head"
                aria-expanded={open}
                onClick={() => onExpand(open ? undefined : step.id)}
              >
                <span className="workflow-number">{i + 1}</span>
                <span className="workflow-name">{t.steps[step.id]}</span>
                <span className="workflow-mark" title={t.status[step.status]}>
                  {MARK[step.status]}
                  <span className="visually-hidden">{t.status[step.status]}</span>
                </span>
              </button>
              {open && (
                <div className="workflow-body">
                  <p className="hint">{t.hints[step.hint]}</p>
                  {(actions[step.id]?.length ?? 0) > 0 && (
                    <div className="workflow-actions">
                      {actions[step.id]?.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          className="button"
                          disabled={a.disabled}
                          onClick={a.onClick}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
