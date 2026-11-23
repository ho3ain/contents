import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { slugify } from '../../common/utils/slug';
import {
  Category,
  CategoryStatus,
} from '../../database/entities/catalog/category.entity';
import { Industry } from '../../database/entities/catalog/industry.entity';
import { AgentCategory } from '../../database/entities/agents/agent-category.entity';
import { AgentIndustry } from '../../database/entities/agents/agent-industry.entity';

export interface TaxonomyCategoryInput {
  name?: string;
  nameFa?: string | null;
  slug?: string;
  description?: string | null;
  descriptionFa?: string | null;
  aliases?: string[];
  parentId?: string | null;
  sortOrder?: number;
  status?: 'active' | 'inactive';
}

export interface TaxonomyIndustryInput {
  name?: string;
  nameFa?: string | null;
  slug?: string;
  descriptionFa?: string | null;
  aliases?: string[];
  sortOrder?: number;
  status?: 'active' | 'inactive';
}

export interface AdminCategoryRow extends Category {
  parentSlug: string | null;
  agentCount: number;
  childCount: number;
}

export interface AdminIndustryRow extends Industry {
  agentCount: number;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeAliases(aliases: string[] | undefined): string[] | undefined {
  if (aliases === undefined) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of aliases) {
    const alias = raw.trim().replace(/\s+/g, ' ');
    const key = alias.toLowerCase();
    if (alias.length === 0 || alias.length > 80 || seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
    if (out.length >= 40) break;
  }
  return out;
}

function conflict(message: string): ApiException {
  return new ApiException('CONFLICT', message, HttpStatus.CONFLICT);
}

function invalid(message: string): ApiException {
  return new ApiException('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST);
}

/**
 * Admin taxonomy management (Taxonomy v2). Rules enforced here, not in the UI:
 *  - slugs are URL-safe, unique, immutable once a product is linked;
 *  - the Persian name is unique among siblings (no duplicate concepts);
 *  - hierarchy depth ≤ 2 (a subcategory cannot have children or be a parent);
 *  - deactivation never deletes anything (products keep their links).
 */
@Injectable()
export class TaxonomyAdminService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(AgentCategory)
    private readonly agentCategoriesRepository: Repository<AgentCategory>,
    @InjectRepository(Industry)
    private readonly industriesRepository: Repository<Industry>,
    @InjectRepository(AgentIndustry)
    private readonly agentIndustriesRepository: Repository<AgentIndustry>,
  ) {}

  // ------------------------------------------------------------ categories

