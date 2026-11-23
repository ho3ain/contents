import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Taxonomy v2 — hardening (2026-10-12): bilingual search document.
 *
 * Problem found in the release-readiness review: the indexed search document
 * of an agent (`search_vector` / `search_text`, M2) only contained the ENGLISH
 * category name + slug. A buyer typing «فروشگاه اینترنتی» (ecommerce-retail
 * industry alias) or «استارتاپ» found nothing even though products were
 * linked to that industry, and the Persian category names / aliases curated
 * by the taxonomy admin were ignored by search.
 *
 * This corrective migration (executed migrations are never edited) replaces
 * the two document functions so that:
 *   - categories contribute name + slug + name_fa + ALL aliases (weight B,
 *     as before — category aliases are short, curated, bilingual);
 *   - industries contribute name + slug + name_fa + PERSIAN aliases only
 *     (weight C — business context is a weaker signal than capability, and
 *     the long English alias lists are import mappings such as "AI", "Data",
 *     "Analytics" that would over-match);
 *   - `search_text` (prefix / trigram typo tolerance) gets the same Persian
 *     taxonomy words.
 * Triggers keep the document fresh when industry links or the taxonomy rows
 * themselves (name_fa / aliases) change. Finally every agent row is
 * re-indexed once (single UPDATE; ~ms per 1k rows — run off-peak on large
 * catalogs, it takes a row lock per agent while it runs).
 *
 * down(): restores the exact 1762000000000 function bodies, drops only the
 * triggers added here and re-indexes. No data (links, ids, slugs) is touched
 * in either direction.
 */
