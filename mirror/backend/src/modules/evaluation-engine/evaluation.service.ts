import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { EvaluationClaimAssessment } from '../../database/entities/evaluation/evaluation-claim-assessment.entity';
import { EvaluationControlResult } from '../../database/entities/evaluation/evaluation-control-result.entity';
import { EvaluationEvidenceRecord } from '../../database/entities/evaluation/evaluation-evidence-record.entity';
import { EvaluationRun } from '../../database/entities/evaluation/evaluation-run.entity';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import {
  assessClaims,
  classifyRisk,
  EVALUATION_ENGINE_VERSION,
  planDigest,
  reduceFinalStatus,
  sha256,
} from './domain/evaluation-domain';
import { executeControl, selectControls } from './domain/control-catalog';
import type { EvaluationContext } from './domain/evaluation.types';
import type {
  CancelEvaluationDto,
  CreateEvaluationDto,
  EvaluationListQueryDto,
  EvaluationPageQueryDto,
} from './dto/evaluation.dto';
import { EvaluationPolicyService } from './evaluation-policy.service';
import { EvaluationSourceService } from './evaluation-source.service';

const pageOf = (page?: number) => Math.max(1, page ?? 1);
const pageSizeOf = (pageSize?: number) =>
  Math.min(100, Math.max(1, pageSize ?? 25));

/**
 * Converts every evidence payload to a bounded, secret-safe object before it
 * reaches persistence. A digest is computed over the redacted form, so logs or
 * raw source values cannot be reconstructed from an EvidenceRecord.
 */
export function redactEvidence(
  value: unknown,
  depth = 0,
): Record<string, unknown> {
  if (depth > 5) return { value: '[truncated-depth]' };
  if (value === null || value === undefined) return { value: null };
  if (Array.isArray(value)) {
    return {
      items: value.slice(0, 25).map((item) => redactValue(item, depth + 1)),
      truncated: value.length > 25,
    };
  }
  if (typeof value !== 'object')
    return { value: redactValue(value, depth + 1) };
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(
    value as Record<string, unknown>,
  ).slice(0, 30)) {
    if (
      /(secret|token|password|credential|authorization|cookie|api.?key|endpoint|url)/i.test(
        key,
      )
    ) {
      output[key] = '[redacted]';
    } else {
      output[key] = redactValue(child, depth + 1);
    }
  }
  return output;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 5) return '[truncated-depth]';
  if (typeof value === 'string') return value.slice(0, 300);
  if (Array.isArray(value))
    return value.slice(0, 25).map((item) => redactValue(item, depth + 1));
  if (value && typeof value === 'object')
    return redactEvidence(value, depth + 1);
  return value;
}

