import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Blog platform (2026-10-12) — editorial content model.
 *
 * Creates nine NEW tables and one enum; touches no existing table, so the
 * marketplace, auth and taxonomy schemas are unaffected in both directions.
 *
 *   blog_categories            editorial categories (one optional parent level)
 *   blog_tags                  flat editorial tags
 *   blog_posts                 articles: source Markdown + server-rendered
 *                              block tree + derived TOC/word count/reading
 *                              time/search text, workflow status, SEO fields,
 *                              optimistic-concurrency `version`
 *   blog_post_tags             post ↔ tag
 *   blog_post_relations        hand-picked related articles
 *   blog_post_agents           article → marketplace product
 *   blog_post_market_categories article → marketplace category
 *   blog_slug_redirects        old slug → post (URL stability on rename)
 *   blog_post_revisions        bounded content history
 *
 * Rollback: `down()` drops the nine tables and the enum. THIS DELETES ALL
 * BLOG CONTENT — take a dump of the `blog_*` tables first
 * (`pg_dump -t 'blog_*'`) if any article must survive the rollback. Nothing
 * outside `blog_*` is changed, so marketplace data is preserved either way.
 * Both directions are verified by test/blog/blog-migration.e2e-spec.ts.
 */
export class BlogPlatform1772200000000 implements MigrationInterface {
  name = 'BlogPlatform1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "blog_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar(110) NOT NULL,
        "name" varchar(120) NOT NULL,
        "name_en" varchar(120) NULL,
        "description" text NULL,
        "parent_id" uuid NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_categories" PRIMARY KEY ("id"),
        CONSTRAINT "fk_blog_categories_parent" FOREIGN KEY ("parent_id")
          REFERENCES "blog_categories"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_blog_categories_slug" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
        CONSTRAINT "chk_blog_categories_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_blog_categories_slug" ON "blog_categories" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_categories_parent" ON "blog_categories" ("parent_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "blog_tags" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar(110) NOT NULL,
        "name" varchar(80) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_tags" PRIMARY KEY ("id"),
        CONSTRAINT "chk_blog_tags_slug" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_blog_tags_slug" ON "blog_tags" ("slug")`,
    );

    await queryRunner.query(`
      CREATE TYPE "blog_post_status" AS ENUM
        ('draft', 'in_review', 'scheduled', 'published', 'unpublished', 'archived')
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_posts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar(140) NOT NULL,
        "title" varchar(180) NOT NULL,
        "excerpt" text NOT NULL DEFAULT '',
        "body_markdown" text NOT NULL DEFAULT '',
        "body_blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "toc" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "word_count" int NOT NULL DEFAULT 0,
        "reading_minutes" int NOT NULL DEFAULT 1,
        "search_text" text NOT NULL DEFAULT '',
        "featured_image_url" text NULL,
        "featured_image_alt" varchar(240) NULL,
        "featured_image_caption" varchar(240) NULL,
        "author_user_id" uuid NULL,
        "reviewer_user_id" uuid NULL,
        "status" "blog_post_status" NOT NULL DEFAULT 'draft',
        "published_at" timestamptz NULL,
        "scheduled_for" timestamptz NULL,
        "content_updated_at" timestamptz NULL,
        "seo_title" varchar(70) NULL,
        "seo_description" varchar(170) NULL,
        "canonical_url" text NULL,
        "og_image_url" text NULL,
        "primary_category_id" uuid NULL,
        "pillar_post_id" uuid NULL,
        "is_featured" boolean NOT NULL DEFAULT false,
        "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "editorial_note" text NULL,
        "version" int NOT NULL DEFAULT 1,
        "created_by" uuid NULL,
        "updated_by" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_posts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_blog_posts_author" FOREIGN KEY ("author_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_blog_posts_reviewer" FOREIGN KEY ("reviewer_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_blog_posts_primary_category" FOREIGN KEY ("primary_category_id")
          REFERENCES "blog_categories"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_blog_posts_pillar" FOREIGN KEY ("pillar_post_id")
          REFERENCES "blog_posts"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_blog_posts_slug" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
        CONSTRAINT "chk_blog_posts_not_own_pillar" CHECK ("pillar_post_id" IS NULL OR "pillar_post_id" <> "id"),
        CONSTRAINT "chk_blog_posts_published_has_date" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL),
        CONSTRAINT "chk_blog_posts_scheduled_has_date" CHECK ("status" <> 'scheduled' OR "scheduled_for" IS NOT NULL),
        CONSTRAINT "chk_blog_posts_version_positive" CHECK ("version" >= 1)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_blog_posts_slug" ON "blog_posts" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_posts_status_published" ON "blog_posts" ("status", "published_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_posts_category" ON "blog_posts" ("primary_category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_posts_author" ON "blog_posts" ("author_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_posts_scheduled" ON "blog_posts" ("scheduled_for") WHERE "status" = 'scheduled'`,
    );
    // Trigram index for substring search (pg_trgm is created by
    // 1762000000000 when available; a plain ILIKE still works without it).
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
          CREATE INDEX "idx_blog_posts_search_trgm" ON "blog_posts" USING gin ("search_text" gin_trgm_ops);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_post_tags" (
        "post_id" uuid NOT NULL,
        "tag_id" uuid NOT NULL,
        CONSTRAINT "pk_blog_post_tags" PRIMARY KEY ("post_id", "tag_id"),
        CONSTRAINT "fk_blog_post_tags_post" FOREIGN KEY ("post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_post_tags_tag" FOREIGN KEY ("tag_id")
          REFERENCES "blog_tags"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_blog_post_tags_tag" ON "blog_post_tags" ("tag_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "blog_post_relations" (
        "post_id" uuid NOT NULL,
        "related_post_id" uuid NOT NULL,
        "position" smallint NOT NULL DEFAULT 0,
        CONSTRAINT "pk_blog_post_relations" PRIMARY KEY ("post_id", "related_post_id"),
        CONSTRAINT "fk_blog_post_relations_post" FOREIGN KEY ("post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_post_relations_related" FOREIGN KEY ("related_post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_blog_post_relations_not_self" CHECK ("post_id" <> "related_post_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_post_agents" (
        "post_id" uuid NOT NULL,
        "agent_id" uuid NOT NULL,
        "position" smallint NOT NULL DEFAULT 0,
        CONSTRAINT "pk_blog_post_agents" PRIMARY KEY ("post_id", "agent_id"),
        CONSTRAINT "fk_blog_post_agents_post" FOREIGN KEY ("post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_post_agents_agent" FOREIGN KEY ("agent_id")
          REFERENCES "agents"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_blog_post_agents_agent" ON "blog_post_agents" ("agent_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "blog_post_market_categories" (
        "post_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "position" smallint NOT NULL DEFAULT 0,
        CONSTRAINT "pk_blog_post_market_categories" PRIMARY KEY ("post_id", "category_id"),
        CONSTRAINT "fk_blog_post_market_categories_post" FOREIGN KEY ("post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_post_market_categories_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_blog_post_market_categories_category" ON "blog_post_market_categories" ("category_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "blog_slug_redirects" (
        "old_slug" varchar(140) NOT NULL,
        "post_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_slug_redirects" PRIMARY KEY ("old_slug"),
        CONSTRAINT "fk_blog_slug_redirects_post" FOREIGN KEY ("post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_blog_slug_redirects_post" ON "blog_slug_redirects" ("post_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "blog_post_revisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "post_id" uuid NOT NULL,
        "version" int NOT NULL,
        "reason" varchar(16) NOT NULL,
        "snapshot" jsonb NOT NULL,
        "created_by" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_post_revisions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_blog_post_revisions_post" FOREIGN KEY ("post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_post_revisions_user" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_blog_post_revisions_post" ON "blog_post_revisions" ("post_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_post_revisions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_slug_redirects"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "blog_post_market_categories"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_post_agents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_post_relations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_post_tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_posts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "blog_post_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_categories"`);
  }
}