export class TaxonomySearchDocument1772100000000 implements MigrationInterface {
  name = 'TaxonomySearchDocument1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mesh_taxonomy_search_text(p_agent uuid) RETURNS text AS $$
        SELECT concat_ws(' ',
          (SELECT string_agg(concat_ws(' ', c.name, replace(c.slug, '-', ' '), c.name_fa,
                                       mesh_jsonb_texts(c.aliases)), ' ')
             FROM agent_categories ac JOIN categories c ON c.id = ac.category_id
            WHERE ac.agent_id = p_agent),
          (SELECT string_agg(concat_ws(' ', i.name, replace(i.slug, '-', ' '), i.name_fa,
                   (SELECT string_agg(t, ' ') FROM jsonb_array_elements_text(i.aliases) t
                     WHERE t ~ '[\\u0600-\\u06FF]')), ' ')
             FROM agent_industries ai JOIN industries i ON i.id = ai.industry_id
            WHERE ai.agent_id = p_agent))
      $$ LANGUAGE sql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mesh_agent_search_text(a agents) RETURNS text AS $$
      BEGIN
        RETURN left(mesh_normalize_text(
          coalesce(a.name, '') || ' ' || mesh_jsonb_texts(a.keywords) || ' ' ||
          mesh_jsonb_texts(a.capabilities, 'title') || ' ' ||
          mesh_jsonb_texts(a.use_cases) || ' ' || coalesce(mesh_taxonomy_search_text(a.id), '')), 2000);
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mesh_agent_search_vector(a agents) RETURNS tsvector AS $$
      DECLARE
        categories_text text := '';
        industries_text text := '';
        integrations_text text := '';
        creator_text text := '';
        type_text text := '';
      BEGIN
        SELECT COALESCE(string_agg(concat_ws(' ', c.name, replace(c.slug, '-', ' '), c.name_fa,
                                             mesh_jsonb_texts(c.aliases)), ' '), '')
          INTO categories_text
          FROM agent_categories ac JOIN categories c ON c.id = ac.category_id
         WHERE ac.agent_id = a.id;
        SELECT COALESCE(string_agg(concat_ws(' ', i.name, replace(i.slug, '-', ' '), i.name_fa,
                 (SELECT string_agg(t, ' ') FROM jsonb_array_elements_text(i.aliases) t
                   WHERE t ~ '[\\u0600-\\u06FF]')), ' '), '')
          INTO industries_text
          FROM agent_industries ai JOIN industries i ON i.id = ai.industry_id
         WHERE ai.agent_id = a.id;
        SELECT COALESCE(string_agg(i.name || ' ' || replace(i.slug, '-', ' '), ' '), '')
          INTO integrations_text
          FROM agent_integrations ai JOIN integrations i ON i.id = ai.integration_id
         WHERE ai.agent_id = a.id;
        SELECT concat_ws(' ', cp.display_name, mesh_jsonb_texts(cp.expertise))
          INTO creator_text
          FROM creator_profiles cp WHERE cp.id = a.creator_id;
        type_text := concat_ws(' ', replace(coalesce(a.product_type, ''), '_', ' '),
                               coalesce(a.build_tool, ''));
        RETURN
          setweight(to_tsvector('simple', mesh_normalize_text(
            coalesce(a.name, '') || ' ' || mesh_jsonb_texts(a.keywords))), 'A') ||
          setweight(to_tsvector('simple', mesh_normalize_text(
            mesh_jsonb_texts(a.capabilities, 'title') || ' ' ||
            mesh_jsonb_texts(a.use_cases) || ' ' || categories_text || ' ' ||
            integrations_text || ' ' || type_text)), 'B') ||
          setweight(to_tsvector('simple', mesh_normalize_text(
            coalesce(a.short_description, '') || ' ' || coalesce(a.problem_statement, '') || ' ' ||
            mesh_jsonb_texts(a.best_for) || ' ' || mesh_jsonb_texts(a.target_audience) || ' ' ||
            mesh_jsonb_texts(a.inputs) || ' ' || mesh_jsonb_texts(a.outputs) || ' ' ||
            mesh_jsonb_texts(a.how_it_works) || ' ' || industries_text)), 'C') ||
          setweight(to_tsvector('simple', mesh_normalize_text(
            coalesce(a.full_description, '') || ' ' ||
            mesh_jsonb_texts(a.capabilities, 'description') || ' ' ||
            mesh_jsonb_texts(a.limitations) || ' ' || creator_text)), 'D');
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    // Keep the document fresh: industry links + taxonomy row edits.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_agent_industries_search ON agent_industries;
      CREATE TRIGGER trg_agent_industries_search
        AFTER INSERT OR DELETE OR UPDATE ON agent_industries
        FOR EACH ROW EXECUTE FUNCTION mesh_trg_agent_child_search();
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mesh_trg_industry_search() RETURNS trigger AS $$
      BEGIN
        PERFORM mesh_refresh_agent_search(ai.agent_id)
          FROM agent_industries ai WHERE ai.industry_id = NEW.id;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS trg_industries_search ON industries;
      CREATE TRIGGER trg_industries_search
        AFTER UPDATE OF name, name_fa, slug, aliases ON industries
        FOR EACH ROW EXECUTE FUNCTION mesh_trg_industry_search();
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_categories_search ON categories;
      CREATE TRIGGER trg_categories_search
        AFTER UPDATE OF name, name_fa, slug, aliases ON categories
        FOR EACH ROW EXECUTE FUNCTION mesh_trg_category_search();
    `);

    await this.reindex(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_industries_search ON industries;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS mesh_trg_industry_search();`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_agent_industries_search ON agent_industries;`,
    );
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_categories_search ON categories;
      CREATE TRIGGER trg_categories_search
        AFTER UPDATE OF name, slug ON categories
        FOR EACH ROW EXECUTE FUNCTION mesh_trg_category_search();
    `);

    // Exact bodies from 1762000000000-buyer-discovery.ts
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mesh_agent_search_text(a agents) RETURNS text AS $$
      DECLARE
        categories_text text := '';
      BEGIN
        SELECT COALESCE(string_agg(c.name || ' ' || replace(c.slug, '-', ' '), ' '), '')
          INTO categories_text
          FROM agent_categories ac JOIN categories c ON c.id = ac.category_id
         WHERE ac.agent_id = a.id;
        RETURN left(mesh_normalize_text(
          coalesce(a.name, '') || ' ' || mesh_jsonb_texts(a.keywords) || ' ' ||
          mesh_jsonb_texts(a.capabilities, 'title') || ' ' ||
          mesh_jsonb_texts(a.use_cases) || ' ' || categories_text), 2000);
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mesh_agent_search_vector(a agents) RETURNS tsvector AS $$
      DECLARE
        categories_text text := '';
        integrations_text text := '';
        creator_text text := '';
        type_text text := '';
      BEGIN
        SELECT COALESCE(string_agg(c.name || ' ' || replace(c.slug, '-', ' '), ' '), '')
          INTO categories_text
          FROM agent_categories ac JOIN categories c ON c.id = ac.category_id
         WHERE ac.agent_id = a.id;
        SELECT COALESCE(string_agg(i.name || ' ' || replace(i.slug, '-', ' '), ' '), '')
          INTO integrations_text
          FROM agent_integrations ai JOIN integrations i ON i.id = ai.integration_id
         WHERE ai.agent_id = a.id;
        SELECT concat_ws(' ', cp.display_name, mesh_jsonb_texts(cp.expertise))
          INTO creator_text
          FROM creator_profiles cp WHERE cp.id = a.creator_id;
        type_text := concat_ws(' ', replace(coalesce(a.product_type, ''), '_', ' '),
                               coalesce(a.build_tool, ''));
        RETURN
          setweight(to_tsvector('simple', mesh_normalize_text(
            coalesce(a.name, '') || ' ' || mesh_jsonb_texts(a.keywords))), 'A') ||
          setweight(to_tsvector('simple', mesh_normalize_text(
            mesh_jsonb_texts(a.capabilities, 'title') || ' ' ||
            mesh_jsonb_texts(a.use_cases) || ' ' || categories_text || ' ' ||
            integrations_text || ' ' || type_text)), 'B') ||
          setweight(to_tsvector('simple', mesh_normalize_text(
            coalesce(a.short_description, '') || ' ' || coalesce(a.problem_statement, '') || ' ' ||
            mesh_jsonb_texts(a.best_for) || ' ' || mesh_jsonb_texts(a.target_audience) || ' ' ||
            mesh_jsonb_texts(a.inputs) || ' ' || mesh_jsonb_texts(a.outputs) || ' ' ||
            mesh_jsonb_texts(a.how_it_works))), 'C') ||
          setweight(to_tsvector('simple', mesh_normalize_text(
            coalesce(a.full_description, '') || ' ' ||
            mesh_jsonb_texts(a.capabilities, 'description') || ' ' ||
            mesh_jsonb_texts(a.limitations) || ' ' || creator_text)), 'D');
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS mesh_taxonomy_search_text(uuid);`,
    );

    await this.reindex(queryRunner);
  }

  private async reindex(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE agents a
         SET search_vector = mesh_agent_search_vector(a),
             search_text = mesh_agent_search_text(a)
    `);
  }
}
