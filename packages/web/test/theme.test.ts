import { describe, expect, it } from 'vitest';
import { DEFAULT_KINDS } from '@apimap/core';
import { contrastRatio, PAPER_BG, themeColor } from '../src/theme.js';

describe('themeColor', () => {
  it('keeps colors on the dark theme', () => {
    expect(themeColor('#facc15', 'nebula')).toBe('#facc15');
  });

  it('darkens every default kind to at least 3:1 on paper', () => {
    for (const k of Object.values(DEFAULT_KINDS)) {
      const c = themeColor(k.color, 'paper');
      expect(contrastRatio(c, PAPER_BG)).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves colors that already contrast enough', () => {
    expect(themeColor('#1d4ed8', 'paper')).toBe('#1d4ed8');
  });

  it('passes through non-hex colors', () => {
    expect(themeColor('rgba(1,2,3,0.5)', 'paper')).toBe('rgba(1,2,3,0.5)');
  });
});
