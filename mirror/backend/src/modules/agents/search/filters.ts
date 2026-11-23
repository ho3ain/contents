import type { ListAgentsQueryDto } from '../dto/list-agents.dto';

/** Comma-separated multi-select → trimmed unique values (max 12). */
export function csv(value: string | undefined | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && part.length <= 80),
    ),
  ].slice(0, 12);
}

/** Facets that can be omitted when computing that facet's own counts. */
export type FacetKey =
  | 'category'
  | 'productType'
  | 'deliveryModel'
  | 'executionModel'
  | 'integration'
  | 'industry'
  | 'setupDifficulty'
  | 'requirement'
  | 'useCase';

/** The normalized filter set — parsed once, used by list + facets. */
export interface CatalogFilters {
  category: string[];
  productType: string[];
  deliveryModel: string[];
  executionModel: string[];
  integration: string[];
  industry: string[];
  setupDifficulty: string[];
  requirement: string[];
  useCase: string | null;
  free: boolean | null;
  minPrice: string | null;
  maxPrice: string | null;
  ratingMin: string | null;
  minReviews: number | null;
  popular: boolean;
  listingReviewed: boolean;
  verifiedCreator: boolean;
  clearDataPolicy: boolean;
  noSensitiveData: boolean;
  creator: string | null;
}

export function parseFilters(query: ListAgentsQueryDto): CatalogFilters {
  return {
    category: csv(query.category),
    productType: csv(query.productType),
    deliveryModel: csv(query.deliveryModel),
    executionModel: csv(query.executionModel),
    integration: csv(query.integration),
    industry: csv(query.industry),
    setupDifficulty: csv(query.setupDifficulty),
    requirement: csv(query.requirement),
    useCase: query.useCase?.trim() ? query.useCase.trim().slice(0, 120) : null,
    free: query.free === undefined ? null : query.free === 'true',
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
    ratingMin: query.ratingMin ?? null,
    minReviews:
      query.minReviews !== undefined
        ? Number.parseInt(query.minReviews, 10)
        : null,
    popular: query.popular === 'true',
    // `securityReviewed` and `verified` are historic transport names kept for
    // compatibility. Both mean the latest granted LISTING_REVIEWED record;
    // neither is a security certification claim.
    listingReviewed:
      query.securityReviewed === 'true' || query.verified === 'true',
    verifiedCreator: query.verifiedCreator === 'true',
    clearDataPolicy: query.clearDataPolicy === 'true',
    noSensitiveData: query.noSensitiveData === 'true',
    creator: query.creator?.trim() ? query.creator.trim() : null,
  };
}

/** How many filters are active (the UI badge on the mobile filter button). */
export function activeFilterCount(filters: CatalogFilters): number {
  return (
    filters.category.length +
    filters.productType.length +
    filters.deliveryModel.length +
    filters.executionModel.length +
    filters.integration.length +
    filters.industry.length +
    filters.setupDifficulty.length +
    filters.requirement.length +
    (filters.useCase ? 1 : 0) +
    (filters.free !== null ? 1 : 0) +
    (filters.minPrice !== null || filters.maxPrice !== null ? 1 : 0) +
    (filters.ratingMin !== null ? 1 : 0) +
    (filters.minReviews !== null ? 1 : 0) +
    Number(filters.popular) +
    Number(filters.listingReviewed) +
    Number(filters.verifiedCreator) +
    Number(filters.clearDataPolicy) +
    Number(filters.noSensitiveData) +
    (filters.creator ? 1 : 0)
  );
}
