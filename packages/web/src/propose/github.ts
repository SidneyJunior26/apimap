import type { EditTarget } from '@svclens/core';

/** Above this, browsers and GitHub start rejecting links; the content is copied instead. */
export const MAX_URL_LENGTH = 7000;

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** Path of a catalog file inside the repository. */
export function repoFilePath(t: EditTarget, file: string): string {
  return [t.path.replace(/^\/+|\/+$/g, ''), file].filter(Boolean).join('/');
}

const base = (t: EditTarget, action: string) => `https://github.com/${t.repo}/${action}/${encodePath(t.branch)}`;

/** GitHub's "create new file" page, prefilled with the content when it fits in a URL. */
export function newFileUrl(t: EditTarget, file: string, content: string): { url: string; prefilled: boolean } {
  const params = new URLSearchParams({ filename: repoFilePath(t, file) });
  const plain = `${base(t, 'new')}?${params}`;
  params.set('value', content);
  const full = `${base(t, 'new')}?${params}`;
  return full.length <= MAX_URL_LENGTH ? { url: full, prefilled: true } : { url: plain, prefilled: false };
}

export const editFileUrl = (t: EditTarget, file: string) => `${base(t, 'edit')}/${encodePath(repoFilePath(t, file))}`;

export const deleteFileUrl = (t: EditTarget, file: string) => `${base(t, 'delete')}/${encodePath(repoFilePath(t, file))}`;
