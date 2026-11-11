import type { Diagnostic } from '@apimap/core';
import pc from 'picocolors';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  const lines = diagnostics.map((d) => {
    const level = d.level === 'error' ? pc.red('ERROR') : pc.yellow('WARN ');
    const where = [d.file, d.path].filter(Boolean).join(' ');
    return `${level} ${where ? `${where}: ` : ''}${d.message} ${pc.dim(`[${d.code}]`)}`;
  });
  const errors = diagnostics.filter((d) => d.level === 'error').length;
  const warnings = diagnostics.length - errors;
  lines.push(`${plural(errors, 'error')}, ${plural(warnings, 'warning')}`);
  return lines.join('\n');
}
