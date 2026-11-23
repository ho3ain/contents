import { AppDataSource } from '../../src/database/data-source';

/**
 * Blog platform — migration integrity (non-production database only).
 *
 * Proves that `1772200000000-blog-platform` is reversible and isolated:
 *  - down() removes exactly the blog tables and the enum (the engagement
 *    migration that followed is undone first and re-applied);
 *  - nothing outside `blog_*` changes in either direction (row counts of
 *    users / agents / categories / media_assets / audit_logs are identical
 *    before and after a down → up cycle);
 *  - up() after down() recreates the schema with all constraints and indexes.
 *
 * It intentionally does NOT keep blog rows across the cycle: the documented
 * rollback contract is "blog content is dropped — dump `blog_*` first".
 *
 * Migrations that shipped AFTER the blog platform are rolled back first (one
 * `undoLastMigration()` each, newest first) and re-applied by the final
 * `runMigrations()`, so this spec stays valid as the migration chain grows and
 * also proves that every later `down()` is clean.
 */
describe('Blog platform — migration up/down/up', () => {
  const MIGRATION = 'BlogPlatform1772200000000';
  const BLOG_TABLES = [
    'blog_categories',
    'blog_tags',
    'blog_posts',
    'blog_post_tags',
    'blog_post_relations',
    'blog_post_agents',
    'blog_post_market_categories',
    'blog_slug_redirects',
    'blog_post_revisions',
    // 1772600000000-blog-engagement
    'blog_post_ratings',
    'blog_comments',
    'blog_comment_likes',
    'blog_comment_reports',
    'blog_comment_bans',
  ];
  const WATCHED = [
    'users',
    'agents',
    'categories',
    'media_assets',
    'audit_logs',
    'typeorm_migrations',
  ];

  const tables = async (): Promise<string[]> =>
    (
      await AppDataSource.query<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'blog\\_%' ORDER BY table_name`,
      )
    ).map((r) => r.table_name);
  const counts = async (): Promise<Record<string, number>> => {
    const out: Record<string, number> = {};
    for (const t of WATCHED) {
      const r = await AppDataSource.query<Array<{ n: string }>>(
        `SELECT COUNT(*)::text AS n FROM "${t}"`,
      );
      out[t] = Number(r[0].n);
    }
    return out;
  };

  beforeAll(async () => {
    await AppDataSource.initialize();
  }, 60_000);

  afterAll(async () => {
    await AppDataSource.destroy();
  });

  const executed = async (): Promise<string[]> =>
    (
      await AppDataSource.query<Array<{ name: string }>>(
        `SELECT name FROM typeorm_migrations ORDER BY timestamp DESC`,
      )
    ).map((r) => r.name);

  it('is executed and every blog table exists', async () => {
    expect(await executed()).toContain(MIGRATION);
    expect(await tables()).toEqual([...BLOG_TABLES].sort());
  });

  it('down() drops only blog_* (+ enum) and leaves every other table untouched; up() recreates the schema', async () => {
    const before = await counts();
    // Newest first: every migration after the blog platform, then the blog
    // platform itself.
    let undone = 0;
    for (;;) {
      const [last] = await executed();
      if (!last) throw new Error(`${MIGRATION} is not in typeorm_migrations`);
      await AppDataSource.undoLastMigration();
      undone += 1;
      if (last === MIGRATION) break;
    }
    expect(await tables()).toEqual([]);
    const enumGone = await AppDataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n FROM pg_type WHERE typname = 'blog_post_status'`,
    );
    expect(Number(enumGone[0].n)).toBe(0);
    const during = await counts();
    expect({
      ...during,
      typeorm_migrations: before.typeorm_migrations,
    }).toEqual({
      ...before,
      typeorm_migrations: before.typeorm_migrations,
    });
    expect(during.typeorm_migrations).toBe(before.typeorm_migrations - undone);

    await AppDataSource.runMigrations();
    expect(await tables()).toEqual([...BLOG_TABLES].sort());
    const after = await counts();
    expect(after).toEqual(before);
    const engagementEnums = await AppDataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n FROM pg_type WHERE typname IN ('blog_comment_status', 'blog_comment_report_reason', 'blog_comment_report_status')`,
    );
    expect(Number(engagementEnums[0].n)).toBe(3);
    const counters = await AppDataSource.query<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name IN ('rating_avg', 'rating_count', 'comment_count')`,
    );
    expect(counters).toHaveLength(3);

    const constraints = await AppDataSource.query<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'blog_posts'::regclass ORDER BY conname`,
    );
    expect(constraints.map((c) => c.conname)).toEqual(
      expect.arrayContaining([
        'chk_blog_posts_slug',
        'chk_blog_posts_published_has_date',
        'chk_blog_posts_scheduled_has_date',
        'fk_blog_posts_author',
        'fk_blog_posts_primary_category',
        'fk_blog_posts_pillar',
      ]),
    );
    const indexes = await AppDataSource.query<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'blog_posts' ORDER BY indexname`,
    );
    expect(indexes.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        'uq_blog_posts_slug',
        'idx_blog_posts_status_published',
        'idx_blog_posts_scheduled',
      ]),
    );
    // Database-level guards hold after the round trip.
    await expect(
      AppDataSource.query(
        `INSERT INTO blog_posts (slug, title, status) VALUES ('Bad Slug', 't', 'draft')`,
      ),
    ).rejects.toThrow(/chk_blog_posts_slug/);
    await expect(
      AppDataSource.query(
        `INSERT INTO blog_posts (slug, title, status) VALUES ('ok-slug', 't', 'published')`,
      ),
    ).rejects.toThrow(/chk_blog_posts_published_has_date/);
  });
});
