export type View = '2d' | '3d';
export type Theme = 'nebula' | 'paper';

export interface ViewState {
  view: View;
  theme: Theme;
}

const VIEWS: View[] = ['2d', '3d'];
const THEMES: Theme[] = ['nebula', 'paper'];
export const STORAGE_KEY = 'apimap:view';

const pick = <T extends string>(value: unknown, allowed: T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

const systemTheme = (prefersLight: boolean): Theme => (prefersLight ? 'paper' : 'nebula');

/** URL wins, then the stored choice, then the system preference. Invalid values are ignored. */
export function readViewState(search: string, stored: Partial<ViewState> | null, prefersLight: boolean): ViewState {
  const params = new URLSearchParams(search);
  return {
    view: pick(params.get('view'), VIEWS) ?? pick(stored?.view, VIEWS) ?? '2d',
    theme: pick(params.get('theme'), THEMES) ?? pick(stored?.theme, THEMES) ?? systemTheme(prefersLight),
  };
}

/** Query string for `state`, keeping unrelated params; defaults are left out so plain links stay clean. */
export function writeViewState(state: ViewState, url: URL, prefersLight: boolean): string {
  const params = new URLSearchParams(url.search);
  params.delete('view');
  params.delete('theme');
  if (state.view !== '2d') params.set('view', state.view);
  if (state.theme !== systemTheme(prefersLight)) params.set('theme', state.theme);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function loadStoredViewState(): Partial<ViewState> | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ViewState> | null;
  } catch {
    return null;
  }
}

export function storeViewState(state: ViewState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or blocked storage: the URL still carries the state.
  }
}
