import { describe, expect, it } from 'vitest';
import { exportFileName } from '../src/export/png.js';

describe('exportFileName', () => {
  it('slugs the map name and appends the date', () => {
    expect(exportFileName('Acme API Map', new Date(2026, 10, 11))).toBe('acme-api-map-2026-11-11.png');
  });

  it('handles accents and empty names', () => {
    expect(exportFileName('Mapa de Integração', new Date(2026, 0, 5))).toBe('mapa-de-integracao-2026-01-05.png');
    expect(exportFileName('', new Date(2026, 0, 5))).toBe('apimap-2026-01-05.png');
  });
});
