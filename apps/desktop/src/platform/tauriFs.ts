import type { FileSystem } from '@gtd/core';
import {
  readTextFile, writeTextFile, exists, mkdir, remove, readDir, BaseDirectory,
} from '@tauri-apps/plugin-fs';

export class TauriFileSystem implements FileSystem {
  constructor(private root: string) {}

  private abs(p: string): string {
    const norm = p.replace(/^\.\//, '').replace(/^\/+/, '');
    return `${this.root}/${norm}`;
  }

  async readText(path: string): Promise<string> {
    return readTextFile(this.abs(path));
  }

  async writeText(path: string, contents: string): Promise<void> {
    const full = this.abs(path);
    const dir = full.split('/').slice(0, -1).join('/');
    if (dir) await mkdir(dir, { recursive: true });
    await writeTextFile(full, contents);
  }

  async remove(path: string): Promise<void> {
    try { await remove(this.abs(path)); } catch { /* ignore */ }
  }

  async exists(path: string): Promise<boolean> {
    return exists(this.abs(path));
  }

  async list(dir: string): Promise<string[]> {
    const root = dir === '.' || dir === '' ? this.root : this.abs(dir);
    const out: string[] = [];
    await walk(root, root, out);
    return out;
  }

  async ensureDir(dir: string): Promise<void> {
    await mkdir(this.abs(dir), { recursive: true });
  }
}

async function walk(root: string, current: string, out: string[]): Promise<void> {
  let items: Array<{ name: string; isDirectory?: boolean; isFile?: boolean }>;
  try {
    items = await readDir(current);
  } catch {
    return;
  }
  for (const it of items) {
    const child = `${current}/${it.name}`;
    if (it.isDirectory) {
      // skip hidden / .conflicts when listing for sync? caller decides.
      await walk(root, child, out);
    } else if (it.isFile) {
      out.push(child.slice(root.length + 1));
    }
  }
}

// Used in dev / for testing the UI without Tauri. Keeps state in localStorage.
export class LocalStorageFileSystem implements FileSystem {
  private prefix = 'gtd:fs:';
  async readText(path: string): Promise<string> {
    const v = localStorage.getItem(this.prefix + path);
    if (v === null) throw new Error(`ENOENT: ${path}`);
    return v;
  }
  async writeText(path: string, contents: string): Promise<void> {
    localStorage.setItem(this.prefix + path, contents);
  }
  async remove(path: string): Promise<void> {
    localStorage.removeItem(this.prefix + path);
  }
  async exists(path: string): Promise<boolean> {
    return localStorage.getItem(this.prefix + path) !== null;
  }
  async list(_dir: string): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
    }
    return out;
  }
  async ensureDir(_dir: string): Promise<void> { /* no-op */ }
}
