import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { parse } from 'yaml';
import type { ZodError } from 'zod';
import { DEFAULT_KINDS, FALLBACK_KIND_COLOR, type KindDef } from './kinds.js';
import { ConfigSchema, ServiceSchema, type Config, type Service } from './schema.js';

export interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
  path?: string;
}

export type CatalogService = Service & { file: string };

export interface Catalog {
  root: string;
  config: Config;
  kinds: Record<string, KindDef>;
  services: CatalogService[];
}

export const CONFIG_FILE = 'apimap.config.yaml';
export const SERVICES_GLOB = 'services/**/*.{yaml,yml}';

type Parsed = { ok: true; value: unknown } | { ok: false; diagnostic: Diagnostic };

function parseYaml(text: string, file: string): Parsed {
  try {
    return { ok: true, value: parse(text) };
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0]! : String(err);
    return { ok: false, diagnostic: { level: 'error', code: 'yaml-parse', file, message } };
  }
}

function isMapping(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function schemaDiagnostics(err: ZodError, file: string): Diagnostic[] {
  return err.issues.map((issue) => ({
    level: 'error' as const,
    code: 'schema',
    file,
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function mergeKinds(overrides: Config['kinds']): Record<string, KindDef> {
  const kinds: Record<string, KindDef> = { ...DEFAULT_KINDS };
  for (const [id, override] of Object.entries(overrides)) {
    const base = kinds[id];
    const merged = { ...base, ...override };
    kinds[id] = {
      ...merged,
      label: merged.label ?? id,
      color: merged.color ?? FALLBACK_KIND_COLOR,
    };
  }
  return kinds;
}

async function loadConfig(root: string, diagnostics: Diagnostic[]): Promise<Config> {
  const defaults = ConfigSchema.parse({});
  let text: string;
  try {
    text = await readFile(path.join(root, CONFIG_FILE), 'utf8');
  } catch {
    return defaults;
  }
  const parsed = parseYaml(text, CONFIG_FILE);
  if (!parsed.ok) {
    diagnostics.push(parsed.diagnostic);
    return defaults;
  }
  if (parsed.value == null) return defaults;
  const result = ConfigSchema.safeParse(parsed.value);
  if (!result.success) {
    diagnostics.push(...schemaDiagnostics(result.error, CONFIG_FILE));
    return defaults;
  }
  return result.data;
}

/** Loads config and every service file under `root`. Never throws on bad files: problems become diagnostics. */
export async function loadCatalog(root: string): Promise<{ catalog: Catalog; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const config = await loadConfig(root, diagnostics);
  const files = (await fg(SERVICES_GLOB, { cwd: root, onlyFiles: true })).sort();
  const services: CatalogService[] = [];

  for (const file of files) {
    const text = await readFile(path.join(root, file), 'utf8');
    const parsed = parseYaml(text, file);
    if (!parsed.ok) {
      diagnostics.push(parsed.diagnostic);
      continue;
    }
    if (!isMapping(parsed.value)) {
      diagnostics.push({ level: 'error', code: 'not-a-mapping', file, message: 'service file must contain a YAML mapping (key: value)' });
      continue;
    }
    const result = ServiceSchema.safeParse(parsed.value);
    if (!result.success) {
      diagnostics.push(...schemaDiagnostics(result.error, file));
      continue;
    }
    services.push({ ...result.data, file });
  }

  services.sort((a, b) => a.id.localeCompare(b.id) || a.file.localeCompare(b.file));
  return { catalog: { root, config, kinds: mergeKinds(config.kinds), services }, diagnostics };
}
