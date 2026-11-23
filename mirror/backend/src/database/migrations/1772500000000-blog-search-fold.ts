import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Blog search — fold `blog_posts.search_text` (2026-10-14).
 *
 * Public and admin search now match on a canonical Persian form (Arabic
 * ي/ك → ی/ک, digits unified, ZWNJ and diacritics dropped, whitespace
 * collapsed; see `modules/blog/domain/blog-search.ts`). New renders store
 * the folded text; this back-fills every existing row with the SQL twin of
 * the same fold so old articles are found the same way. Idempotent (the fold
 * is a fixed point) and content-preserving: `body_markdown` / blocks are
 * untouched — only the derived search column changes.
 *
 * Rollback: `down()` re-derives nothing (the pre-fold text was lower-cased
 * title+excerpt+body, which a plain ILIKE still matches inside the folded
 * form for Latin and already-Persian spellings). Left as a no-op on purpose.
 *
 * The expression below is the literal output of
 * `foldSqlExpression('"search_text"')` at the time of writing — migrations
 * stay self-contained snapshots and never import application code.
 */
const FOLD_SQL =
  `btrim(regexp_replace(regexp_replace(translate(lower("search_text"), ` +
  `'يىكؤإأآةۀ۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', 'ییکواااهه01234567890123456789'), ` +
  `'[\\u064B-\\u0652\\u0670\\u0640\\u200C\\u200D\\uFEFF]', '', 'g'), '\\s+', ' ', 'g'))`;

export class BlogSearchFold1772500000000 implements MigrationInterface {
  name = 'BlogSearchFold1772500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "blog_posts" SET "search_text" = ${FOLD_SQL} WHERE "search_text" <> ''`,
    );
  }

  public async down(): Promise<void> {
    // Intentionally empty — see the class comment.
  }
}
