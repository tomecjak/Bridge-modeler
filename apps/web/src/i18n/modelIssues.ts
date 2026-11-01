import { formatStation } from '@bridge/alignment';
import type { ExprError } from '@bridge/expr';
import type { ExpressionField, ModelIssue } from '@bridge/model';
import { formatNumber } from '../format/number.ts';
import { sk } from './sk.ts';

const FIELD: Record<ExpressionField, string> = {
  value: 'hodnota',
  expr: 'výraz',
  v0: 'hodnota na začiatku úseku',
  v1: 'hodnota na konci úseku',
  x: 'súradnica x',
  y: 'súradnica y',
  default: 'predvolená hodnota',
  crossingAngle: 'uhol kríženia',
  offset: 'posun',
  bearingHeight: 'výška uloženia',
  foundationTop: 'horná hrana základu',
  bearing: 'poloha ložiska',
  dimension: 'rozmer',
};

const OWNER = {
  profile: 'Prierez',
  superstructure: 'NK',
  bridgeAxis: 'Os mosta',
  support: 'Podpera',
  bearingLine: 'Os uloženia',
} as const;

const TYPE = { number: 'číslo', boolean: 'logická hodnota' } as const;

/** Slovenská hláška k chybe výrazu (poloha sa zobrazuje podčiarknutím v editore). */
export function formatExprError(e: ExprError): string {
  switch (e.code) {
    case 'EmptyExpression':
      return 'Výraz je prázdny.';
    case 'UnexpectedChar':
      return `Nepovolený znak „${e.char}“.`;
    case 'UnexpectedToken':
      return e.token === ','
        ? 'Nečakaná čiarka — desatinné miesta sa píšu s bodkou (1.5).'
        : `Nečakané „${e.token}“.`;
    case 'UnexpectedEnd':
      return 'Výraz je neúplný (chýba operand alebo zátvorka).';
    case 'UnknownFunction':
      return `Neznáma funkcia „${e.name}“.`;
    case 'WrongArgCount': {
      const expected =
        e.min === e.max
          ? `${e.min}`
          : Number.isFinite(e.max)
            ? `${e.min}–${e.max}`
            : `aspoň ${e.min}`;
      return `Funkcia ${e.name}() potrebuje ${expected} argument(y), zadané ${e.actual}.`;
    }
    case 'UnknownIdentifier':
      return `Neznámy parameter „${e.name}“.`;
    case 'TypeMismatch':
      return `Očakáva sa ${TYPE[e.expected]}, ale je tu ${TYPE[e.actual]}.`;
    case 'DivisionByZero':
      return 'Delenie nulou.';
    case 'DomainError':
      return `Hodnota mimo definičného oboru funkcie ${e.name}().`;
    case 'NotFinite':
      return 'Výsledok nie je konečné číslo.';
  }
}

