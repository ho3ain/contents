import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import {
  MEDIA_KINDS,
  MediaAsset,
  type MediaKind,
} from '../../database/entities/platform/media-asset.entity';
import { sniffImage } from './image-sniff';
import {
  ALLOWED_IMAGE_TYPES,
  MEDIA_RULES,
  checkMedia,
  type MediaRule,
} from './media-rules';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider';

export interface StorageCapabilities {
  enabled: boolean;
  driver: 'none' | 'local';
  types: string[];
  rules: Record<MediaKind, MediaRule>;
  /** Video upload is not offered (URL-only demo links). */
  video: false;
}

export interface UploadedMedia {
  id: string;
  kind: MediaKind;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

/** Kinds a creator may attach to a PRODUCT; avatar/blog images are user-owned. */
export const PRODUCT_MEDIA_KINDS = MEDIA_KINDS.filter(
  (k) => k !== 'avatar' && k !== 'blog',
);

export interface IncomingFile {
  buffer: Buffer;
  size: number;
}

/**
 * Gap closure — validated media uploads through the storage abstraction.
 * Ownership is checked against the caller's creator profile; the file type
 * comes from magic bytes; limits come from MEDIA_RULES; every stored file
 * gets a DB row (who, which product, what, how big, sha256).
 */
@Injectable()
export class StorageService {
  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional()
    @Inject(STORAGE_PROVIDER)
    private readonly provider: StorageProvider | null,
  ) {}

  capabilities(): StorageCapabilities {
    return {
      enabled: Boolean(this.provider),
      driver: this.provider ? this.provider.driver : 'none',
      types: ALLOWED_IMAGE_TYPES,
      rules: MEDIA_RULES,
      video: false,
    };
  }

  private publicUrl(key: string): string {
    return `${this.config.getOrThrow<string>('storagePublicBaseUrl')}/${key}`;
  }

  async upload(
    userId: string,
    agentId: string,
    kind: string,
    file: IncomingFile | undefined,
  ): Promise<UploadedMedia> {
    if (!this.provider) {
      throw new ApiException(
        'STORAGE_DISABLED',
        'File uploads are not enabled on this server — use an image URL',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!(PRODUCT_MEDIA_KINDS as readonly string[]).includes(kind)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        `kind must be one of: ${PRODUCT_MEDIA_KINDS.join(', ')}`,
        HttpStatus.BAD_REQUEST,
        { field: 'kind' },
      );
    }
    const mediaKind = kind as MediaKind;
    // Ownership: the product must belong to the caller's creator profile.
    const owned = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT a.id FROM agents a
         JOIN creator_profiles cp ON cp.id = a.creator_id
        WHERE a.id = $1 AND cp.user_id = $2`,
      [agentId, userId],
    );
    if (!owned.length) {
      throw new ApiException(
        'NOT_FOUND',
        'Agent not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!file || !file.buffer?.length) {
      throw new ApiException(
        'INVALID_FILE',
        'No file was uploaded',
        HttpStatus.BAD_REQUEST,
        { field: 'file' },
      );
    }
    const rule = MEDIA_RULES[mediaKind];
    if (file.buffer.length > rule.maxBytes) {
      throw new ApiException(
        'FILE_TOO_LARGE',
        `The file is larger than ${rule.maxBytes} bytes`,
        HttpStatus.PAYLOAD_TOO_LARGE,
        { maxBytes: rule.maxBytes },
      );
    }
    const info = sniffImage(file.buffer);
    if (!info) {
      throw new ApiException(
        'INVALID_FILE',
        'Only PNG, JPEG or WebP images are accepted',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        { allowed: ALLOWED_IMAGE_TYPES },
      );
    }
    const violation = checkMedia(
      mediaKind,
      file.buffer.length,
      info.width,
      info.height,
    );
    if (violation) {
      throw new ApiException(
        'INVALID_FILE',
        'The image does not meet the size requirements',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { ...violation, width: info.width, height: info.height },
      );
    }
    const key = `${randomUUID()}.${info.ext}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.provider.put(key, file.buffer);
    const asset = await this.dataSource.getRepository(MediaAsset).save(
      this.dataSource.getRepository(MediaAsset).create({
        ownerUserId: userId,
        agentId,
        kind: mediaKind,
        driver: this.provider.driver,
        storageKey: key,
        mimeType: info.mime,
        sizeBytes: file.buffer.length,
        width: info.width,
        height: info.height,
        sha256,
      }),
    );
    return {
      id: asset.id,
      kind: mediaKind,
      url: this.publicUrl(key),
      mimeType: info.mime,
      sizeBytes: asset.sizeBytes,
      width: info.width,
      height: info.height,
    };
  }

