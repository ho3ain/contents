import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  TAXONOMY_CATEGORIES,
  TAXONOMY_INDUSTRIES,
  TAXONOMY_INTEGRATIONS,
} from '../taxonomy/taxonomy-data';

/**
 * Taxonomy v2 — Persian display names, category hierarchy, industries.
 *
 * ADDITIVE ONLY (taxonomy audit 2026-10-12):
 *  - categories: + name_fa, description_fa, aliases (jsonb), parent_id (self FK,
 *    max depth 2 enforced in the service). Existing ids/slugs/relations are
 *    untouched; new categories are inserted ON CONFLICT (slug) DO NOTHING.
 *  - industries + agent_industries: new structured attribute (multi-select).
 *  - integrations: new rows ON CONFLICT DO NOTHING (brand names stay EN).
 *
 * Rollback (down) removes ONLY what this migration added and refuses to drop a
 * category that already has products linked (those rows are deactivated
 * instead), so no product↔category relation can ever be lost.
 */
export class TaxonomyPersianIndustries1772000000000 implements MigrationInterface {
  name = 'TaxonomyPersianIndustries1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
        ADD COLUMN IF NOT EXISTS "name_fa" varchar(120) NULL,
        ADD COLUMN IF NOT EXISTS "description_fa" varchar(400) NULL,
        ADD COLUMN IF NOT EXISTS "aliases" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "parent_id" uuid NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_categories_parent') THEN
          ALTER TABLE "categories"
            ADD CONSTRAINT "fk_categories_parent" FOREIGN KEY ("parent_id")
            REFERENCES "categories"("id") ON DELETE RESTRICT;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_categories_parent" ON "categories" ("parent_id")`,
    );

    // 0) Re-apply after a rollback (release-readiness validation 2026-10-12):
    //    down() cannot delete a taxonomy category that already has products,
    //    so it deactivates it and drops the Persian / hierarchy columns. Right
    //    after those columns are re-created (name_fa is NULL for every row —
    //    on a FRESH database none of these slugs exist yet, so this is a
    //    no-op there) the rows down() deactivated get their taxonomy status
    //    back. Only non-MESH slugs — exactly the set down() touched; admin
    //    created categories are never matched.
    await queryRunner.query(
      `UPDATE "categories" c SET "status" = 'active'
        WHERE c."slug" = ANY($1::text[])
          AND c."status" = 'inactive'
          AND c."name_fa" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "categories" x WHERE x."name_fa" IS NOT NULL)`,
      [
        TAXONOMY_CATEGORIES.filter((c) => c.source !== 'MESH' && c.active).map(
          (c) => c.slug,
        ),
      ],
    );

    // 1) Persian names / aliases for EXISTING categories (matched by slug;
    //    English name & description are never overwritten).
    for (const category of TAXONOMY_CATEGORIES) {
      await queryRunner.query(
        `UPDATE "categories"
            SET "name_fa" = COALESCE("name_fa", $2),
                "description_fa" = COALESCE("description_fa", $3),
                "aliases" = CASE WHEN "aliases" = '[]'::jsonb THEN $4::jsonb ELSE "aliases" END
          WHERE "slug" = $1`,
        [
          category.slug,
          category.nameFa,
          category.descriptionFa,
          JSON.stringify(category.aliases),
        ],
      );
    }
    // 2) New top-level categories, then subcategories (parent resolved by slug).
    // Re-apply after a rollback (release-readiness validation 2026-10-12):
    // down() keeps a taxonomy category that already has products (ids and
    // links are never lost) but has to deactivate it and drop the Persian /
    // hierarchy columns. A second up() therefore RESTORES exactly what its own
    // down() removed — and nothing an admin set in between: Persian fields
    // only when empty, the parent only when missing (status: see step 0).
    // Admin-created categories are never matched (their slugs are not in
    // TAXONOMY_CATEGORIES).
    const restore = `
         ON CONFLICT ("slug") DO UPDATE SET
           "name_fa" = COALESCE("categories"."name_fa", EXCLUDED."name_fa"),
           "description_fa" = COALESCE("categories"."description_fa", EXCLUDED."description_fa"),
           "aliases" = CASE WHEN "categories"."aliases" = '[]'::jsonb THEN EXCLUDED."aliases" ELSE "categories"."aliases" END,
           "parent_id" = COALESCE("categories"."parent_id", EXCLUDED."parent_id")`;
    for (const category of TAXONOMY_CATEGORIES.filter((c) => !c.parentSlug)) {
      await queryRunner.query(
        `INSERT INTO "categories" ("name", "slug", "description", "sort_order", "status", "name_fa", "description_fa", "aliases", "parent_id")
         VALUES ($1, $2, $3, $4, $5::category_status, $6, $7, $8::jsonb, NULL::uuid)${restore}`,
        [
          category.name,
          category.slug,
          category.description,
          category.sortOrder,
          category.active ? 'active' : 'inactive',
          category.nameFa,
          category.descriptionFa,
          JSON.stringify(category.aliases),
        ],
      );
    }
    for (const category of TAXONOMY_CATEGORIES.filter((c) => c.parentSlug)) {
      await queryRunner.query(
        `INSERT INTO "categories" ("name", "slug", "description", "sort_order", "status", "name_fa", "description_fa", "aliases", "parent_id")
         SELECT $1, $2, $3, $4, $5::category_status, $6, $7, $8::jsonb, p."id"
           FROM "categories" p WHERE p."slug" = $9${restore}`,
        [
          category.name,
          category.slug,
          category.description,
          category.sortOrder,
          category.active ? 'active' : 'inactive',
          category.nameFa,
          category.descriptionFa,
          JSON.stringify(category.aliases),
          category.parentSlug,
        ],
      );
    }

    // 3) Industries (new structured attribute).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "industries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(80) NOT NULL,
        "name" varchar(100) NOT NULL,
        "name_fa" varchar(120) NULL,
        "description_fa" varchar(400) NULL,
        "aliases" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "sort_order" integer NOT NULL DEFAULT 0,
        "status" category_status NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_industries_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_industries" (
        "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
        "industry_id" uuid NOT NULL REFERENCES "industries"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("agent_id", "industry_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_industries_industry" ON "agent_industries" ("industry_id")`,
    );
    for (const industry of TAXONOMY_INDUSTRIES) {
      await queryRunner.query(
        `INSERT INTO "industries" ("slug", "name", "name_fa", "description_fa", "aliases", "sort_order", "status")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::category_status)
         ON CONFLICT ("slug") DO NOTHING`,
        [
          industry.slug,
          industry.name,
          industry.nameFa,
          industry.descriptionFa,
          JSON.stringify(industry.aliases),
          industry.sortOrder,
          industry.active ? 'active' : 'inactive',
        ],
      );
    }

    // 4) Integrations catalog growth (existing rows untouched).
    for (const integration of TAXONOMY_INTEGRATIONS) {
      await queryRunner.query(
        `INSERT INTO "integrations" ("slug", "name", "website_url")
         VALUES ($1, $2, $3)
         ON CONFLICT ("slug") DO NOTHING`,
        [integration.slug, integration.name, integration.websiteUrl],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Integrations added here: drop only if no agent references them.
    await queryRunner.query(
      `DELETE FROM "integrations" i
        WHERE i."slug" = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM "agent_integrations" ai WHERE ai."integration_id" = i."id")`,
      [TAXONOMY_INTEGRATIONS.map((i) => i.slug)],
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_industries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "industries"`);

    const added = TAXONOMY_CATEGORIES.filter((c) => c.source !== 'MESH').map(
      (c) => c.slug,
    );
    // Children first (FK RESTRICT), never delete a category with products.
    await queryRunner.query(
      `UPDATE "categories" c SET "status" = 'inactive'
        WHERE c."slug" = ANY($1::text[])
          AND EXISTS (SELECT 1 FROM "agent_categories" ac WHERE ac."category_id" = c."id")`,
      [added],
    );
    await queryRunner.query(
      `DELETE FROM "categories" c
        WHERE c."slug" = ANY($1::text[])
          AND c."parent_id" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "agent_categories" ac WHERE ac."category_id" = c."id")`,
      [added],
    );
    await queryRunner.query(
      `DELETE FROM "categories" c
        WHERE c."slug" = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM "agent_categories" ac WHERE ac."category_id" = c."id")
          AND NOT EXISTS (SELECT 1 FROM "categories" ch WHERE ch."parent_id" = c."id")`,
      [added],
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "fk_categories_parent"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_categories_parent"`);
    await queryRunner.query(`
      ALTER TABLE "categories"
        DROP COLUMN IF EXISTS "parent_id",
        DROP COLUMN IF EXISTS "aliases",
        DROP COLUMN IF EXISTS "description_fa",
        DROP COLUMN IF EXISTS "name_fa"
    `);
  }
}
