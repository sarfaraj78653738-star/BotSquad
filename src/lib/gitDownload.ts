import 'react-native-get-random-values'; // Crypto polyfill, ONLY here: isomorphic-git (below) is the app's only Node-crypto user. It must NOT live in _layout.tsx — a broken polyfill at app root would kill app launch; here it can only affect repo downloads.
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

// Repo download for BotSquad (user order 2026-10-31): the phone has
// no terminal and no git binary, so cloning runs in pure JavaScript
// via isomorphic-git. It needs a file system, which this file provides
// on top of expo-file-system (the same storage the workspace screen
// already uses). No server, no Termux, no native module.
// Limits, stated plainly: public GitHub repos only (no auth yet);
// symlinks materialize as small text files holding the target path
// (expo-file-system cannot create real symlinks); very large repos
// can be slow in JS, so clones are single-branch, depth 1, no tags.
if ((globalThis as unknown as { Buffer?: unknown }).Buffer === undefined) {
  (globalThis as unknown as { Buffer?: unknown }).Buffer = Buffer;
}

type StatLike = {
  isFile: () => boolean;
  isDirectory: () => boolean;
  size: number;
  mode: number;
  mtimeMs: number;
  mtime: Date;
};

async function ensureParent(filePath: string): Promise<void> {
  const slash = filePath.lastIndexOf('/');
  if (slash > 0) {
    try {
      await FileSystem.makeDirectoryAsync(filePath.slice(0, slash), { intermediates: true });
    } catch { /* already exists */ }
  }
}

async function statLike(filePath: string): Promise<StatLike> {
  const info = await FileSystem.getInfoAsync(filePath);
  if (!info.exists) {
    const err = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as Error & { code?: string };
    err.code = 'ENOENT';
    throw err;
  }
  const isDir = info.isDirectory === true;
  const mtimeMs = (info.modificationTime ?? 0) * 1000;
  return {
    isFile: () => !isDir,
    isDirectory: () => isDir,
    size: info.size ?? 0,
    mode: isDir ? 0o40755 : 0o100644,
    mtimeMs,
    mtime: new Date(mtimeMs),
  };
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
}

const promises = {
  async readFile(filePath: string, options?: unknown): Promise<string | Buffer> {
    const encoding = typeof options === 'string' ? options : (options as { encoding?: string } | undefined)?.encoding;
    if (encoding === 'utf8' || encoding === 'utf-8') {
      return FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
    }
    const b64 = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
    return Buffer.from(b64, 'base64');
  },
  async writeFile(filePath: string, data: string | Uint8Array, options?: unknown): Promise<void> {
    await ensureParent(filePath);
    if (typeof data === 'string') {
      await FileSystem.writeAsStringAsync(filePath, data, { encoding: FileSystem.EncodingType.UTF8 });
    } else {
      await FileSystem.writeAsStringAsync(filePath, toBase64(data), { encoding: FileSystem.EncodingType.Base64 });
    }
    void options;
  },
  async unlink(filePath: string): Promise<void> {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  },
  async readdir(filePath: string, options?: unknown): Promise<string[] | { name: string; isFile: () => boolean; isDirectory: () => boolean }[]> {
    const names = await FileSystem.readDirectoryAsync(filePath);
    const withTypes = (options as { withFileTypes?: boolean } | undefined)?.withFileTypes === true;
    if (!withTypes) return names;
    const out: { name: string; isFile: () => boolean; isDirectory: () => boolean }[] = [];
    for (const name of names) {
      try {
        const st = await statLike(`${filePath}/${name}`);
        out.push({ name, isFile: st.isFile, isDirectory: st.isDirectory });
      } catch { /* skip vanished entries */ }
    }
    return out;
  },
  async mkdir(filePath: string): Promise<void> {
    await FileSystem.makeDirectoryAsync(filePath, { intermediates: true });
  },
  async rmdir(filePath: string): Promise<void> {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  },
  async stat(filePath: string): Promise<StatLike> {
    return statLike(filePath);
  },
  async lstat(filePath: string): Promise<StatLike> {
    return statLike(filePath);
  },
  async readlink(filePath: string): Promise<string> {
    return FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
  },
  async symlink(target: string, filePath: string): Promise<void> {
    await ensureParent(filePath);
    await FileSystem.writeAsStringAsync(filePath, target, { encoding: FileSystem.EncodingType.UTF8 });
  },
  async chmod(): Promise<void> {
    // expo-file-system cannot set unix modes; executable bits are
    // dropped, contents are unaffected.
  },
};

// Parse "owner/name", a github.com URL, or a URL with extra path
// segments ("/tree/main" etc. — only the first two segments count).
export function parseGitHubRepo(input: string): { owner: string; name: string; url: string } | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const urlMatch = s.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  const plainMatch = !urlMatch ? s.match(/^([^/\s]+)\/([^/\s]+)$/) : null;
  const owner = urlMatch ? urlMatch[1] : plainMatch ? plainMatch[1] : '';
  let name = urlMatch ? urlMatch[2] : plainMatch ? plainMatch[2] : '';
  name = name.replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return null;
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}

export type CloneStats = { files: number; bytes: number; sample: string[] };

async function walkStats(dir: string, prefix: string, acc: { files: number; bytes: number; sample: string[] }): Promise<void> {
  if (acc.files >= 2000) return;
  let names: string[];
  try {
    names = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (acc.files >= 2000) return;
    const full = `${dir}/${name}`;
    const info = await FileSystem.getInfoAsync(full);
    if (info.isDirectory) await walkStats(full, `${prefix}${name}/`, acc);
    else if (info.exists) {
      acc.files += 1;
      acc.bytes += info.size ?? 0;
      if (acc.sample.length < 20 && !prefix.startsWith('.git/')) acc.sample.push(`${prefix}${name}`);
    }
  }
}

// Clone into absDir (an absolute phone path). A failed clone leaves
// no partial directory behind.
export async function cloneGitHubRepo(absDir: string, url: string): Promise<CloneStats> {
  await FileSystem.deleteAsync(absDir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(absDir, { intermediates: true });
  try {
    await git.clone({
      fs: { promises },
      http,
      dir: absDir,
      url,
      singleBranch: true,
      depth: 1,
      noTags: true,
    });
  } catch (e) {
    await FileSystem.deleteAsync(absDir, { idempotent: true });
    throw e;
  }
  const stats: CloneStats = { files: 0, bytes: 0, sample: [] };
  await walkStats(absDir, '', stats);
  return stats;
}
