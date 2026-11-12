import path from 'node:path';
import { lineAt } from './files.js';
import { parseJsonc, type JNode } from './jsonc.js';
import { countPattern, isPlaceholder, redact, secretKindOf } from './sanitize.js';
import {
  addHit,
  addInconclusive,
  endpointOf,
  handleConnection,
  looksLikeConnection,
  scanText,
  URL_PATTERN,
  uriHost,
  type Where,
} from './urls.js';
import type { RepoScan, Scanner } from './types.js';

const XML_CONFIG = /\.config$/i;
const JSON_CONFIG = /^(appsettings|serilog|nlog)[^/]*\.json$/i;

/** Files this scanner reads with structure (section, key, environment). The generic scanner leaves them alone. */
export function isStructuredConfig(rel: string): boolean {
  const base = path.posix.basename(rel);
  return XML_CONFIG.test(base) || JSON_CONFIG.test(base);
}

const LOGGING = /(serilog|logging|nlog|log4net|applicationinsights|appinsights|telemetry|seq|elastic|splunk|datadog|sentry|logstash|graylog|loki|papertrail|newrelic|sumologic|appender|target)/i;
/** Attribute and child names that carry the destination of a log sink. */
const SINK_FIELDS = /^(address|remoteaddress|url|serverurl|nodeuris|endpoint|endpointaddress|ingestionendpoint|host|hostname|server|connectionstring|dsn|remotehost)$/i;

function removeComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => m.replace(/[^\n]/g, ' '));
}

function attributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? '';
  return out;
}

const decode = (v: string): string => v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** One value from a config, already tied to its key. Decides what it is and records it. */
function handleValue(acc: RepoScan, value: string, where: Where, opts: { logging: boolean; connection?: boolean; providerName?: string }): void {
  const v = decode(value).trim();
  if (!v) return;
  if (opts.connection || looksLikeConnection(v)) {
    const done = handleConnection(acc, v, where, opts.providerName, opts.logging);
    if (done) countPattern(acc, opts.logging ? 'log sink' : 'connection string');
    return;
  }
  const parts = opts.logging ? v.split(/[;,]/).map((p) => p.trim()).filter(Boolean) : [v];
  for (const part of parts) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(part) && !opts.logging) continue;
    const { hit, credentials, placeholder } = endpointOf(part, opts.logging);
    if (credentials) redact(acc, where.file, 'url-credentials');
    if (hit) {
      addHit(acc, hit, where);
      countPattern(acc, opts.logging ? 'log sink' : 'url');
    } else if (placeholder) addInconclusive(acc, where, 'host is a placeholder');
  }
}

