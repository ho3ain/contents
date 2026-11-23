import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SEO Studio · Content Studio · Knowledge Graph — shared foundation
 * (2026-10-15).
 *
 * Additive only. No existing column is changed; no content is rewritten.
 *
 * - `content_seo`      per article/product SEO metadata (robots, OG, Twitter
 *                      card, focus/related keywords, language, translation
 *                      group). Articles keep their four legacy SEO columns on
 *                      `blog_posts`; products store everything here.
 * - `content_links`    real hyperlinks extracted from stored content — the
 *                      single source for graph edges, orphans, broken links.
 * - `link_suggestions` explainable internal-link proposals with approve /
 *                      reject state.
 *
 * Rollback drops the three tables (nothing else is touched).
 */
export class SeoStudio1772700000000 implements MigrationInterface {
  name = 'SeoStudio1772700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "content_seo" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "content_type" varchar(16) NOT NULL,
        "content_id" uuid NOT NULL,
        "seo_title" varchar(70),
        "seo_description" varchar(160),
        "canonical_url" text,
        "og_image_url" text,
        "robots_index" boolean NOT NULL DEFAULT true,
        "robots_follow" boolean NOT NULL DEFAULT true,
        "og_title" varchar(95),
        "og_description" varchar(200),
        "twitter_card" varchar(24) NOT NULL DEFAULT 'summary_large_image',
        "focus_keyword" varchar(80),
        "focus_keyword_key" varchar(80),
        "related_keywords" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "language" varchar(5) NOT NULL DEFAULT 'fa',
        "translation_group_id" uuid,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_content_seo" PRIMARY KEY ("id"),
        CONSTRAINT "chk_content_seo_type" CHECK ("content_type" IN ('post', 'agent')),
        CONSTRAINT "chk_content_seo_language" CHECK ("language" IN ('fa', 'en')),
        CONSTRAINT "chk_content_seo_twitter" CHECK ("twitter_card" IN ('summary', 'summary_large_image'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_content_seo_content" ON "content_seo" ("content_type", "content_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_content_seo_translation" ON "content_seo" ("translation_group_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_content_seo_focus" ON "content_seo" ("focus_keyword_key")`,
    );

    await queryRunner.query(`
      CREATE TABLE "content_links" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source_type" varchar(16) NOT NULL,
        "source_id" uuid NOT NULL,
        "target_type" varchar(16) NOT NULL,
        "target_id" uuid,
        "href" text NOT NULL,
        "anchor" varchar(300) NOT NULL DEFAULT '',
        "position" int NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'ok',
        "checked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_content_links" PRIMARY KEY ("id"),
        CONSTRAINT "chk_content_links_source_type" CHECK ("source_type" IN ('post', 'agent')),
        CONSTRAINT "chk_content_links_target_type" CHECK ("target_type" IN ('post', 'agent', 'route', 'external')),
        CONSTRAINT "chk_content_links_status" CHECK ("status" IN ('ok', 'broken', 'unpublished'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_content_links_source" ON "content_links" ("source_type", "source_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_content_links_target" ON "content_links" ("target_type", "target_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_content_links_status" ON "content_links" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "link_suggestions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source_type" varchar(16) NOT NULL,
        "source_id" uuid NOT NULL,
        "target_type" varchar(16) NOT NULL,
        "target_id" uuid NOT NULL,
        "reason" varchar(32) NOT NULL,
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "score" smallint NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "decided_by" uuid,
        "decided_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_link_suggestions" PRIMARY KEY ("id"),
        CONSTRAINT "chk_link_suggestions_reason" CHECK ("reason" IN ('shared_keyword', 'same_category', 'orphan_target', 'title_overlap')),
        CONSTRAINT "chk_link_suggestions_status" CHECK ("status" IN ('pending', 'approved', 'rejected')),
        CONSTRAINT "chk_link_suggestions_score" CHECK ("score" BETWEEN 0 AND 100)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_link_suggestions_pair" ON "link_suggestions" ("source_type", "source_id", "target_type", "target_id", "reason")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_link_suggestions_status" ON "link_suggestions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_link_suggestions_source" ON "link_suggestions" ("source_type", "source_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "link_suggestions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "content_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "content_seo"`);
  }
}
