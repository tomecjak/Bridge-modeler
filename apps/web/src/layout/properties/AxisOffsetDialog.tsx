import { sk } from '../../i18n/sk.ts';
import { projectStore, useProject } from '../../store/projectStore.ts';
import { StationFunctionEditor } from '../../views/StationFunctionEditor.tsx';
import { Dialog } from './Dialog.tsx';

/** Vodorovný alebo zvislý posun osi mosta od osi cesty po staničení (ADR 0007). */
export function AxisOffsetDialog({
  axisId,
  which,
  range,
  onClose,
}: {
  axisId: string;
  which: 'horizontalOffset' | 'verticalOffset';
  /** rozsah staničenia pre nové úseky (oblasť mosta alebo NK) */
  range: { from: number; to: number };
  onClose: () => void;
}) {
  const axis = useProject((s) => s.project.bridgeAxes.find((a) => a.id === axisId));
  if (!axis) return null;
  const title =
    which === 'horizontalOffset' ? sk.elements.horizontalOffset : sk.elements.verticalOffset;
  return (
    <Dialog icon="bridgeAxis" title={`${axis.name}: ${title}`} onClose={onClose}>
      <StationFunctionEditor
        law={axis[which]}
        range={range}
        onChange={(law) =>
          projectStore.getState().dispatch({
            type: 'updateElement',
            collection: 'bridgeAxes',
            id: axis.id,
            changes: { [which]: law },
          })
        }
      />
    </Dialog>
  );
}
