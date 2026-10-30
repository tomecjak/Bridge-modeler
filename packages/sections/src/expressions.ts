import { evaluate, parse, type Scope } from '@bridge/expr';
import type { ExpressionField, ModelIssue } from '@bridge/model';

export type NumberResult = { ok: true; value: number } | { ok: false; issue: ModelIssue };

// výrazy podpier a prierezov sa vyhodnocujú opakovane → AST v cache podľa textu
const cache = new Map<string, ReturnType<typeof parse>>();

/** Vyhodnotí výraz na číslo (s cache rozparsovaných výrazov); chybu vráti ako problém modelu. */
export function evaluateNumber(text: string, scope: Scope, field: ExpressionField): NumberResult {
  let parsed = cache.get(text);
  if (!parsed) {
    if (cache.size > 5000) cache.clear();
    parsed = parse(text);
    cache.set(text, parsed);
  }
  if (!parsed.ok)
    return {
      ok: false,
      issue: { code: 'ExpressionError', field, expression: text, error: parsed.error },
    };
  const r = evaluate(parsed.ast, scope);
  if (!r.ok)
    return {
      ok: false,
      issue: { code: 'ExpressionError', field, expression: text, error: r.error },
    };
  if (typeof r.value !== 'number') return { ok: false, issue: { code: 'NotANumber', field } };
  return { ok: true, value: r.value };
}
