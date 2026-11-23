/**
 * Phase C1 — Dynamic segments (spec §9).
 *
 * "در صورت امکن Segmentها را بر اساس شرایط بساز" — a segment is a stored
 * rule document, NOT a saved id list, so it keeps answering the question as
 * the data changes. Segments are evaluated in SQL by `crm-segments.service`
 * (index-friendly) using the predicate builders below.
 *
 * The rule shape is a small, closed grammar so a stored document can never
 * contain arbitrary SQL:
 *
 *   { "op": "and", "rules": [ <rule>, … ] }   |  { "op": "or", … }
 *   <rule> = { "field": <SegmentField>, "operator": <SegmentOperator>, "value": … }
 *
 * Anything outside the grammar is rejected at write time with a 400.
 */

import { CRM_STAGES, type CrmStage } from './funnel';

/**
 * Everything up to but not including `qualified`. Derived from the stage list
 * so that adding a stage to the funnel cannot silently leave this preset
 * counting a different population than its description claims.
 */
const NEW_LEAD_STAGES = CRM_STAGES.filter(
  (stage) => stage !== 'qualified',
) as CrmStage[];
import { CRM_SOURCES, type CrmSource } from './taxonomy';
import { SCORING_CONFIG } from './scoring';

// ---------------------------------------------------------------------------
// The closed field set — each field maps to exactly one indexed column or
// one measured projection, so a segment stays cheap to evaluate.
// ---------------------------------------------------------------------------

export const SEGMENT_FIELDS = [
  'stage',
  'source',
  'score',
  'ownerId',
  'activity',
  'productStatus',
  'hasProduct',
  'hasPublishedProduct',
  'hasSale',
  'isRegistered',
  'tag',
  'hasNextAction',
  'nextActionOverdue',
  'revenue',
  'lastActivityDays',
  'hasAttribution',
] as const;
export type SegmentField = (typeof SEGMENT_FIELDS)[number];

export function isSegmentField(value: unknown): value is SegmentField {
  return (
    typeof value === 'string' &&
    (SEGMENT_FIELDS as readonly string[]).includes(value)
  );
}

export const SEGMENT_OPERATORS = [
  'eq',
  'neq',
  'in',
  'not_in',
  'gte',
  'lte',
  'gt',
  'lt',
  'contains',
  'not_contains',
  'exists',
  'not_exists',
] as const;
export type SegmentOperator = (typeof SEGMENT_OPERATORS)[number];

