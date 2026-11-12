import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildHostIndex,
  edgeKey,
  isInternalHost,
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
} from '@svclens/core';
import { kindForProtocol, scanProjects, type RepoScan } from '@svclens/scanners';
import fg from 'fast-glob';
import pc from 'picocolors';
import { formatDiagnostics } from '../report.js';
import { isGitSource, repoLabel, syncGitSource } from '../sources.js';
import { loadAndValidate } from './check.js';

export interface ScanOptions {
  /** Repository directory globs; defaults to `sources` in svclens.config.yaml. Relative to the catalog. */
  source?: string[];
  dryRun?: boolean;
  /** Create `external` services for unresolved hosts outside the internal domains. */
  createStubs?: boolean;
  /** Extra internal domains, added to `scan.internalDomains` from the config. */
  internalDomain?: string[];
  /** Update git sources before scanning (default true). False reuses the cached copies. */
  fetch?: boolean;
  /** Write the scan report (files analyzed, patterns, redactions, inconclusive relations) to this JSON file. */
  json?: string;
  /** List every analyzed file in the report. */
  verbose?: boolean;
}

/** One declaration per environment is common (Debug, Release, Production), so allow a few more than one. */
const MAX_EVIDENCE = 6;

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'service';

export const stubId = (host: string): string => slugify(host.replace(/^(www|api)\./, ''));

/** Directory name of the repository that holds a project. */
const repoRootName = (projectDir: string, sub: string): string => path.basename(projectDir.slice(0, projectDir.length - sub.length - 1));

function serviceIdFor(repoDir: string, scan: RepoScan, services: CatalogService[], sub = ''): string {
  if (scan.declared?.id) return scan.declared.id;
  if (sub) {
    // A project inside a monorepo: <repo>-<project>, unless the project name already starts with the repo name.
    const repoBase = slugify(repoRootName(repoDir, sub));
    const project = slugify(path.posix.basename(sub));
    return project.startsWith(repoBase) ? project : `${repoBase}-${project}`;
  }
  const base = path.basename(repoDir);
  const byRepo = services.find((s) => s.repo && (s.repo === base || s.repo.replace(/\/+$/, '').endsWith(`/${base}`)));
  return byRepo?.id ?? slugify(base);
}

interface Sources {
  dirs: string[];
  /** Repository label (`host/owner/name`) for directories that came from git. */
  repoOf: Map<string, string>;
  errors: string[];
}

