import { Module } from '@nestjs/common';
import { AuthHousekeepingService } from './auth-housekeeping.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserVerification } from '../../database/entities/identity/user-verification.entity';
import { UserSession } from '../../database/entities/identity/user-session.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokensService } from './auth-tokens.service';
import { AuthSessionsService } from './auth-sessions.service';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorController } from './two-factor.controller';
import { LoginAttemptsService } from './login-attempts.service';
import { VerificationSenderService } from './verification-sender.service';
import { EmailModule } from '../email/email.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSession, UserVerification]),
    EmailModule,
    CrmModule,
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    AuthTokensService,
    AuthSessionsService,
    VerificationSenderService,
    LoginAttemptsService,
    TwoFactorService,
    AuthHousekeepingService,
  ],
  exports: [
    AuthTokensService,
    AuthSessionsService,
    LoginAttemptsService,
    TwoFactorService,
  ],
})
export class AuthModule {}
