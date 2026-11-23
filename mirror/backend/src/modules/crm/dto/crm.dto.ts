import { Type } from 'class-transformer';
import { Allow, IsUUID, type ValidationOptions } from 'class-validator';
import {
  IsDefined,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
  Validate,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CRM_STAGES } from '../domain/funnel';
import { CRM_SOURCES, CRM_CREATOR_TYPES } from '../domain/taxonomy';
import {
  CRM_ACTION_PRIORITIES,
  CRM_ACTION_STATUSES,
  CRM_ACTION_TYPES,
} from '../domain/taxonomy';
import {
  SEGMENT_FIELDS,
  SEGMENT_OPERATORS,
  validateSegmentDocument,
} from '../domain/segments';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A UUID that also accepts "null"/"" as "clear this reference". */
/** The list endpoint additionally accepts the literal '@me' sentinel. */
const UUID_OR_ME =
  /^@me$|^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_OR_EMPTY =
  /^$|^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Lead create / update
// ---------------------------------------------------------------------------

export class CreateLeadDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional()
  @Matches(/^\+?[0-9\s-]{6,32}$/, { message: 'phone must be 6-32 digits' })
  phone?: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'websiteUrl must be a valid URL' })
  @MaxLength(500)
  websiteUrl?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  socialLinks?: string[];
  @IsOptional() @IsIn(CRM_SOURCES) source?: string;
  @IsOptional() @IsString() @MaxLength(64) medium?: string;
  @IsOptional() @IsString() @MaxLength(120) campaign?: string;
  @IsOptional() @IsString() @MaxLength(120) content?: string;
  @IsOptional() @IsString() @MaxLength(120) term?: string;
  @IsOptional() @IsString() @MaxLength(500) landingPage?: string;
  @IsOptional() @IsString() @MaxLength(500) referrer?: string;
  @IsOptional()
  @IsIn(CRM_CREATOR_TYPES)
  creatorType?: string;
  @IsOptional() @Matches(UUID) ownerId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(48, { each: true })
  tags?: string[];
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional()
  @Matches(/^\+?[0-9\s-]{6,32}$/, { message: 'phone must be 6-32 digits' })
  phone?: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  websiteUrl?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  socialLinks?: string[];
  @IsOptional() @IsIn(CRM_SOURCES) source?: string;
  @IsOptional() @IsString() @MaxLength(64) medium?: string;
  @IsOptional() @IsString() @MaxLength(120) campaign?: string;
  @IsOptional() @IsString() @MaxLength(120) content?: string;
  @IsOptional() @IsString() @MaxLength(120) term?: string;
  @IsOptional() @IsString() @MaxLength(500) landingPage?: string;
  @IsOptional() @IsString() @MaxLength(500) referrer?: string;
  @IsOptional()
  @IsIn(CRM_CREATOR_TYPES)
  creatorType?: string;
  @IsOptional() @Matches(UUID_OR_EMPTY) ownerId?: string;
  /** '' / null clears the override. */
  @IsOptional() @IsIn([...CRM_STAGES, ''] as string[]) manualStage?: string;
  @IsOptional() @IsBoolean() qualified?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(48, { each: true })
  tags?: string[];
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export class CrmListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(CRM_STAGES) stage?: string;
  @IsOptional() @IsIn(CRM_SOURCES) source?: string;
  @IsOptional() @IsIn(['high', 'medium', 'low']) scoreBand?: string;
  /** A uuid, or the literal '@me' for "assigned to me" (the saved view). */
  @IsOptional() @Matches(UUID_OR_ME) ownerId?: string;
  @IsOptional()
  @IsIn(['active', 'inactive', 'dormant', 'unknown'])
  activity?: string;
  @IsOptional()
  @IsIn([
    'no_product',
    'draft',
    'submitted',
    'approved',
    'published',
    'has_sales',
  ])
  productStatus?: string;
  @IsOptional() @IsString() tags?: string;
  @IsOptional() @IsString() @MaxLength(64) segmentSlug?: string;
  @IsOptional() @IsIn(['yes', 'no']) resolved?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) hasNextAction?: boolean;
  @IsOptional()
  @IsIn(['created_at', 'last_activity', 'name', 'score', 'revenue', 'stage'])
  sort?: string;
}

// ---------------------------------------------------------------------------
// Notes / actions
// ---------------------------------------------------------------------------

export class CreateNoteDto {
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}

export class CreateActionDto {
  @IsIn(CRM_ACTION_TYPES) type!: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(40) dueDate?: string;
  @IsOptional() @Matches(UUID_OR_EMPTY) assignedToId?: string;
  @IsOptional()
  @IsIn(CRM_ACTION_PRIORITIES)
  priority?: string;
}

export class UpdateActionDto {
  @IsOptional()
  @IsIn(CRM_ACTION_STATUSES)
  status?: string;
  @IsOptional()
  @IsIn(CRM_ACTION_PRIORITIES)
  priority?: string;
  @IsOptional() @IsString() @MaxLength(40) dueDate?: string;
  @IsOptional() @IsString() @MaxLength(40) snoozedUntil?: string;
  @IsOptional() @Matches(UUID_OR_EMPTY) assignedToId?: string;
}

export class OutreachDto {
  @IsIn([
    'email',
    'telegram',
    'linkedin',
    'x',
    'phone',
    'event',
    'community',
    'other',
  ])
  channel!: string;
  @IsString() @MinLength(1) @MaxLength(500) summary!: string;
}

// ---------------------------------------------------------------------------
// Bulk (spec §1) — bounded, every action audited
// ---------------------------------------------------------------------------

