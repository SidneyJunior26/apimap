import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildGraph, toMermaid } from '@svclens/core';
import { formatDiagnostics } from '../report.js';
import { loadAndValidate } from './check.js';

export interface ExportOptions {
  format: string;
  out?: string;
  direction?: 'LR' | 'TB';
}

export const EXPORT_FORMATS = ['mermaid'];

/** Returns the process exit code. */
export async function runExport(dir: string, opts: ExportOptions): Promise<number> {
  if (!EXPORT_FORMATS.includes(opts.format)) {
    console.error(`unknown format "${opts.format}" (available: ${EXPORT_FORMATS.join(', ')})`);
    return 1;
  }
  const { catalog, diagnostics, errors } = await loadAndValidate(path.resolve(dir));
  if (errors > 0) {
    console.error(formatDiagnostics(diagnostics));
    return 1;
  }
  const text = toMermaid(buildGraph(catalog), { direction: opts.direction });
  if (opts.out) {
    await writeFile(path.resolve(opts.out), text);
    console.error(`wrote ${opts.out}`);
  } else {
    console.log(text.trimEnd());
  }
  return 0;
}
