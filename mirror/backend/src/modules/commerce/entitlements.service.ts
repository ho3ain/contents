import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import {
  Entitlement,
  EntitlementLifecycleState,
  EntitlementStatus,
} from '../../database/entities/commerce/entitlement.entity';
import { EntitlementEvent } from '../../database/entities/commerce/entitlement-event.entity';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import { AgentVersion } from '../../database/entities/agents/agent-version.entity';
import type {
  CommercialProfile,
  LicenseType,
} from '../../database/entities/agents/product-model';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import {
  NOTIFICATION_TYPES,
  NotificationsService,
} from '../notifications/notifications.service';
import { ensureJourney } from '../buyer-journey/contract';
import { JobsService } from '../jobs/jobs.service';
import {
  recordEntitlementDecision,
  recordEntitlementLifecycleTransition,
} from '../../common/observability/metrics';
import {
  AccessDecisionReason,
  EntitlementCapability,
  immutableTermsSnapshot,
  isKnownCapability,
  legacyState,
  legacyStatusFor,
  termsForGrant,
} from './entitlement-domain';

export interface EntitlementView {
  id: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  agentVersion: string;
  /** Legacy-compatible projection; use lifecycleState for a full decision. */
  status: EntitlementStatus;
  lifecycleState: EntitlementLifecycleState;
  grantedAt: Date | null;
  revokedAt: Date | null;
  validFrom: Date | null;
  validUntil: Date | null;
  usageLimit: string | null;
  usageConsumed: string;
  usageUnit: string | null;
  licenseType: LicenseType | null;
  capabilities: EntitlementCapability[];
  termsKnown: boolean;
  statusReasonCode: string | null;
}

export interface EntitlementEventView {
  id: string;
  type: string;
  previousState: string | null;
  nextState: string | null;
  sequence: number;
  reasonCode: string | null;
  sourceType: string;
  createdAt: Date;
}

export interface AdminEntitlementView extends EntitlementView {
  holder: { id: string; email: string | null; username: string | null };
}

export interface AccessDecision {
  allowed: boolean;
  reasonCode: AccessDecisionReason;
  capability: EntitlementCapability;
  entitlementId: string | null;
  lifecycleState: EntitlementLifecycleState | null;
  validUntil: Date | null;
  usageRemaining: string | null;
  decisionAt: Date;
  /** Changes when a lifecycle transition occurs, useful to a bounded runtime cache. */
  policySequence: number | null;
}

interface GrantInput {
  userId: string;
  agentId: string;
  agentVersionId: string | null;
  orderId: string | null;
  commercialTermsSnapshot: CommercialProfile | null;
  sourceType: 'order' | 'free_acquisition';
  sourceId: string | null;
  actorUserId: string | null;
  dedupKey: string;
}

interface TransitionInput {
  nextState: EntitlementLifecycleState;
  eventType: 'granted' | 'revoked' | 'expired' | 'suspended' | 'restored';
  reasonCode: string;
  sourceType: string;
  sourceId: string | null;
  actorUserId: string | null;
  dedupKey: string;
}

/**
 * Authoritative entitlement authority.
 *
 * Identity/session validation stays in the auth guard. Product and purchase
 * facts stay in their own entities. This service turns an immutable purchase
 * snapshot plus current lifecycle evidence into a central access decision;
 * callers must not treat a UI state or a cached response as authority.
 */
@Injectable()
export class EntitlementsService implements OnModuleInit {
  constructor(
    @InjectRepository(Entitlement)
    private readonly entitlementsRepository: Repository<Entitlement>,
    @InjectRepository(EntitlementEvent)
    private readonly eventsRepository: Repository<EntitlementEvent>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    // Jobs are opt-in globally. Access decisions still enforce time bounds if
    // the worker is disabled or delayed, so this task is housekeeping only.
    this.jobs.register({
      name: 'entitlements.expire',
      everyMinutes: 15,
      handler: () => this.expireDue(),
    });
  }

