export type FocusMode = 'none' | 'up' | 'down' | 'both';

export interface Selection {
  selectedId: string | null;
  focusMode: FocusMode;
  depth: number;
}

export const initialSelection: Selection = { selectedId: null, focusMode: 'none', depth: 2 };

/** "local": `apimap serve` writes files. "propose": published site opens GitHub. null: read-only. */
export type EditMode = 'local' | 'propose' | null;

export const EDIT_LABELS = {
  local: { create: 'New service', edit: 'Edit', remove: 'Delete', addGhost: 'Add to catalog' },
  propose: { create: 'Propose service', edit: 'Propose edit', remove: 'Propose removal', addGhost: 'Propose adding' },
} as const;