/** Slovenská hláška k problému modelu (parametre, staničné funkcie, projektový súbor). */
export function formatModelIssue(issue: ModelIssue): string {
  const owner = issue.owner ? `${OWNER[issue.owner.kind]} „${issue.owner.name}“ › ` : '';
  const target = [issue.parameter, issue.point && `bod ${issue.point}`].filter(Boolean).join(' › ');
  const prefix = owner || target ? `${owner}${target}${target ? ': ' : ''}` : '';
  const seg = (i: number) => `úsek ${i + 1}`;
  switch (issue.code) {
    case 'ExpressionError':
      return `${prefix}${issue.segment === undefined ? '' : `${seg(issue.segment)}, `}${FIELD[issue.field]} — ${formatExprError(issue.error)}`;
    case 'NotANumber':
      return `${prefix}${FIELD[issue.field]} musí byť číslo, nie logická hodnota.`;
    case 'EmptyPiecewise':
      return `${prefix}funkcia po častiach nemá žiadny úsek.`;
    case 'SegmentOrder':
      return `${prefix}${seg(issue.segment)} má koniec pred začiatkom.`;
    case 'SegmentGap':
      return `${prefix}medzi úsekmi ${issue.segment} a ${issue.segment + 1} je medzera (${formatStation(issue.previousTo)} – ${formatStation(issue.from)}).`;
    case 'SegmentOverlap':
      return `${prefix}úseky ${issue.segment} a ${issue.segment + 1} sa prekrývajú (${formatStation(issue.from)} – ${formatStation(issue.previousTo)}).`;
    case 'MissingVertex':
      return `${prefix}${seg(issue.segment)}: pri parabole a kružnici treba určiť koniec s vodorovnou dotyčnicou.`;
    case 'CircularShapeNotAllowed':
      return `${prefix}${seg(issue.segment)}: kružnicový tvar je možný len pre dĺžkové parametre.`;
    case 'StationOutsideFunction':
      return `${prefix}staničenie ${formatStation(issue.sta)} je mimo rozsahu funkcie (${formatStation(issue.from)} – ${formatStation(issue.to)}).`;
    case 'InvalidParameterName':
      return `Neplatný názov parametra „${issue.name}“ (písmená, číslice a _, nesmie začínať číslicou ani to byť názov funkcie či „sta“).`;
    case 'DuplicateParameterName':
      return `Názov parametra „${issue.name}“ je použitý viackrát.`;
    case 'UnknownReference':
      return `${prefix}odkazuje na neexistujúci parameter „${issue.name}“.`;
    case 'Cycle':
      return `Kruhová závislosť parametrov: ${issue.path.join(' → ')}.`;
    case 'DependsOnInvalid':
      return `${prefix}závisí od chybného parametra „${issue.dependency}“.`;
    case 'StationNotOnAlignment':
      return `${prefix}staničenie ${formatStation(issue.station)} na osi neexistuje (medzera v skoku staničenia).`;
    case 'AmbiguousStation':
      return `${prefix}staničenie ${formatStation(issue.station)} je na osi dvakrát (prekryv v skoku staničenia).`;
    case 'DuplicatePointName':
      return `${prefix}názov bodu „${issue.name}“ je použitý viackrát.`;
    case 'ForwardPointReference':
      return `${prefix}odkazuje na bod „${issue.reference}“, ktorý je definovaný až neskôr (presuňte ho vyššie).`;
    case 'UnknownPoint':
      return `${prefix}obrys „${issue.loop}“ obsahuje neexistujúci bod „${issue.name}“.`;
    case 'UnknownReferencePoint':
      return `${prefix}referenčný bod „${issue.name}“ neexistuje.`;
    case 'MissingOuterLoop':
      return `${prefix}prierez nemá vonkajší obrys.`;
    case 'OpenLoop':
      return `${prefix}obrys „${issue.loop}“ má menej ako 3 body.`;
    case 'DuplicateVertex':
      return `${prefix}v obryse „${issue.loop}“ splýva bod „${issue.name}“ s nasledujúcim.`;
    case 'SelfIntersection':
      return `${prefix}obrys „${issue.loop}“ sa pretína (hrany od bodov ${issue.edges[0]} a ${issue.edges[1]}).`;
    case 'LoopReversed':
      return `${prefix}obrys „${issue.loop}“ mal opačné poradie bodov — bol otočený.`;
    case 'VoidOutsideOuter':
      return `${prefix}dutina „${issue.loop}“ nie je celá vnútri obrysu.`;
    case 'UnknownAlignment':
      return `${prefix}os cesty „${issue.name}“ v projekte neexistuje.`;
    case 'UnknownBridgeAxis':
      return `${prefix}os mosta neexistuje.`;
    case 'UnknownProfile':
      return `${prefix}prierez neexistuje.`;
    case 'UnknownProfileParameter':
      return `${prefix}prierez nemá parameter „${issue.name}“.`;
    case 'EdgeCurveNotFound':
      return `${prefix}krivka okraja „${issue.curve}“ v projekte neexistuje.`;
    case 'EdgeCurveNotReached':
      return `${prefix}kolmica na os mosta na staničení ${formatStation(issue.station)} nepretína krivku okraja „${issue.curve}“.`;
    case 'StationOutsideSuperstructure':
      return `${prefix}staničenie ${formatStation(issue.station)} je mimo NK (${formatStation(issue.from)} – ${formatStation(issue.to)}).`;
    case 'UnknownSuperstructure':
      return `${prefix}nosná konštrukcia neexistuje.`;
    case 'UnknownBearingLine':
      return `${prefix}os uloženia neexistuje.`;
    case 'BearingLineWithoutSupport':
      return `${prefix}na osi uloženia ${issue.line} zatiaľ nestojí podpera.`;
    case 'UnknownCrossbeamProfile':
      return `${prefix}priečnik na osi uloženia ${issue.line} odkazuje na prierez, ktorý v projekte nie je.`;
    case 'CrossbeamOutsideDeck':
      return `${prefix}priečnik na osi uloženia ${issue.line} siaha mimo NK.`;
    case 'CrossbeamOverlap':
      return `${prefix}priečniky na osiach uloženia ${issue.lines[0]} a ${issue.lines[1]} sa prekrývajú.`;
    case 'BearingLineOccupied':
      return `${prefix}na osi uloženia ${issue.line} stojí viac podpier (${issue.supports.join(', ')}).`;
    case 'InvalidCrossingAngle':
      return `${prefix}uhol kríženia ${formatNumber(issue.angle, 2)}° musí byť medzi 0° a 180° (90° = kolmá podpera).`;
    case 'BearingOutsideDeck':
      return `${prefix}ložisko č. ${issue.index + 1} (${formatNumber(issue.x * 1000, 0)} mm od osi NK) nie je pod spodkom NK.`;
    case 'NonPositiveSupportHeight':
      return `${prefix}výška podpery vychádza ${formatNumber(issue.height * 1000, 0)} mm — horná hrana základu je príliš vysoko.`;
    case 'InvalidDimension':
      return `${prefix}neplatný rozmer ${sk.supports.dimensions[issue.name] ?? issue.name} = ${formatNumber(issue.value, 3)}.`;
    case 'SupportOrder':
      return `${prefix}podpera „${issue.support}“ by mala byť ${issue.expected === 'abutment' ? 'opora (je na konci NK)' : 'pilier (je medzi oporami)'}.`;
    case 'DuplicateBearingLineStation':
      return `${prefix}na staničení ${formatStation(issue.station)} sú dve osi uloženia.`;
    case 'SpanTooShort':
      return `${prefix}pole dĺžky ${formatNumber(issue.length, 3)} m je kratšie ako minimum ${formatNumber(issue.minimum, 1)} m.`;
    case 'SpanAboveEconomic':
      return `${prefix}pole ${formatNumber(issue.length, 1)} m presahuje ekonomické rozpätie ~${formatNumber(issue.economic, 0)} m pre tento typ NK (informatívne, VŠB).`;
    case 'MissingBearingLines':
      return `${prefix}NK nemá aspoň dve osi uloženia — polia sa nedajú určiť.`;
    case 'InvalidJson':
      return `Súbor nie je platný JSON (${issue.detail}).`;
    case 'NotAProfileLibrary':
      return 'Súbor nie je knižnica prierezov (napr. projektový súbor).';
    case 'UnsupportedSchemaVersion':
      return `Nepodporovaná verzia projektového súboru „${issue.version}“.`;
    case 'SchemaViolation':
      return `Neplatná hodnota v súbore${issue.path ? ` (${issue.path})` : ''}: ${issue.message}`;
  }
}