  async acquireFree(
    userId: string,
    agent: Agent,
    version: AgentVersion | null,
  ): Promise<Entitlement> {
    if (!agent.isFree) {
      throw new ApiException(
        'CONFLICT',
        'This agent is not free — use checkout',
        HttpStatus.CONFLICT,
      );
    }
    if (agent.status !== AgentStatus.PUBLISHED) {
      throw new ApiException(
        'AGENT_NOT_PUBLISHED',
        'Agent is not available',
        HttpStatus.CONFLICT,
      );
    }

    const prior = await this.entitlementsRepository.findOneBy({
      userId,
      agentId: agent.id,
    });
    const alreadyLive =
      prior && ['active', 'grace'].includes(this.stateOf(prior));
    const entitlement = await this.dataSource.transaction((manager) =>
      this.grantInTransaction(manager, {
        userId,
        agentId: agent.id,
        agentVersionId: version?.id ?? null,
        orderId: null,
        commercialTermsSnapshot: immutableTermsSnapshot(
          agent.commercialProfile,
        ),
        sourceType: 'free_acquisition',
        sourceId: null,
        actorUserId: userId,
        dedupKey: `free-grant:${userId}:${agent.id}`,
      }),
    );
    // Notifications/audit are observers, deliberately outside the authority
    // transaction. An already active entitlement does not repeat either.
    if (!alreadyLive) {
      await this.audit.record({
        action: AUDIT_ACTIONS.ENTITLEMENT_GRANTED,
        entity: AUDIT_ENTITIES.ENTITLEMENT,
        entityId: entitlement.id,
        metadata: { agentId: agent.id, kind: 'free' },
        context: { actorId: userId },
      });
    }

    // A notification is deduplicated by the notification service. It is not a
    // lifecycle record and failure cannot undo a legal access grant.
    let link = '/buyer/products';
    try {
      await ensureJourney(this.entitlementsRepository.manager, entitlement.id);
      link = `/buyer/products/${entitlement.id}`;
    } catch {
      // Journey is created lazily on first open; never block entitlement.
    }
    if (!alreadyLive) {
      await this.notifications.notifyEventSafe(
        userId,
        'purchase_success',
        { agentName: agent.name },
        {
          link,
          relatedType: 'entitlement',
          relatedId: entitlement.id,
          dedupKey: `purchase_success:${entitlement.id}`,
        },
      );
    }
    return entitlement;
  }

  /** Called inside the payment-finalization transaction; no network I/O here. */
  grantFromOrder(
    manager: EntityManager,
    input: Omit<GrantInput, 'sourceType' | 'dedupKey'>,
  ): Promise<Entitlement> {
    return this.grantInTransaction(manager, {
      ...input,
      sourceType: 'order',
      dedupKey: `order-grant:${input.orderId}:${input.agentId}`,
    });
  }

  /** Called inside the refund transaction so refund + revocation share a commit. */
  async revokeForRefund(
    manager: EntityManager,
    input: { orderId: string; actorUserId: string },
  ): Promise<Entitlement | null> {
    const entitlement = await manager.getRepository(Entitlement).findOneBy({
      orderId: input.orderId,
    });
    if (!entitlement) return null;
    const state = this.stateOf(entitlement);
    if (state === 'revoked') return entitlement;
    return this.transitionInTransaction(manager, entitlement, {
      nextState: 'revoked',
      eventType: 'revoked',
      reasonCode: 'REFUND',
      sourceType: 'refund',
      sourceId: input.orderId,
      actorUserId: input.actorUserId,
      dedupKey: `refund-revoke:${input.orderId}`,
    });
  }

  /**
   * Central checks for product/review/runtime-adapter code. It intentionally
   * evaluates timestamps each call: an expiry worker is optimization/audit
   * convergence, never the only enforcement mechanism.
   */
  async decideAccess(
    userId: string,
    agentId: string,
    capability: EntitlementCapability = 'product_access',
  ): Promise<AccessDecision> {
    const entitlement = await this.entitlementsRepository.findOneBy({
      userId,
      agentId,
    });
    return this.evaluate(entitlement, capability, new Date());
  }

