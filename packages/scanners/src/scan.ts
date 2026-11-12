import path from 'node:path';
import { openRepo } from './files.js';
import { composeScanner } from './compose.js';
import { dotnetScanner } from './dotnet.js';
import { configScanner } from './configs.js';
import { genericScanner, isConfigFile } from './generic.js';
import { manifestScanner } from './manifest.js';
import { nodeScanner } from './node.js';
import { openapiScanner } from './openapi.js';
import type { RepoScan, Scanner } from './types.js';

/** Order matters: earlier scanners win when filling name, description and kind. */
export const DEFAULT_SCANNERS: Scanner[] = [manifestScanner, openapiScanner, dotnetScanner, nodeScanner, composeScanner, configScanner, genericScanner];

/** Suggests a kind from the repository name when no scanner did. */
export function kindFromName(name: string): string | undefined {
  const n = name.toLowerCase();
  if (/(^|[-_.])bff([-_.]|$)/.test(n)) return 'bff';
  if (/worker|consumer|job/.test(n)) return 'worker';
  if (/(^|[-_.])(web|portal|frontend|site|app)([-_.]|$)/.test(n)) return 'web';
  return undefined;
}

/** Runs every scanner over a repository. A failing file becomes an error entry; scanning goes on. */
export async function scanRepo(dir: string, scanners: Scanner[] = DEFAULT_SCANNERS): Promise<RepoScan> {
  const opened = await openRepo(dir);
  const read = new Set<string>();
  const repo = { ...opened, read: (rel: string) => (read.add(rel), opened.read(rel)) };
  const acc: RepoScan = { hints: { tech: [], hosts: [] }, references: [], errors: [], analyzed: [], skipped: opened.skipped, redactions: [], inconclusive: [], patterns: {} };
  for (const scanner of scanners) {
    try {
      await scanner.scan(repo, acc);
    } catch (err) {
      acc.errors.push({ file: scanner.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  acc.analyzed = [...read].sort();
  acc.hints.tech = [...new Set(acc.hints.tech)];
  acc.hints.hosts = [...new Set(acc.hints.hosts)];
  acc.hints.kind ??= kindFromName(repo.name);
  // A service calling its own public host is not a dependency.
  const own = new Set(acc.hints.hosts);
  acc.references = acc.references.filter((r) => !own.has(r.host));
  return acc;
}

export interface ProjectScan {
  /** Absolute directory that was scanned. */
  dir: string;
  /** Path of the project inside the repository, POSIX; empty when the whole repository is one service. */
  sub: string;
  scan: RepoScan;
}

const NOT_PROJECTS = new Set(['test', 'tests', '__tests__', 'docs', 'doc', 'example', 'examples', 'e2e', 'fixtures', 'sample', 'samples', 'scripts', 'tools', 'benchmarks']);
const NODE_APPS = /"(express|fastify|koa|@hapi\/hapi|@nestjs\/core|next|nuxt|react-scripts|vite|@angular\/core|hono|restify)"\s*:/;

/** True when a csproj builds something that runs on its own, not a class library. */
function isDotnetApp(xml: string, dirFiles: string[]): boolean {
  if (/Sdk="Microsoft\.NET\.Sdk\.(Web|Worker)/i.test(xml)) return true;
  if (/<OutputType>\s*(Exe|WinExe)\s*</i.test(xml)) return true;
  if (/349C5851-65DF-11DA-9384-00065B846F21/i.test(xml)) return true;
  return dirFiles.some((f) => /(^|\/)web\.config$/i.test(f) || /\.(svc|asmx)$/i.test(f));
}

function isNodeApp(json: string): boolean {
  try {
    const pkg = JSON.parse(json) as { scripts?: Record<string, string>; dependencies?: unknown };
    return Boolean(pkg.scripts?.start) || NODE_APPS.test(JSON.stringify(pkg.dependencies ?? {}).replace(/":/g, '":'));
  } catch {
    return false;
  }
}

function prefixed(scan: RepoScan, sub: string): RepoScan {
  const p = (f: string) => path.posix.join(sub, f);
  return {
    ...scan,
    references: scan.references.map((r) => ({ ...r, evidence: { ...r.evidence, file: p(r.evidence.file) } })),
    errors: scan.errors.map((e) => ({ ...e, file: e.file.includes('/') || e.file.includes('.') ? p(e.file) : e.file })),
    analyzed: scan.analyzed.map(p),
    skipped: scan.skipped.map((s) => ({ ...s, file: p(s.file) })),
    redactions: scan.redactions.map((r) => ({ ...r, file: p(r.file) })),
    inconclusive: scan.inconclusive.map((i) => ({ ...i, file: p(i.file) })),
  };
}

/**
 * Scans a repository as one service, or as one service per application project when it holds several
 * (a monorepo). A `svclens.yaml` at the root keeps the repository as a single service.
 */
export async function scanProjects(dir: string, scanners: Scanner[] = DEFAULT_SCANNERS): Promise<ProjectScan[]> {
  const whole = async (): Promise<ProjectScan[]> => [{ dir, sub: '', scan: await scanRepo(dir, scanners) }];
  const repo = await openRepo(dir);
  const files = repo.list();
  if (files.some((f) => f === 'svclens.yaml' || f === 'svclens.yml')) return whole();

  const candidates = [...new Set(files.filter((f) => /(^|\/)([^/]+\.csproj|package\.json)$/.test(f)).map((f) => path.posix.dirname(f)))]
    .filter((d) => d !== '.' && !d.split('/').some((seg) => NOT_PROJECTS.has(seg.toLowerCase())));
  const apps: string[] = [];
  for (const d of candidates) {
    const inDir = files.filter((f) => f.startsWith(`${d}/`));
    const project = inDir.find((f) => path.posix.dirname(f) === d && f.endsWith('.csproj'));
    if (project ? isDotnetApp(await repo.read(project), inDir) : isNodeApp(await repo.read(`${d}/package.json`))) apps.push(d);
  }
  const roots = apps.filter((d) => !apps.some((o) => o !== d && d.startsWith(`${o}/`))).sort();
  if (roots.length < 2) return whole();

  const result: ProjectScan[] = [];
  for (const sub of roots) result.push({ dir: path.join(dir, sub), sub, scan: prefixed(await scanRepo(path.join(dir, sub), scanners), sub) });
  const outside = files.filter((f) => isConfigFile(f) && !roots.some((r) => f.startsWith(`${r}/`)));
  for (const file of outside) result[0]!.scan.skipped.push({ file, reason: 'outside every project of this repository' });
  return result;
}
