import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { slugifyProduct } from '../../common/utils/slug';
import { BlogCategory } from '../../database/entities/blog/blog-category.entity';
import { BlogTag } from '../../database/entities/blog/blog-tag.entity';
import { BlogPostTag } from '../../database/entities/blog/blog-post-links.entity';
import { BlogPost } from '../../database/entities/blog/blog-post.entity';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type {
  BlogCategoryInputDto,
  BlogTagInputDto,
  MergeBlogTagsDto,
  UpdateBlogCategoryDto,
} from './dto/blog-admin.dto';

export interface AdminBlogCategory {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  /** All posts (any status) whose primary category is this one. */
  postCount: number;
  publishedCount: number;
  updatedAt: string;
}

export interface AdminBlogTag {
  id: string;
  slug: string;
  name: string;
  postCount: number;
  publishedCount: number;
}

export interface PublicBlogCategory {
  slug: string;
  name: string;
  description: string | null;
  parentSlug: string | null;
  postCount: number;
}

export interface PublicBlogTag {
  slug: string;
  name: string;
  postCount: number;
}

/**
 * Blog platform — editorial categories and tags.
 *
 * Deliberately separate from the marketplace taxonomy service: a blog
 * category is a reader-intent grouping owned by the editorial team, and
 * must be creatable/renamable without touching product discovery.
 */
