export type FocusMode = 'none' | 'up' | 'down' | 'both';

export interface Selection {
  selectedId: string | null;
  focusMode: FocusMode;
  depth: number;
}

export const initialSelection: Selection = { selectedId: null, focusMode: 'none', depth: 2 };
