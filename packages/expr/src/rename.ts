import { tokenize } from './tokenizer.ts';

/**
 * Premenuje odkaz na parameter vo výraze (nie volania funkcií), zvyšok textu ponechá bez zmeny.
 * Výraz s lexikálnou chybou vráti nezmenený.
 */
export function renameIdentifier(text: string, from: string, to: string): string {
  const lexed = tokenize(text);
  if ('error' in lexed) return text;
  const tokens = lexed.tokens;
  let result = '';
  let last = 0;
  tokens.forEach((t, i) => {
    const next = tokens[i + 1];
    const isCall = next?.kind === 'op' && next.text === '(';
    if (t.kind === 'ident' && t.text === from && !isCall) {
      result += text.slice(last, t.span.start) + to;
      last = t.span.end;
    }
  });
  return result + text.slice(last);
}
