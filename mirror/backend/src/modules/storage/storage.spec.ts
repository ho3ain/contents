import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sniffImage } from './image-sniff';
import { MEDIA_MAX_BYTES, checkMedia } from './media-rules';
import {
  LocalStorageProvider,
  STORAGE_KEY_RE,
  type StorageProvider,
} from './storage.provider';
import { StorageService } from './storage.service';
import {
  jpegHeader,
  pngHeader,
  webpExtendedHeader,
  webpLosslessHeader,
  webpLossyHeader,
} from './test-images';

describe('Gap closure — image sniffing (content, not claims)', () => {
  it('detects PNG / JPEG / WebP (lossy, lossless, extended) with real dimensions', () => {
    expect(sniffImage(pngHeader(1200, 600))).toEqual({
      mime: 'image/png',
      ext: 'png',
      width: 1200,
      height: 600,
    });
    expect(sniffImage(jpegHeader(800, 400))).toMatchObject({
      mime: 'image/jpeg',
      width: 800,
      height: 400,
    });
    expect(sniffImage(webpLossyHeader(640, 360))).toMatchObject({
      mime: 'image/webp',
      width: 640,
      height: 360,
    });
    expect(sniffImage(webpLosslessHeader(512, 512))).toMatchObject({
      width: 512,
      height: 512,
    });
    expect(sniffImage(webpExtendedHeader(3000, 1500))).toMatchObject({
      width: 3000,
      height: 1500,
    });
  });

  it('rejects SVG (script-capable), GIF, HTML, animated WebP and garbage', () => {
    expect(
      sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(
      sniffImage(Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1')),
    ).toBeNull();
    expect(
      sniffImage(Buffer.from('<html><script>alert(1)</script>')),
    ).toBeNull();
    expect(sniffImage(webpExtendedHeader(800, 400, true))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(sniffImage(pngHeader(0, 10))).toBeNull();
  });
});

describe('Gap closure — per-kind media rules', () => {
  it('accepts sizes inside the rule', () => {
    expect(checkMedia('logo', 50_000, 512, 512)).toBeNull();
    expect(checkMedia('cover', 900_000, 1600, 800)).toBeNull();
    expect(checkMedia('screenshot', 900_000, 1280, 720)).toBeNull();
  });

  it('reports the first violated rule with the limit', () => {
    expect(checkMedia('logo', 2 * 1024 * 1024, 512, 512)).toEqual({
      code: 'too_large',
      maxBytes: 1024 * 1024,
    });
    expect(checkMedia('cover', 1000, 700, 350)).toMatchObject({
      code: 'too_small',
    });
    expect(checkMedia('screenshot', 1000, 5000, 3000)).toMatchObject({
      code: 'too_big_dimensions',
    });
    expect(checkMedia('logo', 1000, 800, 200)).toMatchObject({
      code: 'bad_ratio',
    });
    expect(checkMedia('cover', 1000, 900, 900)).toMatchObject({
      code: 'bad_ratio',
    });
  });

  it('parser ceiling equals the largest per-kind limit', () => {
    expect(MEDIA_MAX_BYTES).toBe(3 * 1024 * 1024);
  });
});

describe('§13 — creator avatar upload (profile workspace)', () => {
  /** The service only needs getRepository(); uploadAvatar never queries. */
  function fakeDataSource(saved: Array<Record<string, unknown>>) {
    return {
      getRepository: () => ({
        create: (row: Record<string, unknown>) => row,
        save: async (row: Record<string, unknown>) => {
          saved.push(row);
          return { id: `asset-${saved.length}`, ...row };
        },
      }),
      query: async () => [],
    } as never;
  }

  function fakeProvider(files: Map<string, Buffer>) {
    return {
      driver: 'local' as const,
      put: async (key: string, body: Buffer) => {
        files.set(key, body);
      },
      get: async (key: string) => files.get(key) ?? null,
    };
  }

  const config = { getOrThrow: () => 'https://cdn.test' } as never;

  function service(
    files: Map<string, Buffer>,
    saved: Array<Record<string, unknown>>,
    provider: StorageProvider | null = fakeProvider(files),
  ) {
    return new StorageService(config, fakeDataSource(saved), provider);
  }

  it('stores a valid square image and attributes it to the user with no agent', async () => {
    const files = new Map<string, Buffer>();
    const saved: Array<Record<string, unknown>> = [];
    const result = await service(files, saved).uploadAvatar('user-1', {
      buffer: pngHeader(256, 256),
      size: pngHeader(256, 256).length,
    });

    expect(result.kind).toBe('avatar');
    expect(result.url).toMatch(/^https:\/\/cdn\.test\/[0-9a-f-]{36}\.png$/);
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);

    // A profile picture belongs to the creator, NOT to a product.
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      ownerUserId: 'user-1',
      agentId: null,
      kind: 'avatar',
      width: 256,
      height: 256,
    });
    expect(saved[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(files.size).toBe(1);
  });

  it('rejects a non-square banner, an undersized image and a non-image', async () => {
    const files = new Map<string, Buffer>();
    const saved: Array<Record<string, unknown>> = [];

    await expect(
      service(files, saved).uploadAvatar('user-1', {
        buffer: pngHeader(900, 300),
        size: 10,
      }),
    ).rejects.toMatchObject({ status: 422, code: 'INVALID_FILE' });

    await expect(
      service(files, saved).uploadAvatar('user-1', {
        buffer: pngHeader(48, 48),
        size: 10,
      }),
    ).rejects.toMatchObject({ status: 422, code: 'INVALID_FILE' });

    await expect(
      service(files, saved).uploadAvatar('user-1', {
        buffer: Buffer.from('<svg onload="alert(1)"/>'),
        size: 24,
      }),
    ).rejects.toMatchObject({ status: 415, code: 'INVALID_FILE' });

    expect(saved).toHaveLength(0);
    expect(files.size).toBe(0);
  });

  it('§94 — with no storage driver configured it refuses instead of pretending', async () => {
    const files = new Map<string, Buffer>();
    const saved: Array<Record<string, unknown>> = [];
    await expect(
      service(files, saved, null).uploadAvatar('user-1', {
        buffer: pngHeader(256, 256),
        size: 10,
      }),
    ).rejects.toMatchObject({ status: 503, code: 'STORAGE_DISABLED' });
    expect(saved).toHaveLength(0);
  });

  it('rejects a missing file', async () => {
    const files = new Map<string, Buffer>();
    const saved: Array<Record<string, unknown>> = [];
    await expect(
      service(files, saved).uploadAvatar('user-1', undefined),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_FILE' });
  });
});

describe('Gap closure — local storage provider', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'media-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const key = '3f2b8c1e-4d5a-4b6c-9d7e-1a2b3c4d5e6f.png';

  it('round-trips a file under a server-generated key', async () => {
    const provider = new LocalStorageProvider(dir);
    await provider.put(key, Buffer.from('abc'));
    expect((await provider.get(key))?.toString()).toBe('abc');
    expect(await readdir(dir)).toEqual([key]); // no temp file left behind
  });

  it('refuses traversal / non-uuid keys on read and write', async () => {
    const provider = new LocalStorageProvider(dir);
    for (const bad of [
      '../etc/passwd',
      '..%2f.png',
      'a.png',
      `${key}/../x`,
      `x${key}`,
    ]) {
      expect(STORAGE_KEY_RE.test(bad)).toBe(false);
      expect(await provider.get(bad)).toBeNull();
      await expect(provider.put(bad, Buffer.from('x'))).rejects.toThrow(
        'Invalid storage key',
      );
    }
  });

  it('unknown (well-formed) key → null, not an error', async () => {
    const provider = new LocalStorageProvider(dir);
    expect(
      await provider.get('00000000-0000-4000-8000-000000000000.png'),
    ).toBeNull();
  });
});
