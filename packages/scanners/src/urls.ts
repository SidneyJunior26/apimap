import { parseEndpoint } from '@svclens/core';
import path from 'node:path';
import { lineAt } from './files.js';
import { cleanHost, isPlaceholder, redact, secretKindOfConnectionKey } from './sanitize.js';
import { protocolForProvider, providerFrom } from './providers.js';
import type { RepoScan } from './types.js';

/** Hosts that show up in configs but are never service dependencies. */
export const NOISE_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal',
  'www.w3.org', 'w3.org', 'schemas.xmlsoap.org', 'schemas.microsoft.com', 'json-schema.org', 'json.schemastore.org', 'schemastore.org',
  'raw.githubusercontent.com', 'github.com', 'gitlab.com', 'bitbucket.org', 'registry.npmjs.org', 'api.nuget.org', 'nuget.org',
  'example.com', 'www.example.com', 'tempuri.org', 'schemas.openxmlformats.org', 'xmlns.oracle.com', 'maven.apache.org',
  'logging.apache.org', 'nlog-project.org', 'www.nlog-project.org', 'go.microsoft.com', 'aka.ms',
]);

export const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`,;)\]}|\\]+/gi;
const ENV_WORDS = /^(development|dev|staging|stage|hml|homolog|homologacao|qa|test|testing|uat|prod|production|release|debug|local|sandbox)$/i;

/** Environment a config file belongs to, from its name (`Web.Release.config`, `appsettings.Production.json`, `.env.development`). */
export function envOf(file: string): string | undefined {
  const base = path.posix.basename(file);
  const named = /^(?:appsettings|web|app|nlog|log4net|serilog)\.([^.]+)\.(?:json|config)$/i.exec(base);
  if (named && !/^(exe|dll)$/i.test(named[1]!)) return named[1];
  const env = /^\.env\.([^.]+)$/i.exec(base);
  if (env) return /^(example|sample|template)$/i.test(env[1]!) ? undefined : env[1];
  const parts = base.split('.');
  return parts.slice(1, -1).find((p) => ENV_WORDS.test(p));
}

/** Key that owns the value on this line: `KEY=...`, `"Key": "..."`, `key: ...`. */
export function keyOnLine(text: string, index: number): string | undefined {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const m = /^\s*(?:-\s*)?["']?([\w.:-]+)["']?\s*[:=]/.exec(text.slice(start, index));
  return m?.[1];
}

export interface Hit {
  protocol: string;
  host: string;
  path: string;
  provider?: string;
}

/** Host of any `scheme://` value. Userinfo is dropped; `credentials` tells the caller to count a redaction. */
export function uriHost(value: string): { host: string | null; credentials: boolean; scheme: string } | null {
  const m = /^\s*(?:jdbc:)?([a-z][a-z0-9+.-]*):\/\/([^/?#;]*)/i.exec(value);
  if (!m) return null;
  const at = m[2]!.lastIndexOf('@');
  return { host: cleanHost(m[2]!.slice(at + 1)), credentials: at >= 0, scheme: m[1]!.toLowerCase() };
}

const KEY_HOST = new Set(['server', 'data source', 'datasource', 'host', 'address', 'addr', 'network address', 'hostname']);

export function looksLikeConnection(value: string): boolean {
  return /(^|;)\s*(server|data source|host|address|addr|network address|endpoint)\s*=/i.test(value) || /^\s*(jdbc:)?(mongodb(\+srv)?|rediss?|postgres(ql)?|mysql|sqlserver):\/\//i.test(value);
}

export interface ConnectionInfo {
  hit: Hit | null;
  /** Credential kinds found; counted, never stored. */
  secrets: string[];
  reason?: string;
}

/** Reads the host of an ADO.NET, JDBC or URI connection string. Passwords, users and keys are only counted. */
export function parseConnection(value: string, providerName?: string, logging = false): ConnectionInfo {
  const provider = providerFrom(providerName, value);
  const protocol = logging ? 'logs' : protocolForProvider(provider);
  const uri = uriHost(value);
  if (uri) {
    const secrets = uri.credentials ? ['url-credentials'] : [];
    if (!uri.host) return { hit: null, secrets, reason: isPlaceholder(value) ? 'host is a placeholder' : 'no recognizable host' };
    return { hit: { protocol, host: uri.host, path: '', ...(provider ? { provider } : {}) }, secrets };
  }
  const secrets: string[] = [];
  let host: string | null = null;
  const parts = value.split(';');
  // StackExchange.Redis style: "host:6379,password=...,ssl=true"
  const first = parts[0]!.split(',')[0]!;
  const bareFirst = !first.includes('=') && /^[\w.-]+(:\d+)?$/.test(first.trim());
  for (const [i, part] of parts.entries()) {
    const chunks = i === 0 && bareFirst ? part.split(',').slice(1) : [part];
    if (i === 0 && bareFirst) host = cleanHost(first);
    for (const chunk of chunks) {
      const eq = chunk.indexOf('=');
      if (eq < 0) continue;
      const key = chunk.slice(0, eq).trim().toLowerCase();
      const val = chunk.slice(eq + 1).trim();
      const secret = secretKindOfConnectionKey(key);
      if (secret) {
        secrets.push(secret);
        continue;
      }
      if (key === 'endpoint' || key === 'ingestionendpoint') {
        const u = uriHost(val);
        if (u?.host && !host) return { hit: { protocol: u.scheme === 'sb' && !logging ? 'amqp' : protocol, host: u.host, path: '' }, secrets };
      }
      if (KEY_HOST.has(key) && !host) {
        const desc = /\bHOST\s*=\s*([^)\s]+)/i.exec(val);
        host = cleanHost(desc ? desc[1]! : val);
        if (!host && isPlaceholder(val)) return { hit: null, secrets, reason: 'host is a placeholder' };
      }
    }
  }
  // Oracle descriptors hold "=" signs inside the value, so they get a second look.
  host ??= cleanHost(/\bHOST\s*=\s*([^)\s]+)/i.exec(value)?.[1] ?? '');
  if (!host) return { hit: null, secrets, reason: isPlaceholder(value) ? 'host is a placeholder' : 'no recognizable host' };
  return { hit: { protocol, host, path: '', ...(provider ? { provider } : {}) }, secrets };
}

