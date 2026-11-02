import { type AlignmentIssue, formatStation } from '@bridge/alignment';
import { formatNumber } from '../format/number.ts';

const ARC_SECONDS_PER_RAD = (180 / Math.PI) * 3600;

const QUANTITY = { linear: 'dĺžky', angular: 'uhly', direction: 'smery' } as const;

/** Zrozumiteľná slovenská hláška k problému pri importe alebo výpočte osi. */
export function formatIssue(issue: AlignmentIssue): string {
  switch (issue.code) {
    case 'InvalidXml':
      return `Súbor nie je platné XML (${issue.detail}).`;
    case 'NoAlignments':
      return 'Súbor neobsahuje žiadnu os (Alignments/Alignment).';
    case 'MissingUnits':
      return 'Súbor neuvádza jednotky — predpokladajú sa metre a stupne.';
    case 'UnsupportedUnit':
      return `Nepodporované jednotky (${QUANTITY[issue.quantity]}): „${issue.unit}“. Podporované sú metre a uhly v stupňoch, radiánoch alebo gonoch.`;
    case 'UnsupportedElement':
      return `Nepodporovaný prvok osi: ${issue.element}.`;
    case 'UnsupportedSpiralType':
      return `Prvok č. ${issue.index + 1} je prechodnica typu „${issue.spiralType}“; podporovaná je len klotoida.`;
    case 'UnsupportedVerticalCurve':
      return `Nepodporovaný výškový oblúk: ${issue.curveType}.`;
    case 'InvalidValue':
      return `Neplatná alebo chýbajúca hodnota ${issue.element} › ${issue.field}: „${issue.value}“.`;
    case 'CoordinateSystemMismatch':
      return `Súradnice nie sú v S-JTSK EPSG:5514 (záporné E aj N): E = ${formatNumber(issue.x, 3)}, N = ${formatNumber(issue.y, 3)}.`;
    case 'GeometryMismatch':
      return `Koniec prvku č. ${issue.index + 1} sa od LandXML líši o ${formatNumber(issue.deviation * 1000, 1)} mm.`;
    case 'DirectionMismatch':
      return `Na začiatku prvku č. ${issue.index + 1} je zlom smeru ${formatNumber(issue.deviation * ARC_SECONDS_PER_RAD, 1)}″ (prvky na seba dotyčnicovo nenadväzujú).`;
    case 'LengthMismatch':
      return `Dĺžka osi podľa prvkov ${formatNumber(issue.computed, 3)} m sa líši od uvedenej ${formatNumber(issue.declared, 3)} m.`;
    case 'VerticalCurvesOverlap':
      return `Výškové oblúky nivelety „${issue.profile}“ sa prekrývajú (${formatStation(issue.station)}).`;
    case 'InvalidProfile':
      return `Niveleta „${issue.profile}“ má menej ako dva vrcholy alebo nezoradené staničenia.`;
    case 'SuperelevationInconsistent':
      return `Klopenie v LandXML je nekonzistentné (prvok ${issue.index}, ${formatStation(issue.staStart)} – ${formatStation(issue.staEnd)}): nábehy a plné klopenie nesedia s rozsahom oblúka — kontrola priečneho sklonu NK sa pre os vynechá.`;
  }
}
