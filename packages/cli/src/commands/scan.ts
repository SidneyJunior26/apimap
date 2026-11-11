import path from 'node:path';
import {
  buildHostIndex,
  edgeKey,
  loadCatalog,
  mergeScan,
  resolveHost,
  sameValue,
  ServiceSchema,
  writeServiceFile,
  type CatalogService,
  type Evidence,
  type ScannedDependency,
  type Service,
} from '@apimap/core';
import { scanRepo, type RepoScan } from '@apimap/scanners';
import fg from 'fast-glob';
import pc from 'picocolors';
import { formatDiagnostics } from '../report.js';
import { loadAndValidate } from './check.js';

export interface ScanOptions {
  /** Repository directory globs; defaults to `sources` in apimap.config.yaml. Relative to the catalog. */
  source?: string[];
  dryRun?: boolean;
  /** Create `external` services for unresolved hosts that look like domains. */
  createStubs?: boolean;
}

const MAX_EVIDENCE = 3;

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'service';

export const stubId = (host: string): string => slugify(host.replace(/^(www|api)\./, ''));

function serviceIdFor(repoDir: string, scan: RepoScan, services: CatalogService[]): string {
  if (scan.declared?.id) return scan.declared.id;
  const base = path.basename(repoDir);
  const byRepo = services.find((s) => s.repo && (s.repo === base || s.repo.replace(/\/+$/, '').endsWith(`/${base}`)));
  return byRepo?.id ?? slugify(base);
}

async function expandSources(root: string, globs: string[]): Promise<string[]> {
  const dirs = new Set<string>();
  for (const g of globs) {
    const pattern = path.isAbsolute(g) ? g : path.join(root, g);
    for (const d of await fg(pattern.split(path.sep).join('/'), { onlyDirectories: true, absolute: true })) dirs.add(path.resolve(d));
  }
  return [...dirs].sort();
}

interface Unresolved {
  host: string;
  protocol: string;
  from: string;
  evidence: Evidence;
}

/** Returns the process exit code. */
export async function runScan(dir: string, opts: ScanOptions): Promise<number> {
  const root = path.resolve(dir);
  const { catalog, diagnostics } = await loadCatalog(root);
  const loadErrors = diagnostics.filter((d) => d.level === 'error');
  if (loadErrors.length) {
    console.error(formatDiagnostics(loadErrors));
    console.error('scan aborted: fix catalog errors first so no file is overwritten');
    return 1;
  }

  const globs = opts.source?.length ? opts.source : catalog.config.sources;
  if (!globs.length) {
    console.error('no sources: pass --source <glob> or set "sources" in apimap.config.yaml');
    return 1;
  }
  const repos = await expandSources(root, globs);
  if (!repos.length) {
    console.error(`no repository directories matched: ${globs.join(', ')}`);
    return 1;
  }

  // Pass 1: scan every repo and learn which hosts belong to which service.
  const scans = await Promise.all(repos.map(async (repoDir) => ({ repoDir, scan: await scanRepo(repoDir) })));
  const assigned = scans.map(({ repoDir, scan }) => ({ repoDir, scan, id: serviceIdFor(repoDir, scan, catalog.services) }));
  const byId = new Map<string, CatalogService>(catalog.services.map((s) => [s.id, s]));
  const index = buildHostIndex([
    ...catalog.services,
    ...assigned.map(({ id, scan }) => ({ id, hosts: [...scan.hints.hosts, ...(scan.declared?.hosts ?? [])] })),
  ]);

  const unresolved: Unresolved[] = [];
  const stubs = new Map<string, Service>();
  const lines: string[] = [];
  let written = 0;

  // Pass 2: resolve references and merge into the catalog.
  for (const { repoDir, scan, id } of assigned) {
    const deps = new Map<string, ScannedDependency>();
    const addDep = (target: string, protocol: string, evidence: Evidence[], confidence: ScannedDependency['confidence'] = 'confirmed', note?: string) => {
      const key = edgeKey({ target, protocol });
      const prev = deps.get(key);
      if (prev) {
        for (const e of evidence) if (prev.evidence.length < MAX_EVIDENCE && !prev.evidence.some((p) => sameValue(p, e))) prev.evidence.push(e);
        return;
      }
      deps.set(key, { target, protocol, confidence, origin: 'scan', evidence: evidence.slice(0, MAX_EVIDENCE), ...(note ? { note } : {}) });
    };

    for (const ref of scan.references) {
      let target = resolveHost(index, ref.host, ref.path);
      if (!target && opts.createStubs && ref.host.includes('.')) {
        target = stubId(ref.host);
        if (!byId.has(target) && !stubs.has(target)) {
          stubs.set(target, ServiceSchema.parse({ id: target, name: ref.host, kind: 'external', hosts: [ref.host] }));
        }
      }
      if (!target) {
        unresolved.push({ host: ref.host, protocol: ref.protocol, from: id, evidence: ref.evidence });
        continue;
      }
      addDep(target, ref.protocol, [ref.evidence]);
    }
    for (const d of scan.declared?.dependsOn ?? []) addDep(d.target, d.protocol, d.evidence, d.confidence, d.note);

    const existing = byId.get(id);
    const merged = mergeScan(existing, id, scan.hints, [...deps.values()]);
    let service = merged.service;
    if (scan.declared && !service.locked) {
      const { id: _id, dependsOn: _deps, locked: _locked, ...fields } = scan.declared;
      service = { ...service, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) };
    }
    const changed = !existing || !sameValue(existing, service);
    const file = existing?.file ?? `services/${id}.yaml`;
    const rel = path.relative(root, repoDir);
    const label = rel && !rel.startsWith('..') ? rel : repoDir;

    if (existing?.locked) lines.push(`${pc.dim('=')} ${id} ${pc.dim('(locked)')}`);
    else if (!existing) lines.push(`${pc.green('+')} ${id} ${pc.dim(`new, from ${label}`)}`);
    else if (changed) lines.push(`${pc.yellow('~')} ${id}`);
    else lines.push(`${pc.dim('=')} ${id} ${pc.dim('(unchanged)')}`);
    for (const k of merged.added) lines.push(`    ${pc.green('+')} ${k}`);
    for (const k of merged.removed) lines.push(`    ${pc.red('-')} ${k}`);
    for (const e of scan.errors) lines.push(`    ${pc.red('!')} ${e.file}: ${e.message}`);

    if (changed && !opts.dryRun && (await writeServiceFile(path.join(root, file), service))) written++;
  }

  for (const [sid, stub] of stubs) {
    lines.push(`${pc.green('+')} ${sid} ${pc.dim('(external stub)')}`);
    if (!opts.dryRun && (await writeServiceFile(path.join(root, `services/${sid}.yaml`), stub))) written++;
  }

  console.log(`scanned ${repos.length} repositories${opts.dryRun ? ' (dry run, nothing written)' : ''}`);
  console.log(lines.join('\n'));
  if (unresolved.length) {
    console.log(`\nunresolved hosts (add them to a service's "hosts" or use --create-stubs):`);
    const seen = new Set<string>();
    for (const u of unresolved) {
      const key = `${u.host}:${u.protocol}:${u.from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${u.host} ${pc.dim(`(${u.protocol}) from ${u.from} at ${u.evidence.file}${u.evidence.line ? `:${u.evidence.line}` : ''}`)}`);
    }
  }
  if (!opts.dryRun) {
    console.log(`\n${written} file${written === 1 ? '' : 's'} written`);
    const { diagnostics: after } = await loadAndValidate(root);
    if (after.length) console.log(formatDiagnostics(after));
  }
  return 0;
}
