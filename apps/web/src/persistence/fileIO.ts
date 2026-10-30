import { type ProjectFile, serializeProject } from '@bridge/model';
import { projectFileName } from './fileName.ts';

/** Stiahne projekt ako `<názov>.bridge.json`. */
export function downloadProject(project: ProjectFile): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = projectFileName(project.name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
