import { formatStation } from '@bridge/alignment';
import type { ExprError } from '@bridge/expr';
import type { ExpressionField, ModelIssue } from '@bridge/model';

const FIELD: Record<ExpressionField, string> = {
  value: 'hodnota',
  expr: 'výraz',
  v0: 'hodnota na začiatku úseku',
  v1: 'hodnota na konci úseku',
};

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
  const prefix = issue.parameter ? `${issue.parameter}: ` : '';
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
    case 'InvalidJson':
      return `Súbor nie je platný JSON (${issue.detail}).`;
    case 'UnsupportedSchemaVersion':
      return `Nepodporovaná verzia projektového súboru „${issue.version}“.`;
    case 'SchemaViolation':
      return `Neplatná hodnota v súbore${issue.path ? ` (${issue.path})` : ''}: ${issue.message}`;
  }
}
