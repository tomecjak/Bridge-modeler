import { sk } from '../i18n/sk.ts';
import { Icon, type IconName } from '../icons/Icon.tsx';

interface Props {
  onImportLandXml: () => void;
  onOpenProject: () => void;
  onImportTerrain: () => void;
  onImportSurvey: () => void;
  onOpenLibrary: () => void;
}

/** Prázdny projekt (ADR 0026): plocha na pustenie LandXML a ďalšie podklady. */
export function EmptyState({
  onImportLandXml,
  onOpenProject,
  onImportTerrain,
  onImportSurvey,
  onOpenLibrary,
}: Props) {
  const t = sk.emptyState;
  const sources: { title: string; text: string; icon: IconName; onClick: () => void }[] = [
    { title: t.terrain, text: t.terrainText, icon: 'dmr', onClick: onImportTerrain },
    { title: t.survey, text: t.surveyText, icon: 'survey', onClick: onImportSurvey },
    { title: t.library, text: t.libraryText, icon: 'library', onClick: onOpenLibrary },
  ];
  return (
    <div className="empty-state">
      <div className="empty-drop">
        <span className="empty-drop-icon">
          <Icon name="landxml" size={34} />
        </span>
        <h2>{sk.import.dropHint}</h2>
        <p>{t.text}</p>
        <div className="empty-actions">
          <button type="button" className="button primary" onClick={onImportLandXml}>
            {t.choose}
          </button>
          <button type="button" className="button" onClick={onOpenProject}>
            {t.openProject}
          </button>
        </div>
      </div>
      <div className="empty-sources">
        {sources.map((s) => (
          <button key={s.title} type="button" className="empty-source" onClick={s.onClick}>
            <Icon name={s.icon} size={22} />
            <span>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
