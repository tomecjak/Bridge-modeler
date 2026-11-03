import type { ReactNode } from 'react';
import { sk } from '../../i18n/sk.ts';
import type { IconName } from '../../icons/Icon.tsx';
import { DialogFrame } from '../DialogFrame.tsx';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  icon?: IconName;
}

/**
 * Modálny dialóg na zložité hodnoty z mriežky vlastností (ADR 0016, vzhľad ADR 0026); zmeny sa ukladajú priebežne,
 * Esc zavrie.
 */
export function Dialog({ title, onClose, children, wide = false, icon = 'rename' }: Props) {
  return (
    <DialogFrame
      title={title}
      icon={icon}
      width={wide ? 920 : 620}
      onClose={onClose}
      actions={
        <button type="button" className="button primary" onClick={onClose}>
          {sk.library.close}
        </button>
      }
    >
      <div className="dialog-body">{children}</div>
    </DialogFrame>
  );
}
