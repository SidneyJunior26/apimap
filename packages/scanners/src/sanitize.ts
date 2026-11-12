import type { RepoScan } from './types.js';

/** Connection-string keys whose values are credentials. Only their presence is counted, never the value. */
const SECRET_KEYS: Array<[RegExp, string]> = [
  [/^(password|pwd|pass)$/i, 'password'],
  [/^(user id|uid|user|username|userid)$/i, 'user'],
  [/^(accountkey|sharedaccesskey|sharedaccesssignature|accesskey|secretkey|apikey|api[-_ ]key|instrumentationkey)$/i, 'key'],
  [/^(token|authtoken|bearer|secret|clientsecret|client[-_ ]secret)$/i, 'token'],
  [/^(certificate|certpassword|pfx)$/i, 'certificate'],
];

/** Names of config keys (JSON/XML/env) whose values must never be read as dependencies. */
const SECRET_NAME = /(pass(word)?|pwd|secret|token|api[-_]?key|account[-_]?key|private[-_]?key|certificate|credential|connection[-_]?string)$/i;
const SECRET_KIND: Array<[RegExp, string]> = [
  [/pass|pwd/i, 'password'],
  [/secret|token|credential/i, 'token'],
  [/key/i, 'key'],
  [/certificate/i, 'certificate'],
];

export function secretKindOf(key: string): string | null {
  const last = key.split(/[.:/@]/).pop() ?? key;
  if (!SECRET_NAME.test(last) || /connection[-_]?string$/i.test(last)) return null;
  return SECRET_KIND.find(([re]) => re.test(last))?.[1] ?? 'secret';
}

export function secretKindOfConnectionKey(key: string): string | null {
  return SECRET_KEYS.find(([re]) => re.test(key.trim()))?.[1] ?? null;
}

/** Records a redaction. Only the file, the kind and a count are kept. */
export function redact(acc: RepoScan, file: string, kind: string, count = 1): void {
  const found = acc.redactions.find((r) => r.file === file && r.kind === kind);
  if (found) found.count += count;
  else acc.redactions.push({ file, kind, count });
}

export function countPattern(acc: RepoScan, name: string): void {
  acc.patterns[name] = (acc.patterns[name] ?? 0) + 1;
}

/** Placeholders such as ${HOST}, %HOST%, {0} or #{Host}# are templates, not hosts. */
export function isPlaceholder(value: string): boolean {
  return /\$\{|%[A-Za-z_]+%|#\{|\{\d+\}|\{\{|<[A-Za-z_]+>|\$\(/.test(value);
}

const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** Lowercase host without credentials, port, instance or path, or null when it is not a plain hostname or IP. */
export function cleanHost(raw: string): string | null {
  let h = raw.trim().replace(/^(tcp|np|lpc):/i, '');
  h = h.split(/[\\/]/)[0]!.split(',')[0]!.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === '.' || h === 'localhost' || h.startsWith('(') || /\.(db|sqlite3?|mdf|sdf|accdb|mdb)$/.test(h)) return null;
  return HOST_PATTERN.test(h) ? h : null;
}