function scanXml(raw: string, file: string, acc: RepoScan): void {
  const text = removeComments(raw);
  const stack: string[] = [];
  const raws: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
  const logFile = /nlog|log4net|serilog/i.test(path.posix.basename(file));
  let last = 0;

  const textBetween = (from: number, to: number) => {
    const chunk = text.slice(from, to);
    if (!chunk.trim()) return;
    const owner = stack[stack.length - 1] ?? '';
    for (const m of chunk.matchAll(URL_PATTERN)) {
      const where: Where = { file, line: lineAt(text, from + (m.index ?? 0)), key: owner };
      handleValue(acc, m[0], where, { logging: logFile || LOGGING.test(stack.join('/')) });
    }
  };

  for (const m of text.matchAll(tag)) {
    textBetween(last, m.index ?? 0);
    last = (m.index ?? 0) + m[0].length;
    const closing = m[1] === '/';
    const rawName = m[2]!;
    const name = rawName.toLowerCase();
    if (closing) {
      const at = stack.lastIndexOf(name);
      if (at >= 0) {
        stack.length = at;
        raws.length = at;
      }
      continue;
    }
    const attrs = attributes(m[3]!);
    const parent = stack[stack.length - 1] ?? '';
    const rawParent = raws[raws.length - 1] ?? '';
    const ctx = stack.join('/');
    const logging = logFile || LOGGING.test(ctx) || LOGGING.test(name);
    const line = lineAt(text, m.index ?? 0);
    const used = new Set<string>();
    const at = (key: string): Where => ({ file, line, key });

    if (name === 'add' && parent === 'connectionstrings' && attrs.connectionstring !== undefined) {
      used.add('connectionstring');
      handleValue(acc, attrs.connectionstring, at(`connectionStrings.${attrs.name ?? '?'}`), { logging: false, connection: true, providerName: attrs.providername });
    } else if (name === 'add' && parent === 'appsettings' && attrs.value !== undefined) {
      used.add('value');
      const key = attrs.key ?? '?';
      const secret = secretKindOf(key);
      if (secret) redact(acc, file, secret);
      else handleValue(acc, attrs.value, at(`appSettings.${key}`), { logging: LOGGING.test(key) });
    } else if (name === 'endpoint' && parent === 'client' && attrs.address) {
      used.add('address');
      const uri = uriHost(attrs.address);
      const key = `serviceModel.client.${attrs.name ?? attrs.contract ?? 'endpoint'}`;
      if (uri?.host) {
        addHit(acc, { protocol: 'soap', host: uri.host, path: '' }, at(key));
        countPattern(acc, 'WCF client endpoint');
      } else if (isPlaceholder(attrs.address)) addInconclusive(acc, at(key), 'host is a placeholder');
    } else if (name === 'network' && /mailsettings/.test(ctx) && attrs.host) {
      used.add('host');
      const host = /^[\w.-]+$/.test(attrs.host) ? attrs.host.toLowerCase() : null;
      if (host) {
        addHit(acc, { protocol: 'smtp', host, path: '' }, at('mailSettings.smtp.network'));
        countPattern(acc, 'smtp');
      }
      if (attrs.password) redact(acc, file, 'password');
      used.add('password');
    }

    // Everything else: log sink fields, URLs and secrets found in attributes.
    for (const [attr, val] of Object.entries(attrs)) {
      if (used.has(attr) || attr.startsWith('xmlns') || attr.startsWith('xsi:') || attr.startsWith('xdt:')) continue;
      const secret = secretKindOf(attr) ?? (/^instrumentationkey$/i.test(attr) ? 'key' : null);
      if (secret) {
        redact(acc, file, secret);
        continue;
      }
      const key = `${rawName}@${attr}`;
      if (logging && SINK_FIELDS.test(attr) && !(name === 'add' && parent === 'appsettings')) {
        handleValue(acc, val, at(key), { logging: true, connection: /connectionstring/i.test(attr) });
      } else if (logging && name !== 'appender' && parent === 'appender' && SINK_FIELDS.test(name) && attr === 'value') {
        handleValue(acc, val, at(`${rawParent}.${rawName}`), { logging: true, connection: /connectionstring/i.test(name) });
      } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(val.trim())) {
        handleValue(acc, val, at(key), { logging });
      }
    }
    if (m[4] !== '/') {
      stack.push(name);
      raws.push(rawName);
    }
  }
  textBetween(last, text.length);
}

function walkJson(node: JNode, trail: string[], file: string, acc: RepoScan, lineOf: number): void {
  if (node.t === 'obj') {
    for (const e of node.entries) walkJson(e.value, [...trail, e.key], file, acc, e.line);
  } else if (node.t === 'arr') {
    node.items.forEach((item, i) => walkJson(item, [...trail, String(i)], file, acc, lineOf));
  } else if (node.t === 'str') {
    const key = trail.join(':');
    const last = trail[trail.length - 1] ?? '';
    const secret = secretKindOf(last) ?? (/^instrumentationkey$/i.test(last) ? 'key' : null);
    if (secret) {
      redact(acc, file, secret);
      return;
    }
    const logging = LOGGING.test(trail.join('/'));
    const inConnections = trail.some((t) => /^connectionstrings$/i.test(t)) || /connection[-_]?string$/i.test(last);
    const where: Where = { file, line: node.line, key };
    if (inConnections || looksLikeConnection(node.value)) handleValue(acc, node.value, where, { logging, connection: true });
    else if (logging && (SINK_FIELDS.test(last) || /^[a-z][a-z0-9+.-]*:\/\//i.test(node.value))) handleValue(acc, node.value, where, { logging: true });
    else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(node.value)) handleValue(acc, node.value, where, { logging: false });
  }
}

/** .config XML (Web.config, App.config, transforms, NLog, log4net) and appsettings/Serilog JSON, with section, key and environment. */
export const configScanner: Scanner = {
  name: 'config',
  async scan(repo, acc) {
    for (const file of repo.list().filter(isStructuredConfig)) {
      const text = await repo.read(file);
      if (XML_CONFIG.test(file)) {
        scanXml(text, file, acc);
        continue;
      }
      try {
        walkJson(parseJsonc(text), [], file, acc, 1);
      } catch (err) {
        addInconclusive(acc, { file }, `${err instanceof Error ? err.message : 'unreadable'}; read as plain text`);
        scanText(text, file, acc);
      }
    }
  },
};
