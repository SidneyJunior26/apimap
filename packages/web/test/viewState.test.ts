import { describe, expect, it } from 'vitest';
import { readViewState, writeViewState } from '../src/viewState.js';

describe('readViewState', () => {
  it('uses the system preference when nothing is set', () => {
    expect(readViewState('', null, false)).toEqual({ view: '2d', theme: 'nebula' });
    expect(readViewState('', null, true)).toEqual({ view: '2d', theme: 'paper' });
  });

  it('prefers the URL over the stored choice', () => {
    expect(readViewState('?view=3d&theme=paper', { view: '2d', theme: 'nebula' }, false)).toEqual({ view: '3d', theme: 'paper' });
  });

  it('falls back to the stored choice', () => {
    expect(readViewState('', { view: '3d', theme: 'paper' }, false)).toEqual({ view: '3d', theme: 'paper' });
  });

  it('ignores invalid values', () => {
    expect(readViewState('?view=4d&theme=xyz', { theme: 'bogus' as never }, false)).toEqual({ view: '2d', theme: 'nebula' });
  });
});

describe('writeViewState', () => {
  it('keeps other params and omits defaults', () => {
    const url = new URL('http://x/?foo=1&view=3d');
    expect(writeViewState({ view: '2d', theme: 'nebula' }, url, false)).toBe('?foo=1');
    expect(writeViewState({ view: '3d', theme: 'paper' }, url, false)).toBe('?foo=1&view=3d&theme=paper');
  });

  it('treats the system theme as the default', () => {
    expect(writeViewState({ view: '2d', theme: 'paper' }, new URL('http://x/'), true)).toBe('');
  });
});
