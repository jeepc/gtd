import type { FileSystem } from '@loop/core';
import RNFS from 'react-native-fs';

const ROOT = RNFS.DocumentDirectoryPath + '/vault';

export class RNFileSystem implements FileSystem {
  constructor(private root: string = ROOT) {}

  private abs(p: string): string {
    const norm = p.replace(/^\.\//, '').replace(/^\/+/, '');
    return `${this.root}/${norm}`;
  }

  async readText(path: string): Promise<string> {
    return RNFS.readFile(this.abs(path), 'utf8');
  }

  async writeText(path: string, contents: string): Promise<void> {
    const full = this.abs(path);
    const dir = full.split('/').slice(0, -1).join('/');
    if (dir) await RNFS.mkdir(dir);
    await RNFS.writeFile(full, contents, 'utf8');
  }

  async remove(path: string): Promise<void> {
    try { await RNFS.unlink(this.abs(path)); } catch { /* ignore */ }
  }

  async exists(path: string): Promise<boolean> {
    return RNFS.exists(this.abs(path));
  }

  async list(dir: string): Promise<string[]> {
    const root = dir === '.' || dir === '' ? this.root : this.abs(dir);
    const out: string[] = [];
    await walk(root, root, out);
    return out;
  }

  async ensureDir(dir: string): Promise<void> {
    await RNFS.mkdir(this.abs(dir));
  }
}

async function walk(root: string, current: string, out: string[]) {
  let items: RNFS.ReadDirItem[] = [];
  try { items = await RNFS.readDir(current); } catch { return; }
  for (const it of items) {
    if (it.isDirectory()) {
      await walk(root, it.path, out);
    } else if (it.isFile()) {
      out.push(it.path.slice(root.length + 1));
    }
  }
}
