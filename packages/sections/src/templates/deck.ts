import type { BridgeAxis, Superstructure } from '@bridge/model';

/**
 * Nová NK s daným prierezom na vlastnej osi mosta (Fáza 10a). Os mosta = os cesty posunutá vodorovne
 * o `horizontalOffset` [m, + vpravo] a zvislo o −0,09 m (hrúbka vozovky, rozhodnutie 2026-10-29);
 * parametre prierezu majú predvolené hodnoty (priebehy sa doplnia v editore NK).
 */
export function deckFromProfile(
  alignment: string,
  from: number,
  to: number,
  profileId: string,
  ids: { deck: string; axis: string },
  names: { deck: string; axis: string } = { deck: 'NK', axis: 'Os mosta' },
  horizontalOffset = 0,
): { bridgeAxis: BridgeAxis; superstructure: Superstructure } {
  return {
    bridgeAxis: {
      id: ids.axis,
      name: names.axis,
      alignment,
      horizontalOffset: { kind: 'constant', value: String(horizontalOffset) },
      verticalOffset: { kind: 'constant', value: '-0.09' },
    },
    superstructure: {
      id: ids.deck,
      name: names.deck,
      bridgeAxis: ids.axis,
      from: Math.min(from, to),
      to: Math.max(from, to),
      profile: profileId,
      parameterLaws: {},
      orientation: 'vertical',
    },
  };
}
