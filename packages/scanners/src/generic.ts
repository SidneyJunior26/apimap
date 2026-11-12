import { parseEndpoint } from '@svclens/core';
import path from 'node:path';
import { ALLOWED_ENV_FILES, lineAt } from './files.js';
import type { Scanner } from './types.js';

const CONFIG_EXT = new Set(['.json', '.yaml', '.yml', '.xml', '.config', '.properties', '.toml', '.ini', '.conf']);
/** Manifest files whose URLs point to registries, docs or repos, not runtime dependencies. */
const SKIP_FILES = new Set(['package.json', 'composer.json', 'tsconfig.json', 'jsconfig.json']);
/** Hosts that show up in configs but are never service dependencies. */
export const NOISE_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal',
  'www.w3.org', 'w3.org', 'schemas.xmlsoap.org', 'schemas.microsoft.com', 'json-schema.org', 'json.schemastore.org', 'schemastore.org',
  'raw.githubusercontent.com', 'github.com', 'gitlab.com', 'bitbucket.org', 'registry.npmjs.org', 'api.nuget.org', 'nuget.org',
  'example.com', 'www.example.com', 'tempuri.org', 'schemas.openxmlformats.org', 'xmlns.oracle.com', 'maven.apache.org',
]);

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`,;)\]}|\\]+/gi;

export function isConfigFile(rel: string): boolean {
  const base = path.posix.basename(rel);
  if (SKIP_FILES.has(base)) return false;
  return ALLOWED_ENV_FILES.includes(base) || CONFIG_EXT.has(path.posix.extname(base).toLowerCase());
}

/** Finds URL-like endpoints in configuration files. */
export const genericScanner: Scanner = {
  name: 'generic',
  async scan(repo, acc) {
    for (const file of repo.list().filter(isConfigFile)) {
      const text = await repo.read(file);
      for (const m of text.matchAll(URL_PATTERN)) {
        const ep = parseEndpoint(m[0]);
        if (!ep || NOISE_HOSTS.has(ep.host)) continue;
        acc.references.push({ ...ep, evidence: { file, line: lineAt(text, m.index ?? 0) } });
      }
    }
  },
};
