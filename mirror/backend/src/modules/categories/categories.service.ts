import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Category,
  CategoryStatus,
} from '../../database/entities/catalog/category.entity';
import { AgentCategory } from '../../database/entities/agents/agent-category.entity';
import { AgentStatus } from '../../database/entities/agents/agent.entity';

/**
 * Public category view (Taxonomy v2). `slug` is the stable id; `nameFa` /
 * `descriptionFa` are display-only. `agentCount` of a parent INCLUDES its
 * subcategories (a product tagged "programming-agents" is also a
 * "developer-tools" product); `directAgentCount` is the category's own count.
 */
export interface CategoryWithCount {
  id: string;
  name: string;
  nameFa: string | null;
  slug: string;
  description: string | null;
  descriptionFa: string | null;
  parentId: string | null;
  parentSlug: string | null;
  aliases: string[];
  sortOrder: number;
  agentCount: number;
  directAgentCount: number;
}

/** Walks the (max depth 2) tree and returns the slug plus every child slug. */
export function expandCategorySlugs(
  slugs: string[],
  categories: Array<{ slug: string; parentSlug: string | null }>,
): string[] {
  const wanted = new Set(slugs);
  for (const category of categories) {
    if (category.parentSlug && wanted.has(category.parentSlug)) {
      wanted.add(category.slug);
    }
  }
  return [...wanted];
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(AgentCategory)
    private readonly agentCategoriesRepository: Repository<AgentCategory>,
  ) {}

  /**
   * Active categories (parents and subcategories) with published-agent
   * counts. A subcategory whose parent is inactive is hidden as well, so the
   * public tree is always consistent.
   */
  async listActive(): Promise<CategoryWithCount[]> {
    const categories = await this.categoriesRepository.find({
      where: { status: CategoryStatus.ACTIVE },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const byId = new Map(categories.map((category) => [category.id, category]));
    const visible = categories.filter(
      (category) => !category.parentId || byId.has(category.parentId),
    );

    const counts = await this.agentCategoriesRepository
      .createQueryBuilder('ac')
      .innerJoin(
        'agents',
        'agent',
        'agent.id = ac.agent_id AND agent.status = :status',
        {
          status: AgentStatus.PUBLISHED,
        },
      )
      .select('ac.category_id', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ac.category_id')
      .getRawMany<{ categoryId: string; count: string }>();

    const direct = new Map(
      counts.map((row) => [row.categoryId, Number(row.count)]),
    );
    const rolled = new Map<string, number>();
    for (const category of visible) {
      const own = direct.get(category.id) ?? 0;
      rolled.set(category.id, (rolled.get(category.id) ?? 0) + own);
      if (category.parentId) {
        rolled.set(
          category.parentId,
          (rolled.get(category.parentId) ?? 0) + own,
        );
      }
    }

    return visible.map((category) => ({
      id: category.id,
      name: category.name,
      nameFa: category.nameFa,
      slug: category.slug,
      description: category.description,
      descriptionFa: category.descriptionFa,
      parentId: category.parentId,
      parentSlug: category.parentId
        ? (byId.get(category.parentId)?.slug ?? null)
        : null,
      aliases: category.aliases ?? [],
      sortOrder: category.sortOrder,
      agentCount: rolled.get(category.id) ?? 0,
      directAgentCount: direct.get(category.id) ?? 0,
    }));
  }
}
