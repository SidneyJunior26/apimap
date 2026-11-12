/** JSON with comments and trailing commas, keeping the line of every value. appsettings files often have both. */
export type JNode =
  | { t: 'obj'; entries: Array<{ key: string; line: number; value: JNode }> }
  | { t: 'arr'; items: JNode[] }
  | { t: 'str'; value: string; line: number }
  | { t: 'other' };

export function parseJsonc(text: string): JNode {
  let i = 0;
  let line = 1;
  const fail = (msg: string): never => {
    throw new Error(`invalid JSON at line ${line}: ${msg}`);
  };
  const ws = () => {
    for (;;) {
      const c = text[i];
      if (c === '\n') { line++; i++; }
      else if (c === ' ' || c === '\t' || c === '\r' || c === '﻿') i++;
      else if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; }
      else if (c === '/' && text[i + 1] === '*') {
        i += 2;
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] === '\n') line++; i++; }
        i += 2;
      } else return;
    }
  };
  const str = (): string => {
    i++;
    let out = '';
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\n') fail('newline in string');
      if (text[i] === '\\') {
        const n = text[i + 1];
        if (n === 'u') { out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16)); i += 6; continue; }
        out += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' } as Record<string, string>)[n ?? ''] ?? n;
        i += 2;
        continue;
      }
      out += text[i++];
    }
    if (text[i] !== '"') fail('unterminated string');
    i++;
    return out;
  };
  const value = (): JNode => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const entries: Array<{ key: string; line: number; value: JNode }> = [];
      for (;;) {
        ws();
        if (text[i] === '}') { i++; break; }
        if (text[i] !== '"') fail('expected a key');
        const at = line;
        const key = str();
        ws();
        if (text[i++] !== ':') fail('expected ":"');
        entries.push({ key, line: at, value: value() });
        ws();
        if (text[i] === ',') i++;
        else if (text[i] !== '}') fail('expected "," or "}"');
      }
      return { t: 'obj', entries };
    }
    if (c === '[') {
      i++;
      const items: JNode[] = [];
      for (;;) {
        ws();
        if (text[i] === ']') { i++; break; }
        items.push(value());
        ws();
        if (text[i] === ',') i++;
        else if (text[i] !== ']') fail('expected "," or "]"');
      }
      return { t: 'arr', items };
    }
    if (c === '"') { const at = line; return { t: 'str', value: str(), line: at }; }
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 40));
    if (!m) return fail('unexpected token');
    i += m[0].length;
    return { t: 'other' };
  };
  const root = value();
  ws();
  if (i < text.length) fail('trailing content');
  return root;
}
