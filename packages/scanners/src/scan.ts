import { openRepo } from './files.js';
import { composeScanner } from './compose.js';
import { dotnetScanner } from './dotnet.js';
import { genericScanner } from './generic.js';
import { manifestScanner } from './manifest.js';
import { nodeScanner } from './node.js';
import { openapiScanner } from './openapi.js';
import type { RepoScan, Scanner } from './types.js';

/** Order matters: earlier scanners win when filling name, description and kind. */
export const DEFAULT_SCANNERS: Scanner[] = [manifestScanner, openapiScanner, dotnetScanner, nodeScanner, composeScanner, genericScanner];

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
  const repo = await openRepo(dir);
  const acc: RepoScan = { hints: { tech: [], hosts: [] }, references: [], errors: [] };
  for (const scanner of scanners) {
    try {
      await scanner.scan(repo, acc);
    } catch (err) {
      acc.errors.push({ file: scanner.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  acc.hints.tech = [...new Set(acc.hints.tech)];
  acc.hints.hosts = [...new Set(acc.hints.hosts)];
  acc.hints.kind ??= kindFromName(repo.name);
  // A service calling its own public host is not a dependency.
  const own = new Set(acc.hints.hosts);
  acc.references = acc.references.filter((r) => !own.has(r.host));
  return acc;
}
