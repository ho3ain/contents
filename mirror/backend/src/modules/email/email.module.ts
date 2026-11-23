import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailMessage } from '../../database/entities/platform/email-message.entity';
import { User } from '../../database/entities/identity/user.entity';
import { EmailService } from './email.service';
import { SecurityAlertsService } from './security-alerts.service';

/**
 * Transactional email (Batch 10 — Phase 19): template rendering, delivery
 * state persistence and bounded retry. The transport (console | smtp) is
 * selected inside EmailService from the VALIDATED config so a single
 * provider token is exported to consumers.
 */
@Module({
  imports: [TypeOrmModule.forFeature([EmailMessage, User])],
  providers: [EmailService, SecurityAlertsService],
  exports: [EmailService, SecurityAlertsService],
})
export class EmailModule {}
