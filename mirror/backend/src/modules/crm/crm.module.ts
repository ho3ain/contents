import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreatorLead } from '../../database/entities/crm/creator-lead.entity';
import { CreatorCrmNote } from '../../database/entities/crm/creator-crm-note.entity';
import { CreatorCrmAction } from '../../database/entities/crm/creator-crm-action.entity';
import {
  CreatorCrmTag,
  CreatorCrmRecordTag,
} from '../../database/entities/crm/creator-crm-tag.entity';
import { CreatorCrmSegment } from '../../database/entities/crm/creator-crm-segment.entity';
import { CreatorCrmSavedView } from '../../database/entities/crm/creator-crm-saved-view.entity';
import { CreatorAttribution } from '../../database/entities/crm/creator-attribution.entity';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmAttributionController } from './crm-attribution.controller';
import { CrmAttributionService } from './crm-attribution.service';
import { CrmController } from './crm.controller';
import { CrmEngagementService } from './crm-engagement.service';
import { CrmEventsService } from './crm-events.service';
import { CrmExportService } from './crm-export.service';
import { CrmLeadsService } from './crm-leads.service';
import { CrmRecordsService } from './crm-records.service';
import { CrmIntegrationService } from './crm-integration.service';
import {
  CrmAcquisitionService,
  CrmReferralService,
} from './crm-acquisition.service';
import { CrmConversionService } from './crm-conversion.service';
import { CrmImportService } from './crm-import.service';
import { CrmCapabilityGuard } from './crm-capability.guard';
import { EmailModule } from '../email/email.module';
import { CrmSegmentsService } from './crm-segments.service';

/**
 * Phase C1 — Creator Growth Infrastructure.
 *
 * Deliberately NOT global and NOT exporting the internal services: the
 * only services other modules may use are `CrmEventsService` (the single
 * writer of lifecycle events, used by auth / creators / commerce /
 * review-workflow) and `CrmAttributionService`'s two identity-resolution
 * entry points. Notes, actions, tags, segments and export stay inside this
 * module, so no creator-facing module can reach them (§17).
 */
@Module({
  imports: [
    // C2 — the conversion invite enqueues through the transactional email
    // service, which never throws into the business flow (§21).
    EmailModule,
    TypeOrmModule.forFeature([
      CreatorLead,
      CreatorCrmNote,
      CreatorCrmAction,
      CreatorCrmTag,
      CreatorCrmRecordTag,
      CreatorCrmSegment,
      CreatorCrmSavedView,
      CreatorAttribution,
    ]),
  ],
  controllers: [CrmController, CrmAttributionController],
  providers: [
    CrmRecordsService,
    CrmLeadsService,
    CrmEventsService,
    CrmEngagementService,
    CrmSegmentsService,
    CrmAnalyticsService,
    CrmExportService,
    CrmAttributionService,
    CrmIntegrationService,
    // C2 — acquisition conversation + referral graph. Module-local on
    // purpose: like the rest of the CRM internals they must not be
    // reachable from a creator-facing module (§17).
    CrmAcquisitionService,
    CrmReferralService,
    CrmConversionService,
    CrmImportService,
    CrmCapabilityGuard,
  ],
  exports: [CrmEventsService, CrmAttributionService, CrmIntegrationService],
})
export class CrmModule {}