export class BulkActionDto {
  @IsArray()
  @ArrayMaxSize(200)
  @Matches(UUID, { each: true })
  leadIds!: string[];
  @IsIn([
    'assign_owner',
    'set_stage',
    'add_tag',
    'remove_tag',
    'set_next_action',
    'add_note',
    'clear_stage',
  ])
  action!: string;
  @IsOptional() @Matches(UUID_OR_EMPTY) ownerId?: string;
  /** For set_stage / clear_stage. */
  @IsOptional() @IsIn([...CRM_STAGES, ''] as string[]) manualStage?: string;
  @IsOptional() @IsString() @MaxLength(48) tag?: string;
  /** For set_next_action. */
  @IsOptional()
  @IsIn(CRM_ACTION_TYPES)
  actionType?: string;
  @IsOptional() @IsString() @MaxLength(200) actionTitle?: string;
  @IsOptional() @IsString() @MaxLength(40) dueDate?: string;
  @IsOptional()
  @IsIn(CRM_ACTION_PRIORITIES)
  priority?: string;
  /** For add_note. */
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
}

// ---------------------------------------------------------------------------
// Segments / saved views
// ---------------------------------------------------------------------------

export class SegmentRuleDto {
  @IsIn(SEGMENT_FIELDS) field!: string;
  @IsIn(SEGMENT_OPERATORS) operator!: string;
  @IsOptional()
  value?: string | number | boolean | Array<string | number>;
}

/**
 * A rule is EITHER a leaf `{ field, operator, value }` OR a nested group
 * `{ op, rules }`. class-validator has no native union, so the whole
 * document is validated with a custom constraint that delegates to the
 * DOMAIN validator (`validateSegmentDocument`) — the single source of truth
 * for the grammar — instead of a second, drifting copy of the rules here.
 */
@ValidatorConstraint({ name: 'crmSegmentDocument', async: false })
class SegmentDocumentConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return validateSegmentDocument(value).length === 0;
  }
  defaultMessage(args: ValidationArguments): string {
    const issues = validateSegmentDocument(args.value);
    return issues.length
      ? `segment document invalid: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`
      : 'segment document is invalid';
  }
}

export class SegmentGroupDto {
  @Validate(SegmentDocumentConstraint)
  document!: unknown;
}

export class CreateSegmentDto {
  @IsString() @MinLength(1) @MaxLength(64) slug!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsDefined() @Validate(SegmentDocumentConstraint) document!: unknown;
}

export class UpdateSegmentDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Validate(SegmentDocumentConstraint) document?: unknown;
}

export class CreateSavedViewDto {
  @IsString() @MinLength(1) @MaxLength(64) slug!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Attribution capture (public) + merge
// ---------------------------------------------------------------------------

export class CaptureAttributionDto {
  @IsOptional() @IsString() @MaxLength(120) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(120) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(120) utmCampaign?: string;
  @IsOptional() @IsString() @MaxLength(120) utmContent?: string;
  @IsOptional() @IsString() @MaxLength(120) utmTerm?: string;
  @IsOptional() @IsString() @MaxLength(500) landingPage?: string;
  @IsOptional() @IsString() @MaxLength(500) referrer?: string;
  /** Client-generated anonymous id (UUID). Hashed before it is stored. */
  @IsOptional() @Matches(UUID) visitorId?: string;
}

export class LinkAttributionDto {
  @Matches(UUID) attributionId!: string;
}

export class MergeLeadDto {
  @Matches(UUID) targetLeadId!: string;
}

// ---------------------------------------------------------------------------
// C2 — the acquisition conversation (spec §6)
//
// The channel vocabulary is deliberately the SAME list as `OutreachDto`: a
// reply arrives on the same channels an outreach does, and two divergent
// lists would make the timeline unfilterable.
// ---------------------------------------------------------------------------

export class AcquisitionStepDto {
  @IsIn([
    'email',
    'telegram',
    'linkedin',
    'x',
    'phone',
    'event',
    'community',
    'other',
  ])
  channel!: string;

  /**
   * Required. A stage that says "they replied" with no record of what they
   * said is indistinguishable from a guess, and the C1 anti-fake rule exists
   * precisely to keep guesses out of the funnel.
   */
  // `IsNotEmpty` rather than `MinLength` alone: MinLength(1) accepts "   ",
  // and a summary of pure whitespace would be recorded as the evidence for a
  // funnel stage. Rejecting it here means it never reaches the ledger.
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'summary must contain actual text' })
  @MaxLength(500)
  summary!: string;
}

export class SetLostDto {
  /** Explicitly required — there is no "default to lost" by omission. */
  @IsBoolean() lost!: boolean;

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class SetReferrerDto {
  /**
   * Nullable on purpose: clearing the referrer is a real operation. The
   * pattern is `null` or a UUID, never an empty string, so "unset" has
   * exactly one representation.
   */
  @IsOptional()
  @IsUUID('4', { message: 'referredById must be a UUID or null' })
  @Allow(null as unknown as ValidationOptions)
  referredById?: string | null;
}

export class ConversionInviteDto {
  @IsIn(['email', 'telegram', 'linkedin', 'x', 'phone', 'community', 'other'])
  channel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class ImportPreviewDto {
  /** Display name only — the CONTENT is what gets validated and stored. */
  @IsString() @MaxLength(255) filename!: string;

  @IsString() @MinLength(1) content!: string;
}

export class CommitImportDto {
  @Matches(UUID) importId!: string;
}
