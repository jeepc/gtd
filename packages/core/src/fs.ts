/**
 * Platform-agnostic filesystem abstraction. Each platform (Tauri, RN, Node)
 * provides its own implementation. All paths are POSIX-style relative to the
 * vault root.
 */
export interface FileSystem {
  /** Read a UTF-8 text file. Throws if not found. */
  readText(path: string): Promise<string>;
  /** Write a UTF-8 text file, creating parent directories as needed. */
  writeText(path: string, contents: string): Promise<void>;
  /** Remove a file. No-op if it does not exist. */
  remove(path: string): Promise<void>;
  /** Check whether a path exists. */
  exists(path: string): Promise<boolean>;
  /** List files (not directories) recursively under a directory. */
  list(dir: string): Promise<string[]>;
  /** Ensure a directory exists. */
  ensureDir(dir: string): Promise<void>;
}

export class MemoryFileSystem implements FileSystem {
  private files = new Map<string, string>();

  async readText(path: string): Promise<string> {
    const f = this.files.get(this.norm(path));
    if (f === undefined) throw new Error(`ENOENT: ${path}`);
    return f;
  }

  async writeText(path: string, contents: string): Promise<void> {
    this.files.set(this.norm(path), contents);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(this.norm(path));
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(this.norm(path));
  }

  async list(dir: string): Promise<string[]> {
    const d = this.norm(dir).replace(/\/$/, '');
    const prefix = d ? d + '/' : '';
    const out: string[] = [];
    for (const k of this.files.keys()) {
      if (!prefix || k.startsWith(prefix)) out.push(k);
    }
    return out.sort();
  }

  async ensureDir(_dir: string): Promise<void> {
    // memory fs has no directory concept
  }

  private norm(p: string): string {
    let n = p.replace(/\\/g, '/').replace(/^\/+/, '');
    if (n === '.') return '';
    return n.replace(/^\.\//, '');
  }
}
