import { type ProjectFile, serializeProject } from '@bridge/model';
import { projectFileName } from './fileName.ts';

/** Stiahne text ako súbor. */
export function downloadText(text: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Stiahne projekt ako `<názov>.bridge.json`. */
export function downloadProject(project: ProjectFile): void {
  downloadText(serializeProject(project), projectFileName(project.name), 'application/json');
}