@Injectable()
export class BlogTaxonomyService {
  constructor(
    @InjectRepository(BlogCategory)
    private readonly categories: Repository<BlogCategory>,
    @InjectRepository(BlogTag)
    private readonly tags: Repository<BlogTag>,
    @InjectRepository(BlogPost)
    private readonly posts: Repository<BlogPost>,
    @InjectRepository(BlogPostTag)
    private readonly postTags: Repository<BlogPostTag>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // ---- categories ---------------------------------------------------------

  async listCategoriesAdmin(): Promise<AdminBlogCategory[]> {
    const rows = await this.categories.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const counts = await this.dataSource.query<
      Array<{ category_id: string; total: string; published: string }>
    >(
      `SELECT primary_category_id AS category_id,
              COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status = 'published')::text AS published
         FROM blog_posts
        WHERE primary_category_id IS NOT NULL
        GROUP BY primary_category_id`,
    );
    const byId = new Map(counts.map((c) => [c.category_id, c]));
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      nameEn: c.nameEn,
      description: c.description,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      postCount: Number(byId.get(c.id)?.total ?? 0),
      publishedCount: Number(byId.get(c.id)?.published ?? 0),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  /** Active categories with their PUBLISHED post count (public navigation). */
  async listCategoriesPublic(): Promise<PublicBlogCategory[]> {
    const rows = await this.dataSource.query<
      Array<{
        slug: string;
        name: string;
        description: string | null;
        parent_slug: string | null;
        post_count: string;
      }>
    >(
      `SELECT c.slug, c.name, c.description, p.slug AS parent_slug,
              (SELECT COUNT(*) FROM blog_posts bp
                WHERE bp.primary_category_id = c.id AND bp.status = 'published')::text AS post_count
         FROM blog_categories c
         LEFT JOIN blog_categories p ON p.id = c.parent_id
        WHERE c.is_active = true
        ORDER BY c.sort_order ASC, c.name ASC`,
    );
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      parentSlug: r.parent_slug,
      postCount: Number(r.post_count),
    }));
  }

  async findCategoryBySlugPublic(
    slug: string,
  ): Promise<PublicBlogCategory | null> {
    const all = await this.listCategoriesPublic();
    return all.find((c) => c.slug === slug) ?? null;
  }

  async createCategory(
    dto: BlogCategoryInputDto,
    actorId: string,
  ): Promise<AdminBlogCategory> {
    const slug = await this.resolveSlug(
      dto.slug,
      dto.name,
      (s) => this.categoryExists(s),
      'category',
    );
    if (dto.parentId) await this.assertParent(dto.parentId, null);
    await this.assertUniqueCategoryName(dto.name, null);
    const created = await this.categories.save(
      this.categories.create({
        slug,
        name: dto.name,
        nameEn: dto.nameEn ?? null,
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_TAXONOMY_CHANGED,
      entity: AUDIT_ENTITIES.BLOG_CATEGORY,
      entityId: created.id,
      metadata: { op: 'create', slug },
      context: { actorId },
    });
    return this.categoryRow(created.id);
  }

  async updateCategory(
    id: string,
    dto: UpdateBlogCategoryDto,
    actorId: string,
  ): Promise<AdminBlogCategory> {
    const cat = await this.categories.findOne({ where: { id } });
    if (!cat) throw notFound('Blog category not found');
    if (dto.slug && dto.slug !== cat.slug) {
      if (await this.categoryExists(dto.slug))
        throw conflict(`slug "${dto.slug}" is already used`);
      cat.slug = dto.slug;
    }
    if (dto.name !== undefined && dto.name !== cat.name) {
      await this.assertUniqueCategoryName(dto.name, id);
      cat.name = dto.name;
    }
    if (dto.parentId !== undefined) {
      if (dto.parentId) await this.assertParent(dto.parentId, id);
      cat.parentId = dto.parentId;
    }
    if (dto.nameEn !== undefined) cat.nameEn = dto.nameEn;
    if (dto.description !== undefined) cat.description = dto.description;
    if (dto.sortOrder !== undefined) cat.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) cat.isActive = dto.isActive;
    await this.categories.save(cat);
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_TAXONOMY_CHANGED,
      entity: AUDIT_ENTITIES.BLOG_CATEGORY,
      entityId: id,
      metadata: { op: 'update', fields: Object.keys(dto) },
      context: { actorId },
    });
    return this.categoryRow(id);
  }

  /**
   * Deletes a category. Posts are reassigned first (to `reassignToId` or to
   * "no category"); children become top-level. Refuses when the target does
   * not exist or is the category itself.
   */
  async deleteCategory(
    id: string,
    reassignToId: string | null | undefined,
    actorId: string,
  ): Promise<{ reassigned: number }> {
    const cat = await this.categories.findOne({ where: { id } });
    if (!cat) throw notFound('Blog category not found');
    if (reassignToId) {
      if (reassignToId === id)
        throw invalid('reassignToId must differ from the deleted category');
      const target = await this.categories.findOne({
        where: { id: reassignToId },
      });
      if (!target) throw invalid('reassignToId does not exist');
    }
    let reassigned = 0;
    await this.dataSource.transaction(async (em) => {
      const res = await em
        .createQueryBuilder()
        .update(BlogPost)
        .set({ primaryCategoryId: reassignToId ?? null })
        .where('primary_category_id = :id', { id })
        .execute();
      reassigned = res.affected ?? 0;
      await em
        .createQueryBuilder()
        .update(BlogCategory)
        .set({ parentId: cat.parentId })
        .where('parent_id = :id', { id })
        .execute();
      await em.delete(BlogCategory, { id });
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_TAXONOMY_CHANGED,
      entity: AUDIT_ENTITIES.BLOG_CATEGORY,
      entityId: id,
      metadata: {
        op: 'delete',
        slug: cat.slug,
        reassignedTo: reassignToId ?? null,
        reassigned,
      },
      context: { actorId },
    });
    return { reassigned };
  }

  // ---- tags ---------------------------------------------------------------

  async listTagsAdmin(): Promise<AdminBlogTag[]> {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        slug: string;
        name: string;
        total: string;
        published: string;
      }>
    >(
      `SELECT t.id, t.slug, t.name,
              COUNT(pt.post_id)::text AS total,
              COUNT(pt.post_id) FILTER (WHERE bp.status = 'published')::text AS published
         FROM blog_tags t
         LEFT JOIN blog_post_tags pt ON pt.tag_id = t.id
         LEFT JOIN blog_posts bp ON bp.id = pt.post_id
        GROUP BY t.id
        ORDER BY t.name ASC`,
    );
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      postCount: Number(r.total),
      publishedCount: Number(r.published),
    }));
  }

  /** Tags with at least one PUBLISHED post. */
  async listTagsPublic(): Promise<PublicBlogTag[]> {
    const rows = await this.dataSource.query<
      Array<{ slug: string; name: string; post_count: string }>
    >(
      `SELECT t.slug, t.name, COUNT(bp.id)::text AS post_count
         FROM blog_tags t
         JOIN blog_post_tags pt ON pt.tag_id = t.id
         JOIN blog_posts bp ON bp.id = pt.post_id AND bp.status = 'published'
        GROUP BY t.id
       HAVING COUNT(bp.id) > 0
        ORDER BY COUNT(bp.id) DESC, t.name ASC`,
    );
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      postCount: Number(r.post_count),
    }));
  }

  async findTagBySlug(slug: string): Promise<BlogTag | null> {
    return this.tags.findOne({ where: { slug } });
  }

  async createTag(
    dto: BlogTagInputDto,
    actorId: string,
  ): Promise<AdminBlogTag> {
    const slug = await this.resolveSlug(
      dto.slug,
      dto.name,
      (s) => this.tagExists(s),
      'tag',
    );
    const dup = await this.tags
      .createQueryBuilder('t')
      .where('lower(t.name) = lower(:name)', { name: dto.name })
      .getOne();
    if (dup)
      throw conflict(`a tag named "${dto.name}" already exists`, {
        id: dup.id,
      });
    const created = await this.tags.save(
      this.tags.create({ slug, name: dto.name }),
    );
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_TAXONOMY_CHANGED,
      entity: AUDIT_ENTITIES.BLOG_TAG,
      entityId: created.id,
      metadata: { op: 'create', slug },
      context: { actorId },
    });
    return this.tagRow(created.id);
  }

  async updateTag(
    id: string,
    dto: BlogTagInputDto,
    actorId: string,
  ): Promise<AdminBlogTag> {
    const tag = await this.tags.findOne({ where: { id } });
    if (!tag) throw notFound('Blog tag not found');
    if (dto.slug && dto.slug !== tag.slug) {
      if (await this.tagExists(dto.slug))
        throw conflict(`slug "${dto.slug}" is already used`);
      tag.slug = dto.slug;
    }
    if (dto.name !== tag.name) {
      const dup = await this.tags
        .createQueryBuilder('t')
        .where('lower(t.name) = lower(:name) AND t.id <> :id', {
          name: dto.name,
          id,
        })
        .getOne();
      if (dup)
        throw conflict(`a tag named "${dto.name}" already exists`, {
          id: dup.id,
        });
      tag.name = dto.name;
    }
    await this.tags.save(tag);
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_TAXONOMY_CHANGED,
      entity: AUDIT_ENTITIES.BLOG_TAG,
      entityId: id,
      metadata: { op: 'update' },
      context: { actorId },
    });
    return this.tagRow(id);
  }

  async deleteTag(id: string, actorId: string): Promise<void> {
    const tag = await this.tags.findOne({ where: { id } });
    if (!tag) throw notFound('Blog tag not found');
    await this.tags.delete({ id }); // post links cascade
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_TAXONOMY_CHANGED,
      entity: AUDIT_ENTITIES.BLOG_TAG,
      entityId: id,
      metadata: { op: 'delete', slug: tag.slug },
      context: { actorId },
    });
  }

  /** Moves every post of the source tags to the target, then removes the sources. */
  async mergeTags(
    dto: MergeBlogTagsDto,
    actorId: string,
  ): Promise<AdminBlogTag> {
    const sources = dto.sourceIds.filter((s) => s !== dto.targetId);
    if (!sources.length)
      throw invalid(
        'sourceIds must contain at least one tag other than the target',
      );
    const target = await this.tags.findOne({ where: { id: dto.targetId } });
    if (!target) throw notFound('target tag not found');
    const found = await this.tags.find({ where: { id: In(sources) } });
    if (found.length !== sources.length)
      throw notFound('one of the source tags does not exist');
    await this.dataSource.transaction(async (em) => {
      await em.query(
        `INSERT INTO blog_post_tags (post_id, tag_id)
           SELECT DISTINCT post_id, $1::uuid FROM blog_post_tags WHERE tag_id = ANY($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [dto.targetId, sources],
      );
      await em.delete(BlogTag, { id: In(sources) });
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.BLOG_TAXONOMY_CHANGED,
      entity: AUDIT_ENTITIES.BLOG_TAG,
      entityId: dto.targetId,
      metadata: { op: 'merge', sources: found.map((t) => t.slug) },
      context: { actorId },
    });
    return this.tagRow(dto.targetId);
  }

  // ---- helpers ------------------------------------------------------------

  private async categoryRow(id: string): Promise<AdminBlogCategory> {
    const row = (await this.listCategoriesAdmin()).find((c) => c.id === id);
    if (!row) throw notFound('Blog category not found');
    return row;
  }

  private async tagRow(id: string): Promise<AdminBlogTag> {
    const row = (await this.listTagsAdmin()).find((t) => t.id === id);
    if (!row) throw notFound('Blog tag not found');
    return row;
  }

  private categoryExists(slug: string): Promise<boolean> {
    return this.categories.exists({ where: { slug } });
  }

  private tagExists(slug: string): Promise<boolean> {
    return this.tags.exists({ where: { slug } });
  }

  private async assertUniqueCategoryName(
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const qb = this.categories
      .createQueryBuilder('c')
      .where('lower(c.name) = lower(:name)', { name });
    if (exceptId) qb.andWhere('c.id <> :exceptId', { exceptId });
    const dup = await qb.getOne();
    if (dup)
      throw conflict(`a category named "${name}" already exists`, {
        id: dup.id,
      });
  }

  /** Parent must exist, be top-level (max depth 2) and not be the row itself. */
  private async assertParent(
    parentId: string,
    selfId: string | null,
  ): Promise<void> {
    if (selfId && parentId === selfId)
      throw invalid('a category cannot be its own parent');
    const parent = await this.categories.findOne({ where: { id: parentId } });
    if (!parent) throw invalid('parentId does not exist');
    if (parent.parentId)
      throw invalid('categories nest at most one level deep');
    if (selfId) {
      const hasChildren = await this.categories.exists({
        where: { parentId: selfId },
      });
      if (hasChildren)
        throw invalid(
          'a category with subcategories cannot become a subcategory',
        );
    }
  }

  private async resolveSlug(
    requested: string | undefined,
    name: string,
    exists: (slug: string) => Promise<boolean>,
    kind: 'category' | 'tag',
  ): Promise<string> {
    if (requested) {
      if (await exists(requested))
        throw conflict(`slug "${requested}" is already used`);
      return requested;
    }
    const base = slugifyProduct(name) || kind;
    let candidate = base;
    let n = 2;
    while (await exists(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    return candidate;
  }
}

export function notFound(message: string): ApiException {
  return new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
}
export function conflict(
  message: string,
  details?: Record<string, unknown>,
): ApiException {
  return new ApiException('CONFLICT', message, HttpStatus.CONFLICT, details);
}
export function invalid(
  message: string,
  details?: Record<string, unknown>,
): ApiException {
  return new ApiException(
    'VALIDATION_ERROR',
    message,
    HttpStatus.BAD_REQUEST,
    details,
  );
}
