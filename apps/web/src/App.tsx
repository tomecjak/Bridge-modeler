import { sk } from './i18n/sk.ts';
import { ProjectTree } from './layout/ProjectTree.tsx';
import { PropertiesPanel } from './layout/PropertiesPanel.tsx';
import { Viewport } from './layout/Viewport.tsx';

export function App() {
  return (
    <div className="app">
      <header className="app-header">{sk.app.title}</header>
      <ProjectTree />
      <Viewport />
      <PropertiesPanel />
      <footer className="app-status">{sk.statusBar.ready}</footer>
    </div>
  );
}
