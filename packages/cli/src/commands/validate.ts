import path from 'node:path';
import { formatDiagnostics } from '../report.js';
import { loadAndValidate } from './check.js';

export interface ValidateOptions {
  strict?: boolean;
}

/** Returns the process exit code. */
export async function runValidate(dir: string, opts: ValidateOptions): Promise<number> {
  const { catalog, diagnostics, errors, warnings } = await loadAndValidate(path.resolve(dir));
  console.log(`${catalog.services.length} services in ${dir}`);
  console.log(formatDiagnostics(diagnostics));
  return errors > 0 || (opts.strict && warnings > 0) ? 1 : 0;
}