export function isSegmentOperator(value: unknown): value is SegmentOperator {
  return (
    typeof value === 'string' &&
    (SEGMENT_OPERATORS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export interface SegmentRule {
  field: SegmentField;
  operator: SegmentOperator;
  /** Scalar for eq/neq/gte/…, array for in/not_in/contains. */
  value?: string | number | boolean | Array<string | number>;
}

export interface SegmentGroup {
  op: 'and' | 'or';
  rules: Array<SegmentRule | SegmentGroup>;
}

export type SegmentDocument = SegmentGroup;

const MAX_DEPTH = 4;
const MAX_RULES = 20;

export interface SegmentValidationError {
  path: string;
  message: string;
}

/**
 * Validates a stored/POSTed document. Called by the DTO validator and by the
 * unit tests, so an invalid grammar can never reach the database.
 */
export function validateSegmentDocument(
  document: unknown,
  depth = 0,
  counter = { count: 0 },
): SegmentValidationError[] {
  const errors: SegmentValidationError[] = [];
  if (depth > MAX_DEPTH) {
    return [
      { path: 'rules', message: `segment nested deeper than ${MAX_DEPTH}` },
    ];
  }
  if (typeof document !== 'object' || document === null) {
    return [{ path: 'rules', message: 'rule must be an object' }];
  }
  const node = document as Partial<SegmentGroup>;
  if (node.op !== 'and' && node.op !== 'or') {
    errors.push({ path: 'op', message: "op must be 'and' or 'or'" });
  }
  if (!Array.isArray(node.rules) || node.rules.length === 0) {
    errors.push({ path: 'rules', message: 'rules must be a non-empty array' });
    return errors;
  }
  node.rules.forEach((rule, index) => {
    const path = `rules[${index}]`;
    counter.count += 1;
    if (counter.count > MAX_RULES) {
      errors.push({
        path,
        message: `segment is limited to ${MAX_RULES} rules`,
      });
      return;
    }
    if (typeof rule === 'object' && rule !== null && 'rules' in rule) {
      errors.push(...validateSegmentDocument(rule, depth + 1, counter));
      return;
    }
    const candidate = rule as Partial<SegmentRule>;
    if (!isSegmentField(candidate.field)) {
      errors.push({ path: `${path}.field`, message: 'unknown segment field' });
    }
    if (!isSegmentOperator(candidate.operator)) {
      errors.push({
        path: `${path}.operator`,
        message: 'unknown segment operator',
      });
      return;
    }
    const needsValue = !['exists', 'not_exists'].includes(candidate.operator);
    if (needsValue && candidate.value === undefined) {
      errors.push({
        path: `${path}.value`,
        message: 'operator requires a value',
      });
    }
  });
  return errors;
}

// ---------------------------------------------------------------------------
// In-memory evaluation — used by the unit tests and by the "preview count"
// the admin sees while building a segment (it evaluates the SAME document
// the SQL builder consumes, so preview and result can never disagree).
// ---------------------------------------------------------------------------

export interface SegmentSubject {
  stage: CrmStage;
  source: CrmSource | null;
  score: number;
  ownerId: string | null;
  activity: 'active' | 'inactive' | 'dormant' | 'unknown';
  productStatus: string | null;
  hasProduct: boolean;
  hasPublishedProduct: boolean;
  hasSale: boolean;
  isRegistered: boolean;
  tags: string[];
  hasNextAction: boolean;
  nextActionOverdue: boolean;
  revenue: number;
  lastActivityDays: number | null;
  hasAttribution: boolean;
}

function fieldValue(subject: SegmentSubject, field: SegmentField): unknown {
  switch (field) {
    case 'stage':
      return subject.stage;
    case 'source':
      return subject.source;
    case 'score':
      return subject.score;
    case 'ownerId':
      return subject.ownerId;
    case 'activity':
      return subject.activity;
    case 'productStatus':
      return subject.productStatus;
    case 'hasProduct':
      return subject.hasProduct;
    case 'hasPublishedProduct':
      return subject.hasPublishedProduct;
    case 'hasSale':
      return subject.hasSale;
    case 'isRegistered':
      return subject.isRegistered;
    case 'tag':
      return subject.tags;
    case 'hasNextAction':
      return subject.hasNextAction;
    case 'nextActionOverdue':
      return subject.nextActionOverdue;
    case 'revenue':
      return subject.revenue;
    case 'lastActivityDays':
      return subject.lastActivityDays;
    case 'hasAttribution':
      return subject.hasAttribution;
    default:
      return null;
  }
}

function matchOne(subject: SegmentSubject, rule: SegmentRule): boolean {
  const actual = fieldValue(subject, rule.field);
  const expected = rule.value;
  switch (rule.operator) {
    case 'eq':
      return Array.isArray(actual)
        ? actual.includes(String(expected))
        : String(actual) === String(expected);
    case 'neq':
      return Array.isArray(actual)
        ? !actual.includes(String(expected))
        : String(actual) !== String(expected);
    case 'in':
      return (
        Array.isArray(expected) &&
        expected.some((item) => String(item) === String(actual))
      );
    case 'not_in':
      return (
        Array.isArray(expected) &&
        !expected.some((item) => String(item) === String(actual))
      );
    case 'gte':
      return (
        typeof actual === 'number' &&
        typeof expected === 'number' &&
        actual >= expected
      );
    case 'lte':
      return (
        typeof actual === 'number' &&
        typeof expected === 'number' &&
        actual <= expected
      );
    case 'gt':
      return (
        typeof actual === 'number' &&
        typeof expected === 'number' &&
        actual > expected
      );
    case 'lt':
      return (
        typeof actual === 'number' &&
        typeof expected === 'number' &&
        actual < expected
      );
    case 'contains':
      return Array.isArray(actual)
        ? actual.map((entry) => asText(entry)).includes(asText(expected))
        : asText(actual).includes(String(expected));
    case 'not_contains':
      return Array.isArray(actual)
        ? !actual.map((entry) => asText(entry)).includes(asText(expected))
        : !asText(actual).includes(String(expected));
    case 'exists':
      return actual !== null && actual !== undefined && actual !== '';
    case 'not_exists':
      return actual === null || actual === undefined || actual === '';
    default:
      return false;
  }
}

/** Text view of a segment field value; never `[object Object]`. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

export function evaluateSegment(
  document: SegmentDocument,
  subject: SegmentSubject,
): boolean {
  if (document.op === 'and') {
    return document.rules.every((rule) =>
      'rules' in rule
        ? evaluateSegment(rule, subject)
        : matchOne(subject, rule),
    );
  }
  return document.rules.some((rule) =>
    'rules' in rule ? evaluateSegment(rule, subject) : matchOne(subject, rule),
  );
}

// ---------------------------------------------------------------------------
// System segments (spec §9 examples + the saved views of spec §1).
// These are SEEDED, not hard-wired: the admin can edit or delete them.
// ---------------------------------------------------------------------------

export interface SystemSegmentSeed {
  slug: string;
  name: string;
  description: string;
  document: SegmentDocument;
}

export const SYSTEM_SEGMENTS: readonly SystemSegmentSeed[] = [
  {
    slug: 'high-potential-no-product',
    name: 'High potential, no product',
    description: 'Qualified by score but has not created a single product yet.',
    document: {
      op: 'and',
      rules: [
        { field: 'score', operator: 'gte', value: SCORING_CONFIG.bands.high },
        { field: 'hasProduct', operator: 'eq', value: false },
      ],
    },
  },
  {
    slug: 'published-no-first-sale',
    name: 'Published, no first sale',
    description: 'Live listings that have not earned a single paid sale.',
    document: {
      op: 'and',
      rules: [
        { field: 'hasPublishedProduct', operator: 'eq', value: true },
        { field: 'hasSale', operator: 'eq', value: false },
      ],
    },
  },
  {
    slug: 'inactive-high-score',
    name: 'Inactive, high score',
    description: 'Valuable creators who went quiet — reactivation candidates.',
    document: {
      op: 'and',
      rules: [
        { field: 'score', operator: 'gte', value: SCORING_CONFIG.bands.high },
        { field: 'activity', operator: 'in', value: ['inactive', 'dormant'] },
      ],
    },
  },
  {
    slug: 'needs-follow-up',
    name: 'Needs follow-up',
    description: 'An open or overdue next action is waiting on the team.',
    document: {
      op: 'or',
      rules: [
        { field: 'hasNextAction', operator: 'eq', value: true },
        { field: 'nextActionOverdue', operator: 'eq', value: true },
      ],
    },
  },
  {
    slug: 'new-leads',
    name: 'New leads',
    description: 'Captured but nobody has replied or been qualified yet.',
    document: {
      op: 'and',
      rules: [
        // Every rung up to and including "interested" — a lead in any of
        // these has been worked but has not crossed the qualification line.
        { field: 'stage', operator: 'in', value: NEW_LEAD_STAGES },
      ],
    },
  },
  {
    slug: 'no-product-yet',
    name: 'No product yet',
    description:
      'Registered or activated, but the first product never started.',
    document: {
      op: 'and',
      rules: [
        { field: 'hasProduct', operator: 'eq', value: false },
        { field: 'stage', operator: 'gte', value: 1 },
      ],
    },
  },
  {
    slug: 'first-sale-pending',
    name: 'First sale pending',
    description: 'Published and live, still waiting on the first transaction.',
    document: {
      op: 'and',
      rules: [
        { field: 'stage', operator: 'in', value: ['published', 'approved'] },
        { field: 'hasSale', operator: 'eq', value: false },
      ],
    },
  },
];

/** Every legal `stage` value a segment may compare against. */
export const SEGMENT_STAGE_VALUES = [...CRM_STAGES] as CrmStage[];

/** Every legal `source` value a segment may compare against. */
export const SEGMENT_SOURCE_VALUES = [...CRM_SOURCES] as CrmSource[];