  async decideMineById(
    userId: string,
    entitlementId: string,
    capability: string,
  ): Promise<AccessDecision> {
    if (!isKnownCapability(capability)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Unknown entitlement capability',
        HttpStatus.BAD_REQUEST,
      );
    }
    const entitlement = await this.entitlementsRepository.findOneBy({
      id: entitlementId,
      userId,
    });
    // 404 avoids using an arbitrary entitlement id as an ownership oracle.
    if (!entitlement) {
      throw new ApiException(
        'NOT_FOUND',
        'Entitlement not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.evaluate(entitlement, capability, new Date());
  }

  async hasGranted(userId: string, agentId: string): Promise<boolean> {
    return (await this.decideAccess(userId, agentId, 'product_access')).allowed;
  }

  async listMine(userId: string): Promise<EntitlementView[]> {
    const rows = await this.entitlementsRepository.find({
      where: { userId },
      relations: { agent: true, agentVersion: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async getMine(
    userId: string,
    entitlementId: string,
  ): Promise<EntitlementView> {
    const row = await this.entitlementsRepository.findOne({
      where: { id: entitlementId, userId },
      relations: { agent: true, agentVersion: true },
    });
    if (!row) {
      throw new ApiException(
        'NOT_FOUND',
        'Entitlement not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toView(row);
  }

  async listMineEvents(
    userId: string,
    entitlementId: string,
  ): Promise<EntitlementEventView[]> {
    const entitled = await this.entitlementsRepository.existsBy({
      id: entitlementId,
      userId,
    });
    if (!entitled) {
      throw new ApiException(
        'NOT_FOUND',
        'Entitlement not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const events = await this.eventsRepository.find({
      where: { entitlementId },
      order: { sequence: 'ASC' },
    });
    return events.map((event) => ({
      id: event.id,
      type: event.eventType,
      previousState: event.previousState,
      nextState: event.nextState,
      sequence: event.sequence,
      reasonCode: event.reasonCode,
      sourceType: event.sourceType,
      createdAt: event.createdAt,
    }));
  }

  async creatorSummary(creatorId: string): Promise<{
    total: number;
    active: number;
    grace: number;
    pendingActivation: number;
    suspended: number;
    revoked: number;
    expired: number;
    usageExhausted: number;
  }> {
    const rows = await this.dataSource.query<
      Array<{
        total: string;
        active: string;
        grace: string;
        pending_activation: string;
        suspended: string;
        revoked: string;
        expired: string;
        usage_exhausted: string;
      }>
    >(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE effective_state = 'active')::text AS active,
              count(*) FILTER (WHERE effective_state = 'grace')::text AS grace,
              count(*) FILTER (WHERE effective_state = 'pending_activation')::text AS pending_activation,
              count(*) FILTER (WHERE effective_state = 'suspended')::text AS suspended,
              count(*) FILTER (WHERE effective_state = 'revoked')::text AS revoked,
              count(*) FILTER (WHERE effective_state = 'expired')::text AS expired,
              count(*) FILTER (WHERE usage_limit IS NOT NULL AND usage_consumed >= usage_limit)::text AS usage_exhausted
         FROM (
           SELECT e.*,
             CASE
               WHEN e.valid_until IS NOT NULL AND e.valid_until <= now() THEN 'expired'
               WHEN e.lifecycle_state IS NOT NULL THEN e.lifecycle_state
               WHEN e.status::text = 'granted' THEN 'active'
               ELSE 'revoked'
             END AS effective_state
             FROM entitlements e
             JOIN agents a ON a.id = e.agent_id
            WHERE a.creator_id = $1
         ) current`,
      [creatorId],
    );
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      grace: Number(row?.grace ?? 0),
      pendingActivation: Number(row?.pending_activation ?? 0),
      suspended: Number(row?.suspended ?? 0),
      revoked: Number(row?.revoked ?? 0),
      expired: Number(row?.expired ?? 0),
      usageExhausted: Number(row?.usage_exhausted ?? 0),
    };
  }

  async listAdmin(
    lifecycleState: EntitlementLifecycleState | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ items: AdminEntitlementView[]; total: number }> {
    const qb = this.entitlementsRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.agent', 'agent')
      .leftJoinAndSelect('e.agentVersion', 'agentVersion')
      .leftJoinAndSelect('e.user', 'holder')
      // Property name, not the column name: with skip()/take() over joined
      // relations TypeORM resolves the ORDER BY against entity metadata, and
      // an unknown property crashes the paginated query.
      .orderBy('e.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (lifecycleState) {
      if (lifecycleState === 'active') {
        // A NULL lifecycle state is an intentional legacy fact; its existing
        // granted projection remains active only for compatibility.
        qb.andWhere(
          `(e.lifecycle_state = :state OR (e.lifecycle_state IS NULL AND e.status = :granted))`,
          { state: lifecycleState, granted: EntitlementStatus.GRANTED },
        );
      } else {
        qb.andWhere('e.lifecycle_state = :state', { state: lifecycleState });
      }
    }
    const [rows, total] = await qb.getManyAndCount();
    return {
      total,
      items: rows.map((row) => ({
        ...this.toView(row),
        holder: {
          id: row.userId,
          email: row.user?.email ?? null,
          username: row.user?.username ?? null,
        },
      })),
    };
  }

  async listAdminEvents(
    entitlementId: string,
  ): Promise<EntitlementEventView[]> {
    const entitled = await this.entitlementsRepository.existsBy({
      id: entitlementId,
    });
    if (!entitled) {
      throw new ApiException(
        'NOT_FOUND',
        'Entitlement not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const events = await this.eventsRepository.find({
      where: { entitlementId },
      order: { sequence: 'ASC' },
    });
    return events.map((event) => ({
      id: event.id,
      type: event.eventType,
      previousState: event.previousState,
      nextState: event.nextState,
      sequence: event.sequence,
      reasonCode: event.reasonCode,
      sourceType: event.sourceType,
      createdAt: event.createdAt,
    }));
  }

  async suspendByAdmin(
    entitlementId: string,
    adminId: string,
  ): Promise<Entitlement> {
    const transitioned = await this.dataSource.transaction(async (manager) => {
      const current = await manager.getRepository(Entitlement).findOneBy({
        id: entitlementId,
      });
      if (!current) {
        throw new ApiException(
          'NOT_FOUND',
          'Entitlement not found',
          HttpStatus.NOT_FOUND,
        );
      }
      const state = this.stateOf(current);
      if (state === 'suspended') return current;
      if (!['active', 'grace', 'pending_activation'].includes(state)) {
        throw new ApiException(
          'CONFLICT',
          'This entitlement cannot be suspended from its current state',
          HttpStatus.CONFLICT,
        );
      }
      return this.transitionInTransaction(manager, current, {
        nextState: 'suspended',
        eventType: 'suspended',
        reasonCode: 'ADMIN_SUSPENSION',
        sourceType: 'admin',
        sourceId: null,
        actorUserId: adminId,
        dedupKey: `admin-suspend:${current.id}:${current.lifecycleSequence ?? 0}`,
      });
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.ENTITLEMENT_SUSPENDED,
      entity: AUDIT_ENTITIES.ENTITLEMENT,
      entityId: transitioned.id,
      metadata: { reason: 'ADMIN_SUSPENSION' },
      context: { actorId: adminId },
    });
    return transitioned;
  }

  async restoreByAdmin(
    entitlementId: string,
    adminId: string,
  ): Promise<Entitlement> {
    const transitioned = await this.dataSource.transaction(async (manager) => {
      const current = await manager.getRepository(Entitlement).findOneBy({
        id: entitlementId,
      });
      if (!current) {
        throw new ApiException(
          'NOT_FOUND',
          'Entitlement not found',
          HttpStatus.NOT_FOUND,
        );
      }
      const state = this.stateOf(current);
      if (state !== 'suspended') {
        throw new ApiException(
          'CONFLICT',
          'Only a suspended entitlement can be restored',
          HttpStatus.CONFLICT,
        );
      }
      const elapsed = current.validUntil && current.validUntil <= new Date();
      return this.transitionInTransaction(manager, current, {
        nextState: elapsed ? 'expired' : 'active',
        eventType: elapsed ? 'expired' : 'restored',
        reasonCode: elapsed ? 'TERM_EXPIRED' : 'ADMIN_RESTORED',
        sourceType: 'admin',
        sourceId: null,
        actorUserId: adminId,
        dedupKey: `admin-restore:${current.id}:${current.lifecycleSequence ?? 0}`,
      });
    });
    await this.audit.record({
      action:
        this.stateOf(transitioned) === 'expired'
          ? AUDIT_ACTIONS.ENTITLEMENT_EXPIRED
          : AUDIT_ACTIONS.ENTITLEMENT_RESTORED,
      entity: AUDIT_ENTITIES.ENTITLEMENT,
      entityId: transitioned.id,
      metadata: { reason: transitioned.statusReasonCode },
      context: { actorId: adminId },
    });
    return transitioned;
  }

  /** Worker/ops entry point. Safe to retry: state + event idempotency converge. */
  async expireDue(now = new Date(), batchSize = 200): Promise<number> {
    const due = await this.entitlementsRepository.find({
      where: {
        lifecycleState: In(['active', 'grace']),
        validUntil: LessThanOrEqual(now),
      },
      relations: { agent: true },
      order: { validUntil: 'ASC' },
      take: batchSize,
    });
    let expired = 0;
    for (const candidate of due) {
      const transitioned = await this.dataSource.transaction(
        async (manager) => {
          const current = await manager.getRepository(Entitlement).findOneBy({
            id: candidate.id,
          });
          if (!current || !current.validUntil || current.validUntil > now)
            return null;
          const state = this.stateOf(current);
          if (state !== 'active' && state !== 'grace') return null;
          return this.transitionInTransaction(manager, current, {
            nextState: 'expired',
            eventType: 'expired',
            reasonCode: 'TERM_EXPIRED',
            sourceType: 'expiry_job',
            sourceId: null,
            actorUserId: null,
            dedupKey: `expiry:${current.id}:${current.validUntil.toISOString()}`,
          });
        },
      );
      if (!transitioned) continue;
      expired += 1;
      // Transactional authority stays above; the in-app notification is a
      // deduplicated observer and can never make an expired right active.
      await this.notifications.notifyEventSafe(
        transitioned.userId,
        NOTIFICATION_TYPES.ENTITLEMENT_EXPIRED,
        { agentName: candidate.agent.name },
        {
          link: `/buyer/products/${transitioned.id}`,
          relatedType: 'entitlement',
          relatedId: transitioned.id,
          dedupKey: `entitlement-expired:${transitioned.id}:${transitioned.validUntil?.toISOString() ?? 'unknown'}`,
        },
      );
    }
    return expired;
  }

  private async grantInTransaction(
    manager: EntityManager,
    input: GrantInput,
  ): Promise<Entitlement> {
    const repository = manager.getRepository(Entitlement);
    // Serialize concurrent free-acquire/replay attempts for this holder and
    // product. The unique key remains the database backstop; advisory locks
    // turn an expected double tap into an idempotent read instead of a race.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [input.userId, input.agentId],
    );
    const existing = await repository.findOneBy({
      userId: input.userId,
      agentId: input.agentId,
    });
    const now = new Date();
    if (existing && ['active', 'grace'].includes(this.stateOf(existing))) {
      return existing;
    }
    // Callback retries carry the same business key. Do not replay a past
    // transition (or trip the unique event key) after the original commit.
    const duplicate = await manager
      .getRepository(EntitlementEvent)
      .findOneBy({ dedupKey: input.dedupKey });
    if (duplicate && existing) return existing;
    const snapshot = immutableTermsSnapshot(input.commercialTermsSnapshot);
    const terms = termsForGrant(snapshot, now);
    const base =
      existing ??
      repository.create({
        userId: input.userId,
        agentId: input.agentId,
        holderKind: 'user',
        lifecycleSequence: 0,
        usageConsumed: '0',
      });
    const previousState = existing ? this.stateOf(existing) : null;
    base.agentVersionId = input.agentVersionId;
    base.orderId = input.orderId;
    base.status = EntitlementStatus.GRANTED;
    base.lifecycleState = 'active';
    base.commercialTermsSnapshot = snapshot;
    base.capabilities = terms.capabilities;
    base.validFrom = now;
    base.validUntil = terms.validUntil;
    base.usageLimit = terms.usageLimit;
    base.usageConsumed = '0';
    base.grantedAt = now;
    base.revokedAt = null;
    base.revokedReason = null;
    base.statusReasonCode = null;
    base.lastLifecycleAt = now;
    base.lifecycleSequence = (base.lifecycleSequence ?? 0) + 1;
    const saved = await repository.save(base);
    await this.appendEvent(manager, saved, {
      eventType: previousState ? 'restored' : 'granted',
      previousState,
      nextState: 'active',
      sequence: saved.lifecycleSequence,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorUserId: input.actorUserId,
      reasonCode: previousState ? 'RESTORED' : 'GRANTED',
      dedupKey: input.dedupKey,
    });
    return saved;
  }

  private async transitionInTransaction(
    manager: EntityManager,
    entitlement: Entitlement,
    input: TransitionInput,
  ): Promise<Entitlement> {
    const eventRepository = manager.getRepository(EntitlementEvent);
    // Refund/admin/job transitions all serialize on the entitlement itself.
    // This guards sequence/event ordering even if separate workflows race.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      entitlement.id,
    ]);
    const duplicate = await eventRepository.findOneBy({
      dedupKey: input.dedupKey,
    });
    if (duplicate) return entitlement;
    const previousState = this.stateOf(entitlement);
    if (previousState === input.nextState) return entitlement;
    const now = new Date();
    entitlement.lifecycleState = input.nextState;
    entitlement.status = legacyStatusFor(input.nextState) as EntitlementStatus;
    entitlement.statusReasonCode = input.reasonCode;
    entitlement.lastLifecycleAt = now;
    entitlement.lifecycleSequence = (entitlement.lifecycleSequence ?? 0) + 1;
    if (input.nextState === 'revoked') {
      entitlement.revokedAt = now;
      entitlement.revokedReason = input.reasonCode.toLowerCase();
    }
    const saved = await manager.getRepository(Entitlement).save(entitlement);
    await this.appendEvent(manager, saved, {
      eventType: input.eventType,
      previousState,
      nextState: input.nextState,
      sequence: saved.lifecycleSequence,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorUserId: input.actorUserId,
      reasonCode: input.reasonCode,
      dedupKey: input.dedupKey,
    });
    return saved;
  }

  private async appendEvent(
    manager: EntityManager,
    entitlement: Entitlement,
    input: {
      eventType: string;
      previousState: string | null;
      nextState: string | null;
      sequence: number;
      sourceType: string;
      sourceId: string | null;
      actorUserId: string | null;
      reasonCode: string;
      dedupKey: string;
    },
  ): Promise<EntitlementEvent> {
    const repository = manager.getRepository(EntitlementEvent);
    const event = await repository.save(
      repository.create({
        entitlementId: entitlement.id,
        eventType: input.eventType,
        previousState: input.previousState,
        nextState: input.nextState,
        sequence: input.sequence,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        actorUserId: input.actorUserId,
        reasonCode: input.reasonCode,
        dedupKey: input.dedupKey,
        metadata: {},
      }),
    );
    recordEntitlementLifecycleTransition(
      event.eventType,
      event.nextState ?? 'none',
    );
    return event;
  }

  private evaluate(
    entitlement: Entitlement | null,
    capability: EntitlementCapability,
    now: Date,
  ): AccessDecision {
    const blank = (reasonCode: AccessDecisionReason): AccessDecision => ({
      allowed: false,
      reasonCode,
      capability,
      entitlementId: entitlement?.id ?? null,
      lifecycleState: entitlement ? this.stateOf(entitlement) : null,
      validUntil: entitlement?.validUntil ?? null,
      usageRemaining: entitlement ? this.usageRemaining(entitlement) : null,
      decisionAt: now,
      policySequence: entitlement?.lifecycleSequence ?? null,
    });
    const deny = (reason: AccessDecisionReason): AccessDecision => {
      const decision = blank(reason);
      recordEntitlementDecision(capability, decision.reasonCode);
      return decision;
    };
    if (!entitlement) return deny('ENTITLEMENT_NOT_FOUND');
    const state = this.stateOf(entitlement);
    if (entitlement.validUntil && entitlement.validUntil <= now)
      return deny('ENTITLEMENT_EXPIRED');
    if (state === 'pending_activation')
      return deny('ENTITLEMENT_PENDING_ACTIVATION');
    if (state === 'revoked') return deny('ENTITLEMENT_REVOKED');
    if (state === 'suspended') return deny('ENTITLEMENT_SUSPENDED');
    if (state === 'expired') return deny('ENTITLEMENT_EXPIRED');
    if (this.usageExhausted(entitlement)) return deny('USAGE_LIMIT_REACHED');
    const capabilities = entitlement.capabilities?.length
      ? entitlement.capabilities
      : ['product_access'];
    if (!capabilities.includes(capability))
      return deny('CAPABILITY_NOT_GRANTED');
    const allowed = {
      allowed: true,
      reasonCode: state === 'grace' ? 'ALLOWED_GRACE' : 'ALLOWED',
      capability,
      entitlementId: entitlement.id,
      lifecycleState: state,
      validUntil: entitlement.validUntil,
      usageRemaining: this.usageRemaining(entitlement),
      decisionAt: now,
      policySequence: entitlement.lifecycleSequence ?? 0,
    } as AccessDecision;
    recordEntitlementDecision(capability, allowed.reasonCode);
    return allowed;
  }

  private stateOf(entitlement: Entitlement): EntitlementLifecycleState {
    return entitlement.lifecycleState ?? legacyState(entitlement.status);
  }

  private usageExhausted(entitlement: Entitlement): boolean {
    if (!entitlement.usageLimit) return false;
    return decimalAtLeast(
      entitlement.usageConsumed ?? '0',
      entitlement.usageLimit,
    );
  }

  private usageRemaining(entitlement: Entitlement): string | null {
    if (!entitlement.usageLimit) return null;
    return decimalSubtract(
      entitlement.usageLimit,
      entitlement.usageConsumed ?? '0',
    );
  }

  private toView(row: Entitlement): EntitlementView {
    return {
      id: row.id,
      agentId: row.agentId,
      agentName: row.agent?.name ?? 'Unknown product',
      agentSlug: row.agent?.slug ?? '',
      agentVersion: row.agentVersion?.versionNumber ?? '—',
      status: row.status,
      lifecycleState: this.stateOf(row),
      grantedAt: row.grantedAt,
      revokedAt: row.revokedAt,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      usageLimit: row.usageLimit,
      usageConsumed: row.usageConsumed ?? '0',
      usageUnit: row.commercialTermsSnapshot?.license?.usageUnit ?? null,
      licenseType: row.commercialTermsSnapshot?.license?.type ?? null,
      capabilities: (row.capabilities?.length
        ? row.capabilities
        : ['product_access']) as EntitlementCapability[],
      termsKnown: row.commercialTermsSnapshot !== null,
      statusReasonCode: row.statusReasonCode,
    };
  }
}

/** numeric(20,6) comparison/subtraction without JS float precision loss. */
function fixedDecimal(value: string): bigint {
  const [wholeRaw, fractionalRaw = ''] = String(value).split('.');
  const whole = /^\d+$/.test(wholeRaw) ? wholeRaw : '0';
  const fractional = /^\d*$/.test(fractionalRaw)
    ? fractionalRaw.slice(0, 6)
    : '';
  return (
    BigInt(whole) * 1_000_000n + BigInt((fractional + '000000').slice(0, 6))
  );
}
function decimalAtLeast(left: string, right: string): boolean {
  return fixedDecimal(left) >= fixedDecimal(right);
}
function decimalSubtract(limit: string, consumed: string): string {
  const value = fixedDecimal(limit) - fixedDecimal(consumed);
  if (value <= 0n) return '0';
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
