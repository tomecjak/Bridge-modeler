/**
 * Stav pohľadov, ktorý drží `App.tsx` a ovláda ho ribbon (ADR 0016): aktívny nástroj a požiadavka
 * na prispôsobenie pohľadu.
 */

/** Nástroj v pôdoryse a pozdĺžnom profile; Esc ho zruší. */
export type ViewTool = 'none' | 'support' | 'line' | 'area' | 'measure';

/** Prispôsobiť (na oblasť mosta, inak NK) alebo Celá os; nová hodnota `nonce` pohľad prispôsobí znova. */
export interface FitRequest {
  whole: boolean;
  nonce: number;
}
