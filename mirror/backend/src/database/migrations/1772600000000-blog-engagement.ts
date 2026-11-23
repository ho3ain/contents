import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Blog engagement — ratings, comments, likes, reports, comment bans
 * (2026-10-14).
 *
 * Adds reader engagement to the blog platform without touching marketplace
 * tables:
 *
 *   blog_post_ratings      1–5 stars, one row per (post, reader), editable
 *   blog_comments          threaded comments (one reply level), published →
 *                          hidden (author withdraws) / removed (moderation)
 *   blog_comment_likes     one like per (comment, reader)
 *   blog_comment_reports   reader flags → admin queue (open/resolved/dismissed)
 *   blog_comment_bans      readers barred from commenting by the editorial team
 *
 * `blog_posts` gains three denormalised counters (`rating_avg`,
 * `rating_count`, `comment_count`) so list pages and cards never aggregate
 * on read; the service recomputes them inside the same transaction as every
 * write, so they can always be rebuilt from the source tables.
 *
 * Rollback: `down()` drops the five tables, the three enums and the three
 * counters. THIS DELETES ALL READER RATINGS AND COMMENTS — dump the
 * `blog_comment*` / `blog_post_ratings` tables first if they must survive.
 * Articles themselves are untouched.
 */
export class BlogEngagement1772600000000 implements MigrationInterface {
  name = 'BlogEngagement1772600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_posts"
        ADD COLUMN "rating_avg" numeric(3,2) NOT NULL DEFAULT 0,
        ADD COLUMN "rating_count" int NOT NULL DEFAULT 0,
        ADD COLUMN "comment_count" int NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_post_ratings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "post_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "rating" smallint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_post_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "fk_blog_post_ratings_post" FOREIGN KEY ("post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_post_ratings_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_blog_post_ratings_range" CHECK ("rating" BETWEEN 1 AND 5)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_blog_post_ratings_post_user" ON "blog_post_ratings" ("post_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_post_ratings_user" ON "blog_post_ratings" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TYPE "blog_comment_status" AS ENUM ('published', 'hidden', 'removed')
    `);
    await queryRunner.query(`
      CREATE TABLE "blog_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "post_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "parent_id" uuid NULL,
        "body" text NOT NULL,
        "status" "blog_comment_status" NOT NULL DEFAULT 'published',
        "like_count" int NOT NULL DEFAULT 0,
        "reply_count" int NOT NULL DEFAULT 0,
        "edited_at" timestamptz NULL,
        "removed_by" uuid NULL,
        "removed_at" timestamptz NULL,
        "removed_reason" varchar(240) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_comments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_blog_comments_post" FOREIGN KEY ("post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_comments_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_comments_parent" FOREIGN KEY ("parent_id")
          REFERENCES "blog_comments"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_blog_comments_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000),
        CONSTRAINT "chk_blog_comments_not_own_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
        CONSTRAINT "chk_blog_comments_counts" CHECK ("like_count" >= 0 AND "reply_count" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_blog_comments_post_status_created" ON "blog_comments" ("post_id", "status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_comments_parent" ON "blog_comments" ("parent_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_comments_user" ON "blog_comments" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "blog_comment_likes" (
        "comment_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_comment_likes" PRIMARY KEY ("comment_id", "user_id"),
        CONSTRAINT "fk_blog_comment_likes_comment" FOREIGN KEY ("comment_id")
          REFERENCES "blog_comments"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_comment_likes_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_blog_comment_likes_user" ON "blog_comment_likes" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TYPE "blog_comment_report_reason" AS ENUM ('spam', 'abuse', 'off_topic', 'other')
    `);
    await queryRunner.query(`
      CREATE TYPE "blog_comment_report_status" AS ENUM ('open', 'resolved', 'dismissed')
    `);
    await queryRunner.query(`
      CREATE TABLE "blog_comment_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "comment_id" uuid NOT NULL,
        "reporter_id" uuid NOT NULL,
        "reason" "blog_comment_report_reason" NOT NULL,
        "note" varchar(500) NULL,
        "status" "blog_comment_report_status" NOT NULL DEFAULT 'open',
        "resolved_by" uuid NULL,
        "resolved_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_comment_reports" PRIMARY KEY ("id"),
        CONSTRAINT "fk_blog_comment_reports_comment" FOREIGN KEY ("comment_id")
          REFERENCES "blog_comments"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_blog_comment_reports_reporter" FOREIGN KEY ("reporter_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_blog_comment_reports_comment_reporter" ON "blog_comment_reports" ("comment_id", "reporter_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blog_comment_reports_status" ON "blog_comment_reports" ("status", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "blog_comment_bans" (
        "user_id" uuid NOT NULL,
        "created_by" uuid NULL,
        "reason" varchar(240) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_comment_bans" PRIMARY KEY ("user_id"),
        CONSTRAINT "fk_blog_comment_bans_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_comment_bans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_comment_reports"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "blog_comment_report_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "blog_comment_report_reason"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_comment_likes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_comments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "blog_comment_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_post_ratings"`);
    await queryRunner.query(`
      ALTER TABLE "blog_posts"
        DROP COLUMN IF EXISTS "comment_count",
        DROP COLUMN IF EXISTS "rating_count",
        DROP COLUMN IF EXISTS "rating_avg"
    `);
  }
}