  /**
   * A creator PROFILE picture.
   *
   * Same validation path as a product image — driver present, kind known,
   * magic bytes, byte size, dimensions, ratio — with two differences: there is
   * no agent to own, and the row is stored with `agentId: null`. Ownership is
   * still per-user, so a creator can only ever write a file attributed to
   * themselves.
   */
  async uploadAvatar(
    userId: string,
    file: IncomingFile | undefined,
  ): Promise<UploadedMedia> {
    return this.uploadStandalone(userId, 'avatar', file);
  }

  /**
   * Blog platform — an article image (featured or inline). Same validation
   * path as every other upload; the row is owned by the editor and carries no
   * agent. Authorisation (blog:manage) is enforced by the blog controller.
   */
  async uploadBlogImage(
    userId: string,
    file: IncomingFile | undefined,
  ): Promise<UploadedMedia> {
    return this.uploadStandalone(userId, 'blog', file);
  }

  /**
   * An image that belongs to a USER rather than a product (`agentId: null`):
   * driver present, magic bytes, byte size, dimensions, ratio — exactly the
   * product-image path minus the ownership lookup.
   */
  private async uploadStandalone(
    userId: string,
    kind: Extract<MediaKind, 'avatar' | 'blog'>,
    file: IncomingFile | undefined,
  ): Promise<UploadedMedia> {
    if (!this.provider) {
      throw new ApiException(
        'STORAGE_DISABLED',
        'File uploads are not enabled on this server — use an image URL',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!file || !file.buffer?.length) {
      throw new ApiException(
        'INVALID_FILE',
        'No file was uploaded',
        HttpStatus.BAD_REQUEST,
        { field: 'file' },
      );
    }
    const rule = MEDIA_RULES[kind];
    if (file.buffer.length > rule.maxBytes) {
      throw new ApiException(
        'FILE_TOO_LARGE',
        `The file is larger than ${rule.maxBytes} bytes`,
        HttpStatus.PAYLOAD_TOO_LARGE,
        { maxBytes: rule.maxBytes },
      );
    }
    const info = sniffImage(file.buffer);
    if (!info) {
      throw new ApiException(
        'INVALID_FILE',
        'Only PNG, JPEG or WebP images are accepted',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        { allowed: ALLOWED_IMAGE_TYPES },
      );
    }
    const violation = checkMedia(
      kind,
      file.buffer.length,
      info.width,
      info.height,
    );
    if (violation) {
      throw new ApiException(
        'INVALID_FILE',
        'The image does not meet the size requirements',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { ...violation, width: info.width, height: info.height },
      );
    }
    const key = `${randomUUID()}.${info.ext}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.provider.put(key, file.buffer);
    const asset = await this.dataSource.getRepository(MediaAsset).save(
      this.dataSource.getRepository(MediaAsset).create({
        ownerUserId: userId,
        agentId: null,
        kind,
        driver: this.provider.driver,
        storageKey: key,
        mimeType: info.mime,
        sizeBytes: file.buffer.length,
        width: info.width,
        height: info.height,
        sha256,
      }),
    );
    return {
      id: asset.id,
      kind,
      url: this.publicUrl(key),
      mimeType: info.mime,
      sizeBytes: asset.sizeBytes,
      width: info.width,
      height: info.height,
    };
  }

  /** Serves a stored file; null for unknown keys or a disabled driver. */
  async read(key: string): Promise<{ body: Buffer; mimeType: string } | null> {
    if (!this.provider) return null;
    const asset = await this.dataSource
      .getRepository(MediaAsset)
      .findOneBy({ storageKey: key });
    if (!asset) return null;
    const body = await this.provider.get(key);
    return body ? { body, mimeType: asset.mimeType } : null;
  }
}
