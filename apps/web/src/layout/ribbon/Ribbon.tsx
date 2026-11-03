import type { ReactNode } from 'react';
import type { IconName } from '../../icons/Icon.tsx';

/* Dátový model nástrojov (ADR 0016); vykresľuje ho lišta nástrojov `Toolbar` (ADR 0025). */

export interface RibbonButton {
  kind: 'button';
  id: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  /** zapnutý nástroj alebo prepínač */
  pressed?: boolean;
  /** veľké tlačidlo (ikona nad popisom) alebo malé v stĺpci po troch */
  size?: 'large' | 'small';
}

export interface RibbonSelect {
  kind: 'select';
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  title?: string;
  disabled?: boolean;
}

/** Vlastný ovládací prvok v stĺpci malých položiek (napr. pole „Prejsť na“). */
export interface RibbonCustom {
  kind: 'custom';
  id: string;
  node: ReactNode;
}

export type RibbonItem = RibbonButton | RibbonSelect | RibbonCustom;

export interface RibbonGroup {
  label: string;
  items: readonly RibbonItem[];
}

export interface RibbonTab {
  id: string;
  label: string;
  groups: readonly RibbonGroup[];
  /** kontextová karta pri výbere prvku (zvýraznená) */
  contextual?: boolean;
}
