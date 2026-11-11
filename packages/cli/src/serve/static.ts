import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/** Reads a file under `root` for a URL path. Returns null for anything outside root or missing. */
export async function readStatic(root: string, urlPath: string): Promise<{ body: Buffer; type: string } | null> {
  const base = path.resolve(root);
  let file = path.resolve(base, `.${decodeURIComponent(urlPath)}`);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    return { body: await readFile(file), type: TYPES[path.extname(file)] ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}