export interface Where {
  file: string;
  key?: string;
  line?: number;
}

/** Adds a reference, ignoring noise hosts. Evidence carries file, line, key and environment only. */
export function addHit(acc: RepoScan, hit: Hit, where: Where): void {
  if (NOISE_HOSTS.has(hit.host)) return;
  const env = envOf(where.file);
  acc.references.push({
    protocol: hit.protocol,
    host: hit.host,
    path: hit.path,
    ...(hit.provider ? { provider: hit.provider } : {}),
    evidence: { file: where.file, ...(where.line ? { line: where.line } : {}), ...(where.key ? { key: where.key } : {}), ...(env ? { env } : {}) },
  });
}

export function addInconclusive(acc: RepoScan, where: Where, reason: string): void {
  acc.inconclusive.push({ file: where.file, ...(where.key ? { key: where.key } : {}), ...(where.line ? { line: where.line } : {}), reason });
}

/** Handles a connection string found at `where`. Returns true when it produced a reference. */
export function handleConnection(acc: RepoScan, value: string, where: Where, providerName?: string, logging = false): boolean {
  const info = parseConnection(value, providerName, logging);
  for (const kind of info.secrets) redact(acc, where.file, kind);
  if (!info.hit) {
    if (info.reason) addInconclusive(acc, where, info.reason);
    return false;
  }
  addHit(acc, info.hit, where);
  return true;
}

/** Endpoint from a URL-like value. `logging` accepts any scheme (tcp, udp, syslog) and labels the relation `logs`. */
export function endpointOf(value: string, logging: boolean): { hit: Hit | null; credentials: boolean; placeholder: boolean } {
  const uri = uriHost(value);
  const credentials = uri?.credentials ?? false;
  const placeholder = isPlaceholder(value);
  if (logging) {
    const host = uri ? uri.host : cleanHost(value);
    return { hit: host ? { protocol: 'logs', host, path: '' } : null, credentials, placeholder };
  }
  const ep = parseEndpoint(value);
  return { hit: ep, credentials, placeholder };
}

/** Plain-text pass: finds `scheme://` values and connection URIs in any file. Used for files without structure. */
export function scanText(text: string, file: string, acc: RepoScan): void {
  for (const m of text.matchAll(URL_PATTERN)) {
    const index = m.index ?? 0;
    const where: Where = { file, line: lineAt(text, index), key: keyOnLine(text, index) };
    const value = m[0];
    if (looksLikeConnection(value) && !/^(https?|wss?|ftps?|sftp|amqps?|kafka|grpcs?):/i.test(value)) {
      handleConnection(acc, value, where);
      continue;
    }
    const { hit, credentials, placeholder } = endpointOf(value, false);
    if (credentials) redact(acc, file, 'url-credentials');
    if (hit) addHit(acc, hit, where);
    else if (placeholder && /:\/\//.test(value)) addInconclusive(acc, where, 'host is a placeholder');
  }
}
