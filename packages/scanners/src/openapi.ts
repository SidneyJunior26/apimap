import { parseEndpoint } from '@svclens/core';
import { parse } from 'yaml';
import { NOISE_HOSTS } from './generic.js';
import type { Scanner } from './types.js';

const SPEC_FILE = /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/i;

interface Spec {
  info?: { title?: string; description?: string };
  servers?: Array<{ url?: string }>;
  host?: string;
}

/** The service's own OpenAPI/Swagger spec: name, description and the hosts it is served from. */
export const openapiScanner: Scanner = {
  name: 'openapi',
  async scan(repo, acc) {
    const file = repo
      .list()
      .filter((f) => SPEC_FILE.test(f))
      .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
    if (!file) return;
    let spec: Spec;
    try {
      spec = (parse(await repo.read(file)) ?? {}) as Spec;
    } catch (err) {
      acc.errors.push({ file, message: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (spec.info?.title && !acc.hints.name) acc.hints.name = spec.info.title;
    if (spec.info?.description && !acc.hints.description) acc.hints.description = spec.info.description.trim();
    const urls = [...(spec.servers ?? []).map((s) => s.url ?? ''), spec.host ? `https://${spec.host}` : ''];
    for (const url of urls) {
      const ep = parseEndpoint(url);
      if (ep && !NOISE_HOSTS.has(ep.host)) acc.hints.hosts.push(ep.host);
    }
  },
};
