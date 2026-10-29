import { sk } from '../i18n/sk.ts';

export function PropertiesPanel() {
  return (
    <aside className="panel panel-right" aria-labelledby="properties-title">
      <h2 id="properties-title" className="panel-title">
        {sk.properties.title}
      </h2>
      <p className="panel-empty">{sk.properties.nothingSelected}</p>
    </aside>
  );
}
