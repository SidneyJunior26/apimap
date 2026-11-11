import { execFile, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export class GitError extends Error {}

export async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout.trim();
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new GitError(stderr || (err instanceof Error ? err.message : String(err)));
  }
}

export async function repoRoot(dir: string): Promise<string | null> {
  try {
    return await git(dir, ['rev-parse', '--show-toplevel']);
  } catch {
    return null;
  }
}

export async function refExists(dir: string, ref: string): Promise<boolean> {
  try {
    await git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts `relPath` as it was at `ref` into `dest`, without touching the working tree.
 * Returns false when the path did not exist at that ref.
 */
export async function extractAt(root: string, ref: string, relPath: string, dest: string): Promise<boolean> {
  try {
    await git(root, ['cat-file', '-e', `${ref}:${relPath || '.'}`]);
  } catch {
    return false;
  }
  await mkdir(dest, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const archive = spawn('git', ['archive', '--format=tar', ref, '--', relPath || '.'], { cwd: root });
    const tar = spawn('tar', ['-x', '-C', dest]);
    archive.stdout.pipe(tar.stdin);
    let failed = '';
    archive.stderr.on('data', (d) => (failed += String(d)));
    tar.on('close', (code) => (code === 0 && !failed ? resolve() : reject(new GitError(failed || `tar exited with ${code}`))));
    archive.on('error', reject);
    tar.on('error', reject);
  });
  return true;
}

export const posix = (p: string) => p.split(path.sep).join('/');

/** `owner/name` for GitHub remotes (https or ssh), otherwise null. */
export function parseGithubRemote(url: string): string | null {
  const m = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? m[1]! : null;
}

/** Default branch of origin, else the current branch, else "main". */
export async function defaultBranch(root: string): Promise<string> {
  try {
    return (await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).replace(/^origin\//, '');
  } catch {
    // no origin/HEAD (fresh or shallow clone)
  }
  try {
    const current = await git(root, ['symbolic-ref', '--short', 'HEAD']);
    if (current) return current;
  } catch {
    // detached HEAD
  }
  return process.env.GITHUB_REF_NAME && !process.env.GITHUB_REF_NAME.includes('/') ? process.env.GITHUB_REF_NAME : 'main';
}
