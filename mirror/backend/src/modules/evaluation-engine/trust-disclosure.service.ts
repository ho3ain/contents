import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Agent,
  AgentStatus,
} from '../../database/entities/agents/agent.entity';
import { EvaluationClaimAssessment } from '../../database/entities/evaluation/evaluation-claim-assessment.entity';
import { EvaluationControlResult } from '../../database/entities/evaluation/evaluation-control-result.entity';
import { EvaluationRun } from '../../database/entities/evaluation/evaluation-run.entity';
import {
  buildTrustDisclosure,
  type TrustDisclosure,
} from './domain/trust-disclosure';

/**
 * Public, buyer-facing verification disclosure.
 *
 * Disclosure rules enforced here, not in the UI:
 *  - only a PUBLISHED agent is described at all;
 *  - only the evaluation bound to the PUBLISHED version is read, so a buyer
 *    never sees evidence about a draft or a rejected attempt;
 *  - control REASONS and evidence VALUES are never returned, only aggregate
 *    counts, because a failure reason can describe an exploitable weakness;
 *  - no finding, no reviewer note, no internal identifier and no endpoint;
 *  - nothing is ever summarised as "secure" or "guaranteed".
 */
@Injectable()
export class TrustDisclosureService {
  constructor(
    @InjectRepository(Agent)
    private readonly agents: Repository<Agent>,
    @InjectRepository(EvaluationRun)
    private readonly runs: Repository<EvaluationRun>,
    @InjectRepository(EvaluationControlResult)
    private readonly controls: Repository<EvaluationControlResult>,
    @InjectRepository(EvaluationClaimAssessment)
    private readonly claims: Repository<EvaluationClaimAssessment>,
  ) {}

  async forSlug(slug: string): Promise<TrustDisclosure> {
    const agent = await this.agents.findOne({ where: { slug } });

    // An unpublished or missing product discloses nothing, and says so in the
    // same shape, so the UI cannot accidentally imply verification.
    if (
      !agent ||
      agent.status !== AgentStatus.PUBLISHED ||
      !agent.publishedVersionId
    ) {
      return buildTrustDisclosure({
        published: false,
        run: null,
        controls: [],
        claims: [],
      });
    }

    const run = await this.runs.findOne({
      where: {
        agentId: agent.id,
        agentVersionId: agent.publishedVersionId,
        state: 'Completed',
      },
      order: { createdAt: 'DESC' },
    });

    if (!run) {
      return buildTrustDisclosure({
        published: true,
        run: null,
        controls: [],
        claims: [],
      });
    }

    const [controls, claims] = await Promise.all([
      this.controls.find({ where: { evaluationRunId: run.id } }),
      this.claims.find({ where: { evaluationRunId: run.id } }),
    ]);

    return buildTrustDisclosure({ published: true, run, controls, claims });
  }
}