async function expandSources(root: string, entries: string[], fetch: boolean): Promise<Sources> {
  const dirs = new Set<string>();
  const repoOf = new Map<string, string>();
  const errors: string[] = [];
  for (const entry of entries) {
    if (isGitSource(entry)) {
      try {
        const dir = path.resolve(await syncGitSource(root, entry, { fetch }));
        dirs.add(dir);
        repoOf.set(dir, repoLabel(entry));
      } catch (err) {
        errors.push(`${repoLabel(entry)}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
      }
      continue;
    }
    const pattern = path.isAbsolute(entry) ? entry : path.join(root, entry);
    for (const d of await fg(pattern.split(path.sep).join('/'), { onlyDirectories: true, absolute: true })) dirs.add(path.resolve(d));
  }
  return { dirs: [...dirs].sort(), repoOf, errors };
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
    console.error('no sources: pass --source <glob> or set "sources" in svclens.config.yaml');
    return 1;
  }
  const sources = await expandSources(root, globs, opts.fetch ?? true);
  for (const e of sources.errors) console.error(`${pc.red('!')} could not get ${e}`);
  const repos = sources.dirs;
  if (!repos.length) {
    console.error(`no repository directories matched: ${globs.join(', ')}`);
    return 1;
  }

  // Pass 1: scan every repo and learn which hosts belong to which service.
  const scans = (
    await Promise.all(
      repos.map(async (repoDir) => {
        const repo = sources.repoOf.get(repoDir);
        return (await scanProjects(repoDir)).map(({ dir, sub, scan }) => {
          if (repo) scan.hints.repo ??= repo;
          return { repoDir: dir, sub, scan };
        });
      }),
    )
  ).flat();
  const assigned = scans.map(({ repoDir, sub, scan }) => ({ repoDir, sub, scan, id: serviceIdFor(repoDir, scan, catalog.services, sub) }));
  // Two projects with the same name (src/api and web/api) must not share an id: fall back to the full path.
  for (const a of assigned) {
    if (a.sub && assigned.some((b) => b !== a && b.id === a.id)) a.id = slugify(`${repoRootName(a.repoDir, a.sub)}-${a.sub}`);
  }
  const byId = new Map<string, CatalogService>(catalog.services.map((s) => [s.id, s]));
  const index = buildHostIndex([
    ...catalog.services,
    ...assigned.map(({ id, scan }) => ({ id, hosts: [...scan.hints.hosts, ...(scan.declared?.hosts ?? [])] })),
  ]);

  const internalDomains = [...catalog.config.scan.internalDomains, ...(opts.internalDomain ?? [])];
  const unresolved: Unresolved[] = [];
  const stubs = new Map<string, Service>();
  const lines: string[] = [];
  const reports: ServiceReport[] = [];
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
      if (!target && opts.createStubs && !isInternalHost(ref.host, internalDomains)) {
        target = stubId(ref.host);
        if (!byId.has(target) && !stubs.has(target)) {
          stubs.set(target, ServiceSchema.parse({ id: target, name: ref.host, kind: kindForProtocol(ref.protocol), hosts: [ref.host] }));
        }
      }
      if (!target) {
        unresolved.push({ host: ref.host, protocol: ref.protocol, from: id, evidence: ref.evidence });
        continue;
      }
      addDep(target, ref.protocol, [ref.evidence], 'confirmed', ref.provider);
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
    reports.push(toReport(id, scan));

    if (changed && !opts.dryRun && (await writeServiceFile(path.join(root, file), service))) written++;
  }

  for (const [sid, stub] of stubs) {
    lines.push(`${pc.green('+')} ${sid} ${pc.dim(`(${stub.kind} stub)`)}`);
    if (!opts.dryRun && (await writeServiceFile(path.join(root, `services/${sid}.yaml`), stub))) written++;
  }

  console.log(`scanned ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'}${scans.length !== repos.length ? ` (${scans.length} services)` : ''}${opts.dryRun ? ' (dry run, nothing written)' : ''}`);
  console.log(lines.join('\n'));
  const printHosts = (title: string, list: Unresolved[]) => {
    if (!list.length) return;
    console.log(`\n${title}`);
    const seen = new Set<string>();
    for (const u of list) {
      const key = `${u.host}:${u.protocol}:${u.from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${u.host} ${pc.dim(`(${u.protocol}) from ${u.from} at ${u.evidence.file}${u.evidence.line ? `:${u.evidence.line}` : ''}`)}`);
    }
  };
  const internal = unresolved.filter((u) => isInternalHost(u.host, internalDomains));
  const external = unresolved.filter((u) => !isInternalHost(u.host, internalDomains));
  printHosts(`internal hosts without an owner (add them to the "hosts" of the service that serves them):`, internal);
  printHosts(`unresolved external hosts (add them to a service's "hosts" or use --create-stubs):`, external);
  printReport(reports, opts.verbose ?? false);
  if (opts.json) {
    await writeFile(opts.json, `${JSON.stringify({ services: reports, unresolved: unresolved.map(({ host, protocol, from, evidence }) => ({ host, protocol, from, evidence })) }, null, 2)}\n`);
    console.log(`\nreport written to ${opts.json}`);
  }
  if (!opts.dryRun) {
    console.log(`\n${written} file${written === 1 ? '' : 's'} written`);
    const { diagnostics: after } = await loadAndValidate(root);
    if (after.length) console.log(formatDiagnostics(after));
  }
  return 0;
}

/** What the scan did for one service. Counts and locations only; no configuration values. */
interface ServiceReport {
  service: string;
  analyzed: string[];
  skipped: RepoScan['skipped'];
  patterns: RepoScan['patterns'];
  redactions: RepoScan['redactions'];
  inconclusive: RepoScan['inconclusive'];
}

function toReport(service: string, scan: RepoScan): ServiceReport {
  const { analyzed, skipped, patterns, redactions, inconclusive } = scan;
  return { service, analyzed, skipped, patterns, redactions, inconclusive };
}

function printReport(reports: ServiceReport[], verbose: boolean): void {
  console.log(`\n${pc.bold('report')}`);
  for (const r of reports) {
    const found = Object.entries(r.patterns).map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`  ${r.service}: ${r.analyzed.length} file${r.analyzed.length === 1 ? '' : 's'} analyzed${found ? `, found ${found}` : ''}`);
    if (verbose) for (const f of r.analyzed) console.log(pc.dim(`      ${f}`));
    const removed = r.redactions.map((x) => `${x.kind} x${x.count} (${x.file})`);
    if (removed.length) console.log(`    removed for safety: ${removed.join(', ')}`);
    for (const i of r.inconclusive) console.log(`    ${pc.yellow('?')} ${i.file}${i.line ? `:${i.line}` : ''}${i.key ? ` ${i.key}` : ''}: ${i.reason}`);
    for (const s of r.skipped) console.log(pc.dim(`    skipped ${s.file}: ${s.reason}`));
  }
}