  async listCategories(): Promise<AdminCategoryRow[]> {
    const categories = await this.categoriesRepository.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));
    const counts = await this.agentCategoriesRepository
      .createQueryBuilder('ac')
      .select('ac.category_id', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ac.category_id')
      .getRawMany<{ categoryId: string; count: string }>();
    const countById = new Map(
      counts.map((r) => [r.categoryId, Number(r.count)]),
    );
    const children = new Map<string, number>();
    for (const category of categories) {
      if (category.parentId) {
        children.set(
          category.parentId,
          (children.get(category.parentId) ?? 0) + 1,
        );
      }
    }
    return categories.map((category) => ({
      ...category,
      parentSlug: category.parentId
        ? (byId.get(category.parentId)?.slug ?? null)
        : null,
      agentCount: countById.get(category.id) ?? 0,
      childCount: children.get(category.id) ?? 0,
    }));
  }

  /**
   * MESH is a Persian-first marketplace: an ACTIVE category/industry is
   * rendered to buyers, so it must carry a Persian display name. Inactive
   * (draft) rows may be created without one and activated once translated.
   */
  private assertPersianNameForActive(
    status: CategoryStatus,
    nameFa: string | null,
    kind: 'category' | 'industry',
  ): void {
    if (status === CategoryStatus.ACTIVE && !nameFa) {
      throw invalid(
        `nameFa is required for an active ${kind} (create it as inactive or provide the Persian name)`,
      );
    }
  }

  async createCategory(input: TaxonomyCategoryInput): Promise<Category> {
    const name = input.name?.trim();
    if (!name) throw invalid('name is required');
    const slug = (input.slug ?? slugify(name)).trim();
    if (!SLUG.test(slug)) throw invalid('slug must be URL-safe lowercase');
    if (await this.categoriesRepository.findOneBy({ slug })) {
      throw conflict('A category with this slug already exists');
    }
    const nameFa = input.nameFa?.trim() || null;
    const status = (input.status ?? 'active') as CategoryStatus;
    this.assertPersianNameForActive(status, nameFa, 'category');
    const parent = await this.resolveParent(input.parentId ?? null, null);
    await this.assertUniqueSiblingNames(name, nameFa, parent?.id ?? null, null);
    return this.categoriesRepository.save(
      this.categoriesRepository.create({
        name,
        slug,
        description: input.description ?? null,
        nameFa,
        descriptionFa: input.descriptionFa?.trim() || null,
        aliases: normalizeAliases(input.aliases) ?? [],
        parentId: parent?.id ?? null,
        sortOrder: input.sortOrder ?? 0,
        status,
      }),
    );
  }

  async updateCategory(
    id: string,
    input: TaxonomyCategoryInput,
  ): Promise<Category> {
    const category = await this.categoriesRepository.findOneBy({ id });
    if (!category) {
      throw new ApiException(
        'NOT_FOUND',
        'Category not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const linked = await this.agentCategoriesRepository.countBy({
      categoryId: id,
    });
    if (input.slug !== undefined && input.slug !== category.slug) {
      if (!SLUG.test(input.slug)) {
        throw invalid('slug must be URL-safe lowercase');
      }
      if (linked > 0) {
        throw conflict(
          'The slug of a category with linked products cannot change (URLs, follows and interests depend on it)',
        );
      }
      if (await this.categoriesRepository.findOneBy({ slug: input.slug })) {
        throw conflict('A category with this slug already exists');
      }
    }
    let parentId = category.parentId;
    if (input.parentId !== undefined) {
      const parent = await this.resolveParent(input.parentId, category);
      parentId = parent?.id ?? null;
    }
    const name = input.name?.trim() ?? category.name;
    const nameFa =
      input.nameFa !== undefined
        ? input.nameFa?.trim() || null
        : category.nameFa;
    await this.assertUniqueSiblingNames(name, nameFa, parentId, category.id);
    this.assertPersianNameForActive(
      (input.status ?? category.status) as CategoryStatus,
      nameFa,
      'category',
    );
    if (input.status === 'inactive') {
      const activeChildren = await this.categoriesRepository.countBy({
        parentId: category.id,
        status: CategoryStatus.ACTIVE,
      });
      if (activeChildren > 0) {
        throw conflict(
          'Deactivate or move the subcategories first (an inactive parent would hide them)',
        );
      }
    }
    await this.categoriesRepository.update(category.id, {
      name,
      slug: input.slug ?? category.slug,
      description:
        input.description !== undefined
          ? input.description
          : category.description,
      nameFa,
      descriptionFa:
        input.descriptionFa !== undefined
          ? input.descriptionFa?.trim() || null
          : category.descriptionFa,
      aliases: normalizeAliases(input.aliases) ?? category.aliases,
      parentId,
      sortOrder: input.sortOrder ?? category.sortOrder,
      status: (input.status ?? category.status) as CategoryStatus,
    });
    return this.categoriesRepository.findOneByOrFail({ id: category.id });
  }

  private async resolveParent(
    parentId: string | null,
    self: Category | null,
  ): Promise<Category | null> {
    if (!parentId) return null;
    if (self && parentId === self.id) {
      throw invalid('A category cannot be its own parent');
    }
    const parent = await this.categoriesRepository.findOneBy({ id: parentId });
    if (!parent) throw invalid('Parent category not found');
    if (parent.parentId) {
      throw invalid(
        'Only two levels are supported: the parent must be a top-level category',
      );
    }
    if (self) {
      const children = await this.categoriesRepository.countBy({
        parentId: self.id,
      });
      if (children > 0) {
        throw invalid(
          'A category that has subcategories cannot become a subcategory itself',
        );
      }
    }
    return parent;
  }

  private async assertUniqueSiblingNames(
    name: string,
    nameFa: string | null,
    parentId: string | null,
    selfId: string | null,
  ): Promise<void> {
    const siblings = await this.categoriesRepository
      .createQueryBuilder('c')
      .where(
        parentId ? 'c.parent_id = :parentId' : 'c.parent_id IS NULL',
        parentId ? { parentId } : {},
      )
      .getMany();
    for (const sibling of siblings) {
      if (sibling.id === selfId) continue;
      if (sibling.name.trim().toLowerCase() === name.toLowerCase()) {
        throw conflict(`A category named "${sibling.name}" already exists`);
      }
      if (nameFa && sibling.nameFa && sibling.nameFa.trim() === nameFa.trim()) {
        throw conflict(
          `A category with the Persian name "${sibling.nameFa}" already exists`,
        );
      }
    }
  }

  // ------------------------------------------------------------ industries

  async listIndustries(): Promise<AdminIndustryRow[]> {
    const industries = await this.industriesRepository.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const counts = await this.agentIndustriesRepository
      .createQueryBuilder('ai')
      .select('ai.industry_id', 'industryId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ai.industry_id')
      .getRawMany<{ industryId: string; count: string }>();
    const countById = new Map(
      counts.map((r) => [r.industryId, Number(r.count)]),
    );
    return industries.map((industry) => ({
      ...industry,
      agentCount: countById.get(industry.id) ?? 0,
    }));
  }

  async createIndustry(input: TaxonomyIndustryInput): Promise<Industry> {
    const name = input.name?.trim();
    if (!name) throw invalid('name is required');
    const slug = (input.slug ?? slugify(name)).trim();
    if (!SLUG.test(slug)) throw invalid('slug must be URL-safe lowercase');
    if (await this.industriesRepository.findOneBy({ slug })) {
      throw conflict('An industry with this slug already exists');
    }
    const nameFa = input.nameFa?.trim() || null;
    const status = (input.status ?? 'active') as CategoryStatus;
    this.assertPersianNameForActive(status, nameFa, 'industry');
    await this.assertUniqueIndustryNames(name, nameFa, null);
    return this.industriesRepository.save(
      this.industriesRepository.create({
        name,
        slug,
        nameFa,
        descriptionFa: input.descriptionFa?.trim() || null,
        aliases: normalizeAliases(input.aliases) ?? [],
        sortOrder: input.sortOrder ?? 0,
        status,
      }),
    );
  }

  async updateIndustry(
    id: string,
    input: TaxonomyIndustryInput,
  ): Promise<Industry> {
    const industry = await this.industriesRepository.findOneBy({ id });
    if (!industry) {
      throw new ApiException(
        'NOT_FOUND',
        'Industry not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (input.slug !== undefined && input.slug !== industry.slug) {
      if (!SLUG.test(input.slug)) {
        throw invalid('slug must be URL-safe lowercase');
      }
      const linked = await this.agentIndustriesRepository.countBy({
        industryId: id,
      });
      if (linked > 0) {
        throw conflict(
          'The slug of an industry with linked products cannot change',
        );
      }
      if (await this.industriesRepository.findOneBy({ slug: input.slug })) {
        throw conflict('An industry with this slug already exists');
      }
    }
    const name = input.name?.trim() ?? industry.name;
    const nameFa =
      input.nameFa !== undefined
        ? input.nameFa?.trim() || null
        : industry.nameFa;
    await this.assertUniqueIndustryNames(name, nameFa, industry.id);
    this.assertPersianNameForActive(
      (input.status ?? industry.status) as CategoryStatus,
      nameFa,
      'industry',
    );
    await this.industriesRepository.update(industry.id, {
      name,
      slug: input.slug ?? industry.slug,
      nameFa,
      descriptionFa:
        input.descriptionFa !== undefined
          ? input.descriptionFa?.trim() || null
          : industry.descriptionFa,
      aliases: normalizeAliases(input.aliases) ?? industry.aliases,
      sortOrder: input.sortOrder ?? industry.sortOrder,
      status: (input.status ?? industry.status) as CategoryStatus,
    });
    return this.industriesRepository.findOneByOrFail({ id: industry.id });
  }

  private async assertUniqueIndustryNames(
    name: string,
    nameFa: string | null,
    selfId: string | null,
  ): Promise<void> {
    const all = await this.industriesRepository.find();
    for (const industry of all) {
      if (industry.id === selfId) continue;
      if (industry.name.trim().toLowerCase() === name.toLowerCase()) {
        throw conflict(`An industry named "${industry.name}" already exists`);
      }
      if (
        nameFa &&
        industry.nameFa &&
        industry.nameFa.trim() === nameFa.trim()
      ) {
        throw conflict(
          `An industry with the Persian name "${industry.nameFa}" already exists`,
        );
      }
    }
  }
}
