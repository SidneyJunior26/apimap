import { loadCatalog, validateCatalog, type Catalog, type Diagnostic } from '@apimap/core';

export async function loadAndValidate(dir: string): Promise<{ catalog: Catalog; diagnostics: Diagnostic[]; errors: number; warnings: number }> {
  const { catalog, diagnostics: loadDiagnostics } = await loadCatalog(dir);
  const diagnostics = [...loadDiagnostics, ...validateCatalog(catalog)];
  const errors = diagnostics.filter((d) => d.level === 'error').length;
  return { catalog, diagnostics, errors, warnings: diagnostics.length - errors };
}
