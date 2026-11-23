import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../../database/entities/agents/agent.entity';
import { AgentReviewSubmission } from '../../database/entities/agents/agent-review-submission.entity';
import { AgentVersion } from '../../database/entities/agents/agent-version.entity';
import { EvaluationClaimAssessment } from '../../database/entities/evaluation/evaluation-claim-assessment.entity';
import { EvaluationControlResult } from '../../database/entities/evaluation/evaluation-control-result.entity';
import { EvaluationEvidenceRecord } from '../../database/entities/evaluation/evaluation-evidence-record.entity';
import { EvaluationPolicy } from '../../database/entities/evaluation/evaluation-policy.entity';
import { EvaluationRun } from '../../database/entities/evaluation/evaluation-run.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { RuntimeConformanceRun } from '../../database/entities/runtime/runtime-conformance-run.entity';
import { RuntimeRegistration } from '../../database/entities/runtime/runtime-registration.entity';
import { RuntimeRelease } from '../../database/entities/runtime/runtime-release.entity';
import {
  AdminEvaluationsController,
  CreatorEvaluationsController,
} from './evaluation.controller';
import { EvaluationPolicyService } from './evaluation-policy.service';
import { EvaluationSourceService } from './evaluation-source.service';
import { TrustDisclosureService } from './trust-disclosure.service';
import { EvaluationService } from './evaluation.service';

/**
 * Owns only evaluation policy/run/result/evidence/claim history. It consumes
 * canonical Product, Runtime and review records by reference and never changes
 * their lifecycle, entitlement or monitoring authority.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agent,
      AgentVersion,
      AgentReviewSubmission,
      CreatorProfile,
      RuntimeRegistration,
      RuntimeRelease,
      RuntimeConformanceRun,
      EvaluationPolicy,
      EvaluationRun,
      EvaluationControlResult,
      EvaluationEvidenceRecord,
      EvaluationClaimAssessment,
    ]),
  ],
  controllers: [CreatorEvaluationsController, AdminEvaluationsController],
  providers: [
    EvaluationSourceService,
    EvaluationPolicyService,
    EvaluationService,
    TrustDisclosureService,
  ],
  exports: [EvaluationService, EvaluationPolicyService, TrustDisclosureService],
})
export class EvaluationModule {}