@Injectable()
export class EvaluationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(EvaluationRun)
    private readonly runs: Repository<EvaluationRun>,
    @InjectRepository(EvaluationControlResult)
    private readonly controls: Repository<EvaluationControlResult>,
    @InjectRepository(EvaluationEvidenceRecord)
    private readonly evidence: Repository<EvaluationEvidenceRecord>,
    @InjectRepository(EvaluationClaimAssessment)
    private readonly claims: Repository<EvaluationClaimAssessment>,
    private readonly sources: EvaluationSourceService,
    private readonly policies: EvaluationPolicyService,
    private readonly audit: AuditService,
  ) {}

  async createForCreator(userId: string, dto: CreateEvaluationDto) {
    const [source, policy] = await Promise.all([
      this.sources.resolveForCreator(userId, dto),
      this.policies.active(),
    ]);
    const risk = classifyRisk(source.snapshot);
    const context: EvaluationContext = {
      snapshot: source.snapshot,
      content: source.content,
      runtime: source.runtime,
      release: source.release,
      conformance: source.conformance,
      risk,
    };
    const plan = selectControls(policy.definition, context);
    const inputFingerprint = sha256({
      agentId: dto.agentId,
      agentVersionId: dto.agentVersionId,
      reviewSubmissionId: dto.reviewSubmissionId ?? null,
      runtimeId: dto.runtimeId ?? null,
      runtimeReleaseId: dto.runtimeReleaseId ?? null,
      policyId: policy.id,
    });
    const created = await this.dataSource.transaction(async (manager) => {
      // Serialize a creator's idempotency key, including concurrent requests
      // arriving before the unique index can report a conflict.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `evaluation:${source.creator.id}:${dto.idempotencyKey}`,
      ]);
      const runRepository = manager.getRepository(EvaluationRun);
      const existing = await runRepository.findOneBy({
        creatorId: source.creator.id,
        idempotencyKey: dto.idempotencyKey,
      });
      if (existing) {
        if (existing.inputFingerprint !== inputFingerprint) {
          throw new ApiException(
            'IDEMPOTENCY_CONFLICT',
            'This idempotency key was already used for different evaluation input',
            HttpStatus.CONFLICT,
          );
        }
        return { run: existing, reused: true };
      }

      const run = runRepository.create({
        agentId: source.agent.id,
        creatorId: source.creator.id,
        agentVersionId: source.version.id,
        reviewSubmissionId: source.submission?.id ?? null,
        runtimeId: source.runtime?.id ?? null,
        runtimeReleaseId: source.release?.id ?? null,
        policyId: policy.id,
        policyKey: policy.policyKey,
        policyVersion: policy.version,
        engineVersion: EVALUATION_ENGINE_VERSION,
        profile: source.snapshot.profile,
        riskLevel: risk.level,
        riskFactors: risk.factors,
        state: 'Running',
        finalStatus: null,
        idempotencyKey: dto.idempotencyKey,
        inputFingerprint,
        inputSnapshot: source.snapshot,
        policySnapshot: {
          policyId: policy.id,
          policyKey: policy.policyKey,
          version: policy.version,
          catalogVersion: policy.catalogVersion,
          definition: policy.definition,
        },
        controlPlan: plan,
        resultSummary: {},
        cancelReason: null,
        startedAt: new Date(),
        finishedAt: null,
      });
      const saved = await runRepository.save(run);
      const executions = plan.map((planned) => ({
        ...planned,
        ...executeControl(planned, context),
      }));
      const finalStatus = reduceFinalStatus(executions);
      const resultRepository = manager.getRepository(EvaluationControlResult);
      const evidenceRepository = manager.getRepository(
        EvaluationEvidenceRecord,
      );
      for (const execution of executions) {
        const savedResult = await resultRepository.save(
          resultRepository.create({
            evaluationRunId: saved.id,
            controlId: execution.id,
            controlVersion: execution.version,
            category: execution.category,
            requirement: execution.requirement,
            outcome: execution.outcome,
            reasonCode: execution.reasonCode,
            reason: execution.reason.slice(0, 1000),
            requiresHumanReview: execution.requiresHumanReview,
            criterionSnapshot: { rationale: execution.rationale },
            toolName: 'mesh-evaluation-engine',
            toolVersion: EVALUATION_ENGINE_VERSION,
          }),
        );
        for (const item of execution.evidence) {
          const valueRedacted = redactEvidence(item.value);
          await evidenceRepository.save(
            evidenceRepository.create({
              evaluationRunId: saved.id,
              controlResultId: savedResult.id,
              evidenceKind: item.kind,
              source: item.source,
              toolName: item.toolName,
              toolVersion: item.toolVersion,
              sensitivity: item.sensitivity,
              valueRedacted,
              valueDigest: sha256(valueRedacted),
            }),
          );
        }
      }
      const claimRepository = manager.getRepository(EvaluationClaimAssessment);
      for (const claim of assessClaims(context)) {
        await claimRepository.save(
          claimRepository.create({ evaluationRunId: saved.id, ...claim }),
        );
      }
      saved.state = 'Completed';
      saved.finalStatus = finalStatus;
      saved.finishedAt = new Date();
      saved.resultSummary = {
        totalControls: executions.length,
        mandatoryControls: executions.filter(
          (control) => control.requirement === 'Mandatory',
        ).length,
        conditionalControls: executions.filter(
          (control) => control.requirement === 'Conditional',
        ).length,
        outcomes: Object.fromEntries(
          [
            'Passed',
            'Failed',
            'Blocked',
            'NotApplicable',
            'Inconclusive',
            'Cancelled',
          ].map((outcome) => [
            outcome,
            executions.filter((control) => control.outcome === outcome).length,
          ]),
        ),
        requiresHumanReview:
          risk.requiresHumanReview ||
          executions.some((control) => control.requiresHumanReview),
        planDigest: planDigest(plan),
        finalStatusAlgorithm: 'mandatory-v1',
      };
      return { run: await runRepository.save(saved), reused: false };
    });
    if (!created.reused) {
      await this.audit.record({
        action: AUDIT_ACTIONS.EVALUATION_RUN_CREATED,
        entity: AUDIT_ENTITIES.EVALUATION_RUN,
        entityId: created.run.id,
        context: { actorId: userId },
        metadata: {
          agentId: created.run.agentId,
          versionId: created.run.agentVersionId,
          profile: created.run.profile,
          finalStatus: created.run.finalStatus,
          policyVersion: created.run.policyVersion,
        },
      });
    }
    return { ...this.toRunView(created.run), reused: created.reused };
  }

  async listForCreator(userId: string, query: EvaluationListQueryDto) {
    const creator = await this.creatorForRunScope(userId);
    const page = pageOf(query.page);
    const pageSize = pageSizeOf(query.pageSize);
    const where = {
      creatorId: creator.id,
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.state ? { state: query.state } : {}),
    };
    const [items, total] = await this.runs.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: items.map((item) => this.toRunView(item)),
      meta: { total, page, pageSize },
    };
  }

  async getForCreator(userId: string, runId: string) {
    const creator = await this.creatorForRunScope(userId);
    const run = await this.runs.findOneBy({ id: runId, creatorId: creator.id });
    if (!run) throw this.notFound('Evaluation run not found');
    return this.toRunView(run);
  }

  async listControlsForCreator(
    userId: string,
    runId: string,
    query: EvaluationPageQueryDto,
  ) {
    await this.getForCreator(userId, runId);
    return this.listControls(runId, query);
  }

  async listEvidenceForCreator(
    userId: string,
    runId: string,
    query: EvaluationPageQueryDto,
  ) {
    await this.getForCreator(userId, runId);
    return this.listEvidence(runId, query);
  }

  async listClaimsForCreator(
    userId: string,
    runId: string,
    query: EvaluationPageQueryDto,
  ) {
    await this.getForCreator(userId, runId);
    return this.listClaims(runId, query);
  }

  async rerunForCreator(userId: string, runId: string) {
    const creator = await this.creatorForRunScope(userId);
    const prior = await this.runs.findOneBy({
      id: runId,
      creatorId: creator.id,
    });
    if (!prior) throw this.notFound('Evaluation run not found');
    const suffix = randomUUID().replace(/-/g, '');
    const result = await this.createForCreator(userId, {
      agentId: prior.agentId,
      agentVersionId: prior.agentVersionId,
      reviewSubmissionId: prior.reviewSubmissionId ?? undefined,
      runtimeId: prior.runtimeId ?? undefined,
      runtimeReleaseId: prior.runtimeReleaseId ?? undefined,
      idempotencyKey: `rerun:${prior.id}:${suffix}`,
    });
    await this.audit.record({
      action: AUDIT_ACTIONS.EVALUATION_RUN_RERUN,
      entity: AUDIT_ENTITIES.EVALUATION_RUN,
      entityId: result.id,
      context: { actorId: userId },
      metadata: { priorRunId: prior.id, agentId: prior.agentId },
    });
    return result;
  }

  /** Current adapters complete synchronously; queued/running cancellation is retained for a future durable worker. */
  async cancelForCreator(
    userId: string,
    runId: string,
    dto: CancelEvaluationDto,
  ) {
    const creator = await this.creatorForRunScope(userId);
    const run = await this.runs.findOneBy({ id: runId, creatorId: creator.id });
    if (!run) throw this.notFound('Evaluation run not found');
    if (!['Queued', 'Running'].includes(run.state)) {
      throw new ApiException(
        'CONFLICT',
        'Only queued or running evaluations can be cancelled',
        HttpStatus.CONFLICT,
      );
    }
    run.state = 'Cancelled';
    run.finalStatus = 'Cancelled';
    run.cancelReason = dto.reason?.trim().slice(0, 300) || null;
    run.finishedAt = new Date();
    const saved = await this.runs.save(run);
    await this.audit.record({
      action: AUDIT_ACTIONS.EVALUATION_RUN_CANCELLED,
      entity: AUDIT_ENTITIES.EVALUATION_RUN,
      entityId: saved.id,
      context: { actorId: userId },
      metadata: { agentId: saved.agentId },
    });
    return this.toRunView(saved);
  }

  async listAdmin(query: EvaluationListQueryDto) {
    const page = pageOf(query.page);
    const pageSize = pageSizeOf(query.pageSize);
    const where = {
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.state ? { state: query.state } : {}),
    };
    const [items, total] = await this.runs.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: items.map((item) => this.toRunView(item)),
      meta: { total, page, pageSize },
    };
  }

  async getAdmin(runId: string) {
    const run = await this.runs.findOneBy({ id: runId });
    if (!run) throw this.notFound('Evaluation run not found');
    return this.toRunView(run);
  }

  async listControlsAdmin(runId: string, query: EvaluationPageQueryDto) {
    await this.getAdmin(runId);
    return this.listControls(runId, query);
  }

  async listEvidenceAdmin(runId: string, query: EvaluationPageQueryDto) {
    await this.getAdmin(runId);
    return this.listEvidence(runId, query);
  }

  async listClaimsAdmin(runId: string, query: EvaluationPageQueryDto) {
    await this.getAdmin(runId);
    return this.listClaims(runId, query);
  }

  private async listControls(runId: string, query: EvaluationPageQueryDto) {
    const page = pageOf(query.page);
    const pageSize = pageSizeOf(query.pageSize);
    const [items, total] = await this.controls.findAndCount({
      where: { evaluationRunId: runId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, meta: { total, page, pageSize } };
  }

  private async listEvidence(runId: string, query: EvaluationPageQueryDto) {
    const page = pageOf(query.page);
    const pageSize = pageSizeOf(query.pageSize);
    let controlResultIds: string[] | undefined;
    if (query.controlId) {
      const controls = await this.controls.find({
        where: { evaluationRunId: runId, controlId: query.controlId },
      });
      controlResultIds = controls.map((control) => control.id);
      if (!controlResultIds.length)
        return { items: [], meta: { total: 0, page, pageSize } };
    }
    const queryBuilder = this.evidence
      .createQueryBuilder('evidence')
      .where('evidence.evaluation_run_id = :runId', { runId })
      .orderBy('evidence.createdAt', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (controlResultIds)
      queryBuilder.andWhere('evidence.control_result_id IN (:...ids)', {
        ids: controlResultIds,
      });
    const [items, total] = await queryBuilder.getManyAndCount();
    return { items, meta: { total, page, pageSize } };
  }

  private async listClaims(runId: string, query: EvaluationPageQueryDto) {
    const page = pageOf(query.page);
    const pageSize = pageSizeOf(query.pageSize);
    const [items, total] = await this.claims.findAndCount({
      where: { evaluationRunId: runId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, meta: { total, page, pageSize } };
  }

  private async creatorForRunScope(userId: string) {
    // Source resolution already has ownership behavior; a tiny lookup here is
    // deliberately generic so an account with no profile cannot enumerate runs.
    // Do not reach through another service's private repository. The canonical
    // creator profile remains the ownership anchor for every run/list query.
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM creator_profiles WHERE user_id=$1',
      [userId],
    );
    if (!rows[0]) throw this.notFound('Evaluation run not found');
    return { id: rows[0].id };
  }

  private toRunView(run: EvaluationRun) {
    return {
      id: run.id,
      agentId: run.agentId,
      agentVersionId: run.agentVersionId,
      reviewSubmissionId: run.reviewSubmissionId,
      runtimeId: run.runtimeId,
      runtimeReleaseId: run.runtimeReleaseId,
      policy: {
        id: run.policyId,
        key: run.policyKey,
        version: run.policyVersion,
      },
      engineVersion: run.engineVersion,
      profile: run.profile,
      risk: { level: run.riskLevel, factors: run.riskFactors },
      state: run.state,
      finalStatus: run.finalStatus,
      resultSummary: run.resultSummary,
      inputSnapshot: run.inputSnapshot,
      controlPlan: run.controlPlan,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  }

  private notFound(message: string): ApiException {
    return new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}
