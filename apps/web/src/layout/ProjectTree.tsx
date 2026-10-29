import { sk } from '../i18n/sk.ts';

export function ProjectTree() {
  return (
    <aside className="panel panel-left" aria-labelledby="project-tree-title">
      <h2 id="project-tree-title" className="panel-title">
        {sk.projectTree.title}
      </h2>
      <p className="panel-empty">{sk.projectTree.empty}</p>
    </aside>
  );
}
