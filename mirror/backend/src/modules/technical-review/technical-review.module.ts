import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentReviewSubmission } from '../../database/entities/agents/agent-review-submission.entity';
import { EvaluationClaimAssessment } from '../../database/entities/evaluation/evaluation-claim-assessment.entity';
import { EvaluationControlResult } from '../../database/entities/evaluation/evaluation-control-result.entity';
import { EvaluationEvidenceRecord } from '../../database/entities/evaluation/evaluation-evidence-record.entity';
import { EvaluationRun } from '../../database/entities/evaluation/evaluation-run.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { TechnicalReviewAssignment } from '../../database/entities/technical-review/technical-review-assignment.entity';
import { TechnicalReviewCase } from '../../database/entities/technical-review/technical-review-case.entity';
import { TechnicalReviewControlReview } from '../../database/entities/technical-review/technical-review-control-review.entity';
import { TechnicalReviewCreatorResponse } from '../../database/entities/technical-review/technical-review-creator-response.entity';
import { TechnicalReviewDecision } from '../../database/entities/technical-review/technical-review-decision.entity';
import { TechnicalReviewEvent } from '../../database/entities/technical-review/technical-review-event.entity';
import { TechnicalReviewFinding } from '../../database/entities/technical-review/technical-review-finding.entity';
import { ReviewAccessGrant } from '../../database/entities/technical-review/review-access-grant.entity';
import { RuntimeRegistration } from '../../database/entities/runtime/runtime-registration.entity';
import { AuditModule } from '../audit/audit.module';
import { ReviewAccessService } from './review-access.service';
import { AdminTechnicalReviewsController } from './admin-technical-reviews.controller';
import { CreatorTechnicalReviewsController } from './creator-technical-reviews.controller';
import { TechnicalReviewService } from './technical-review.service';

/** Additive Human Review authority over immutable EvaluationRun evidence. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreatorProfile,
      AgentReviewSubmission,
      EvaluationRun,
      EvaluationControlResult,
      EvaluationEvidenceRecord,
      EvaluationClaimAssessment,
      TechnicalReviewCase,
      TechnicalReviewAssignment,
      TechnicalReviewControlReview,
      TechnicalReviewFinding,
      TechnicalReviewCreatorResponse,
      TechnicalReviewDecision,
      TechnicalReviewEvent,
      ReviewAccessGrant,
      RuntimeRegistration,
    ]),
    AuditModule,
  ],
  controllers: [
    CreatorTechnicalReviewsController,
    AdminTechnicalReviewsController,
  ],
  providers: [TechnicalReviewService, ReviewAccessService],
  exports: [TechnicalReviewService, ReviewAccessService],
})
export class TechnicalReviewModule {}
