import { useState } from 'react';
import { sk } from '../i18n/sk.ts';

export type ExportFormat = 'dxf' | 'svg';
export type ExportCoordinates = 'local' | 'sjtsk';

interface Props {
  onExport: (format: ExportFormat, coordinates: ExportCoordinates) => void;
  /** ponúknuť voľbu súradníc (pôdorys) */
  coordinates?: boolean;
  disabled?: boolean;
}

/** Export pohľadu do DXF alebo SVG (ADR 0012); pri pôdoryse aj voľba lokálnych súradníc alebo S-JTSK. */
export function ExportMenu({ onExport, coordinates = false, disabled = false }: Props) {
  const [crs, setCrs] = useState<ExportCoordinates>('sjtsk');
  return (
    <details className="export-menu">
      <summary aria-disabled={disabled || undefined} title={sk.export.title}>
        {sk.export.button}
      </summary>
      <div className="export-menu-panel">
        {coordinates && (
          <label>
            {sk.export.coordinates}{' '}
            <select value={crs} onChange={(e) => setCrs(e.target.value as ExportCoordinates)}>
              <option value="sjtsk">{sk.export.sjtsk}</option>
              <option value="local">{sk.export.local}</option>
            </select>
          </label>
        )}
        {(['dxf', 'svg'] as const).map((format) => (
          <button
            key={format}
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.currentTarget.closest('details')?.removeAttribute('open');
              onExport(format, crs);
            }}
          >
            {sk.export[format]}
          </button>
        ))}
      </div>
    </details>
  );
}
