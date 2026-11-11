import type { Service } from './schema.js';

export interface Endpoint {
  protocol: string;
  /** Lowercase host without credentials or port. */
  host: string;
  /** Path without trailing slash, query or fragment. */
  path: string;
}

const SCHEMES: Record<string, string> = {
  http: 'http',
  https: 'http',
  ws: 'ws',
  wss: 'ws',
  ftp: 'ftp',
  ftps: 'ftp',
  sftp: 'ftp',
  amqp: 'amqp',
  amqps: 'amqp',
  kafka: 'kafka',
  grpc: 'grpc',
  grpcs: 'grpc',
};

const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** Parses a URL-like string. Credentials, port, query and fragment are dropped and never returned. */
export function parseEndpoint(raw: string): Endpoint | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#\s]*)([^?#\s]*)(\?[^#\s]*)?/i.exec(raw.trim());
  if (!m) return null;
  const protocol = SCHEMES[m[1]!.toLowerCase()];
  if (!protocol) return null;
  const authority = m[2]!.split('@').pop()!;
  const host = authority.replace(/:\d*$/, '').toLowerCase();
  if (!HOST_PATTERN.test(host)) return null;
  const path = m[3]!.replace(/\/+$/, '');
  const query = (m[4] ?? '').toLowerCase();
  const soap = protocol === 'http' && (/\.(svc|asmx)$/i.test(path) || /[?&]wsdl\b/.test(query));
  return { protocol: soap ? 'soap' : protocol, host, path };
}

export interface HostIndex {
  /** host -> list of [pathPrefix, serviceId], longest prefix first. */
  byHost: Map<string, Array<[string, string]>>;
  ids: Set<string>;
}

export function buildHostIndex(services: Pick<Service, 'id' | 'hosts'>[]): HostIndex {
  const byHost = new Map<string, Array<[string, string]>>();
  for (const s of services) {
    for (const entry of s.hosts) {
      const [host, ...rest] = entry.toLowerCase().replace(/^[a-z]+:\/\//, '').split('/');
      const prefix = rest.length ? `/${rest.join('/')}`.replace(/\/+$/, '') : '';
      byHost.set(host!, [...(byHost.get(host!) ?? []), [prefix, s.id]]);
    }
  }
  for (const list of byHost.values()) list.sort((a, b) => b[0].length - a[0].length);
  return { byHost, ids: new Set(services.map((s) => s.id)) };
}

/** Finds the service owning `host` + `path`. Falls back to a service whose id equals the host (docker-compose names). */
export function resolveHost(index: HostIndex, host: string, path: string): string | null {
  const h = host.toLowerCase();
  const p = path.toLowerCase();
  for (const [prefix, id] of index.byHost.get(h) ?? []) {
    if (prefix === '' || p === prefix || p.startsWith(`${prefix}/`)) return id;
  }
  return index.ids.has(h) ? h : null;
}

/**
 * True when `host` belongs to one of the internal domains. `acme.internal` matches itself and subdomains;
 * `*.acme.internal` matches subdomains only. Single-label hosts (docker-compose names) are always internal.
 */
export function isInternalHost(host: string, internalDomains: string[]): boolean {
  const h = host.trim().toLowerCase();
  if (!h.includes('.')) return true;
  return internalDomains.some((raw) => {
    const d = raw.trim().toLowerCase();
    if (!d) return false;
    if (d.startsWith('*.')) return h.endsWith(d.slice(1));
    return h === d || h.endsWith(`.${d}`);
  });
}
