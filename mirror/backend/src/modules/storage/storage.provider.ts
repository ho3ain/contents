import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Gap closure — storage abstraction. Callers depend ONLY on this interface;
 * drivers are chosen by `STORAGE_DRIVER`:
 *
 *   none   (default) uploads are disabled; products keep using URLs.
 *   local  files on the API host's disk (single-node / development).
 *
 * An S3-compatible driver (and a CDN in front of it) is the production
 * target and is an INFRASTRUCTURE DEPENDENCY — it is intentionally NOT
 * faked here. Keys are server-generated (`<uuid>.<ext>`), never derived
 * from user input.
 */
export interface StorageProvider {
  readonly driver: 'local';
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** `<uuid v4>.<png|jpg|webp>` — the only key shape ever read or written. */
export const STORAGE_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/;

export class LocalStorageProvider implements StorageProvider {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  private pathOf(key: string): string {
    if (!STORAGE_KEY_RE.test(key)) throw new Error('Invalid storage key');
    return join(this.root, key);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.pathOf(key);
    await mkdir(this.root, { recursive: true });
    // Write-then-rename: a reader never sees a half-written file.
    const temp = `${target}.tmp`;
    await writeFile(temp, body, { flag: 'wx' });
    await rename(temp, target);
  }

  async get(key: string): Promise<Buffer | null> {
    if (!STORAGE_KEY_RE.test(key)) return null;
    try {
      return await readFile(this.pathOf(key));
    } catch {
      return null;
    }
  }
}
