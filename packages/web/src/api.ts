import type { Service } from '@svclens/core';

export interface Issue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly issues: Issue[] = []) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: Issue[] };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (HTTP ${res.status})`, res.status, data.issues ?? []);
  return data as T;
}

export type StoredService = Service & { file: string };

export const api = {
  get: (id: string) => call<StoredService>('GET', `./api/services/${encodeURIComponent(id)}`),
  create: (s: Service) => call<StoredService>('POST', './api/services', s),
  update: (s: Service) => call<StoredService>('PUT', `./api/services/${encodeURIComponent(s.id)}`, s),
  remove: (id: string) => call<{ deleted: string; file: string; dependents: string[] }>('DELETE', `./api/services/${encodeURIComponent(id)}`),
};
