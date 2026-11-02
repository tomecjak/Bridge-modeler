import type { EdgeBeam, ProfileDefinition } from '@bridge/model';
import { CROSSBEAM_TYPOLOGY, EDGE_BEAM_TYPOLOGY } from '@bridge/sections';
import { sk } from '../i18n/sk.ts';

/** Názov rímsy podľa strany NK. */
export const edgeBeamName = (side: EdgeBeam['side']): string => sk.edgeBeams.name(side);

/** Prierez NK: nie priečnik (ADR 0018) ani rímsa (ADR 0023) — výber prierezu NK. */
export const isDeckProfile = (p: Pick<ProfileDefinition, 'typology'>) =>
  p.typology !== CROSSBEAM_TYPOLOGY && p.typology !== EDGE_BEAM_TYPOLOGY;

/** Prierez rímsy (ADR 0023). */
export const isEdgeBeamProfile = (p: Pick<ProfileDefinition, 'typology'>) =>
  p.typology === EDGE_BEAM_TYPOLOGY;

/** Strany NK, na ktorých ešte nie je rímsa. */
export function freeSides(
  edgeBeams: readonly Pick<EdgeBeam, 'superstructure' | 'side'>[],
  deckId: string,
): EdgeBeam['side'][] {
  return (['left', 'right'] as const).filter(
    (side) => !edgeBeams.some((b) => b.superstructure === deckId && b.side === side),
  );
}

/** Nové rímsy NK s prierezom `profile` na stranách `sides` (parametre s predvolenými hodnotami prierezu). */
export function newEdgeBeams(
  deckId: string,
  sides: readonly EdgeBeam['side'][],
  profile: string,
  newId: (prefix: string) => string,
): EdgeBeam[] {
  return sides.map((side) => ({
    id: newId('rim'),
    name: edgeBeamName(side),
    superstructure: deckId,
    side,
    profile,
    parameterLaws: {},
  }));
}
