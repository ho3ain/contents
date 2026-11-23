import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * `avatar` is the creator PROFILE picture. It carries no agentId — a profile
 * is not a product. Added for the /creator/profile workspace; `kind` is a
 * varchar(16) column and not a Postgres enum, so widening the union needs no
 * migration.
 */
export const MEDIA_KINDS = [
  'logo',
  'cover',
  'screenshot',
  'avatar',
  /** Blog platform — article featured/body image (no agent; owner = the editor). */
  'blog',
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * Gap closure — a file stored through the storage abstraction. Only images
 * whose MAGIC BYTES match an allowed type are ever written; the declared
 * client MIME type is ignored. Rows exist only when a real storage driver
 * is configured (`STORAGE_DRIVER`).
 */
@Entity({ name: 'media_assets' })
@Index('IDX_media_assets_agent', ['agentId'])
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind: MediaKind;

  @Column({ type: 'varchar', length: 16 })
  driver: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 200, unique: true })
  storageKey: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @Column({ type: 'int' })
  width: number;

  @Column({ type: 'int' })
  height: number;

  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
