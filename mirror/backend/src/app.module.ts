import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { KillSwitchGuard } from './modules/control-plane/config/kill-switch.guard';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SafeTypeOrmLogger } from './database/safe-typeorm-logger';
import { MigrationsBootGuard } from './database/migrations-boot.guard';
import { buildDbSsl } from './database/ssl';
import { loadEnvironment } from './config/env.validation';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditModule } from './modules/audit/audit.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CreatorsModule } from './modules/creators/creators.module';
import { ReviewWorkflowModule } from './modules/review-workflow/review-workflow.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { BuyerJourneyModule } from './modules/buyer-journey/buyer-journey.module';
import { GrowthModule } from './modules/growth/growth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AgentsModule } from './modules/agents/agents.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { RuntimeModule } from './modules/runtime/runtime.module';
import { FinanceModule } from './modules/finance/finance.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { EvaluationModule } from './modules/evaluation-engine/evaluation.module';
import { ReleaseGateModule } from './modules/release-gate/release-gate.module';
import { TechnicalReviewModule } from './modules/technical-review/technical-review.module';
import { AdminModule } from './modules/admin/admin.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { TrustModule } from './modules/trust/trust.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SupportModule } from './modules/support/support.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { CrmModule } from './modules/crm/crm.module';
import { ActivationModule } from './modules/activation/activation.module';
import { CreatorOpportunitiesModule } from './modules/creator-opportunities/creator-opportunities.module';
import { SuccessModule } from './modules/success/success.module';
import { BlogModule } from './modules/blog/blog.module';
import { SeoModule } from './modules/seo/seo.module';
import { ScaleModule } from './modules/scale/scale.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { StorageModule } from './modules/storage/storage.module';
import { ControlPlaneModule } from './modules/control-plane/control-plane.module';
import { ModerationModule } from './modules/control-plane/moderation/moderation.module';
import { DataOpsModule } from './modules/control-plane/data-ops/data-ops.module';
import { AdminAnalyticsModule } from './modules/control-plane/analytics/analytics.module';
import { User360Module } from './modules/control-plane/user360/user360.module';
import { RiskModule } from './modules/control-plane/risk/risk.module';
import { SupportOpsModule } from './modules/control-plane/support-ops/support-ops.module';
import { PayoutOpsModule } from './modules/control-plane/payout-ops/payout-ops.module';
import { RolesGuard } from './common/guards/roles.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: loadEnvironment,
    }),
    CryptoModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        // All keys are read from the VALIDATED environment object
        // (loadEnvironment): when ConfigModule.forRoot({ validate }) is used,
        // the validated return value replaces the config store, so the raw
        // SCREAMING_SNAKE_CASE env names are not resolvable via ConfigService.
        host: config.getOrThrow<string>('dbHost'),
        port: config.getOrThrow<number>('dbPort'),
        username: config.getOrThrow<string>('dbUsername'),
        password: config.getOrThrow<string>('dbPassword'),
        database: config.getOrThrow<string>('dbName'),
        // Read the VALIDATED value (loadEnvironment): the raw DB_SSL env var
        // is the string 'false', which is truthy and wrongly enables SSL.
        ssl: buildDbSsl(
          {
            enabled: config.getOrThrow<boolean>('dbSsl'),
            ca: config.get<string>('dbSslCa'),
            rejectUnauthorized: config.getOrThrow<boolean>(
              'dbSslRejectUnauthorized',
            ),
          },
          (message) => new Logger('Database').warn(message),
        ),
        // Pool bounds and ceilings: without a connection timeout an exhausted
        // pool makes requests hang forever instead of failing fast (503).
        extra: {
          max: config.getOrThrow<number>('dbPoolMax'),
          connectionTimeoutMillis: config.getOrThrow<number>(
            'dbConnectionTimeoutMs',
          ),
          ...(config.getOrThrow<number>('dbStatementTimeoutMs') > 0
            ? {
                statement_timeout: config.getOrThrow<number>(
                  'dbStatementTimeoutMs',
                ),
              }
            : {}),
        },
        // TypeORM's default logger prints "-- PARAMETERS: [...]" for a failed
        // query — i.e. user data, hashes and tokens — as raw text on stdout.
        logger: new SafeTypeOrmLogger(),
        maxQueryExecutionTime:
          config.getOrThrow<number>('dbSlowQueryMs') || undefined,
        autoLoadEntities: true,
        // Same migration set and table as the CLI data source. Without this
        // list `dataSource.showMigrations()` always answers "nothing pending",
        // so neither /health/ready nor the boot guard could notice a database
        // that is behind the code (symptom: 500 on every query touching a new
        // column). Nothing runs implicitly — see MigrationsBootGuard.
        migrations: [`${__dirname}/database/migrations/*.{ts,js}`],
        migrationsTableName: 'typeorm_migrations',
        migrationsRun: false,
        synchronize: false,
        retryAttempts: 5,
        retryDelay: 1000,
        logging:
          config.get<string>('nodeEnv') === 'development'
            ? ['error', 'warn']
            : ['error'],
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwtAccessSecret'),
        signOptions: {
          expiresIn: config.getOrThrow<number>('jwtAccessTtlSeconds'),
          issuer: config.getOrThrow<string>('jwtIssuer'),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.getOrThrow<number>('rateLimitTtlSeconds') * 1000,
          limit: config.getOrThrow<number>('rateLimitMax'),
        },
      ],
    }),

    AuditModule,
    UsersModule,
    AuthModule,
    // Phase 3 — global (authorizer + audit writer). Imported BEFORE feature
    // modules; routes live under /admin/security and /admin/governance.
    ControlPlaneModule,
    PayoutOpsModule,
    ModerationModule,
    SupportOpsModule,
    RiskModule,
    User360Module,
    AdminAnalyticsModule,
    DataOpsModule,
    // ReviewsModule MUST be imported before CreatorsModule: its literal route
    // GET /creators/me/agents/reviews would otherwise be captured by
    // CreatorAgentsController's GET /creators/me/agents/:id (Express matches
    // routes strictly in registration order), 500-ing on the non-UUID param.
    ReviewsModule,
    // Phase A3 review workflow (owns POST creators/me/agents/:id/submit and
    // POST admin/agents/:id/review); registered before CreatorsModule so its
    // literal routes are matched first.
    ReviewWorkflowModule,
    AnalyticsModule,
    DiscoveryModule,
    GrowthModule,
    CreatorsModule,
    CategoriesModule,
    AgentsModule,
    EngagementModule,
    StorageModule,
    CommerceModule,
    // Phase 3 Runtime & Hosting: registry, connector identity and protected gateway.
    RuntimeModule,
    // Phase 2 — policy, immutable ledger, balances, refunds, payouts, KYC.
    FinanceModule,
    // Phase 5 — evidence-based Runtime monitoring; consumes Runtime/finance,
    // moderation, notification and audit authorities without replacing them.
    MonitoringModule,
    // Phase 7 Epic 1 — versioned automated evaluation evidence. It does not
    // make review/publication decisions or run creator artifacts.
    EvaluationModule,
    // Phase 7 Epic 2 — additive human technical-review overlay; no publish authority.
    TechnicalReviewModule,
    // Phase 7 Epic 3 — exact-anchor server-side release authorization.
    ReleaseGateModule,
    BuyerJourneyModule,
    AdminModule,
    TrustModule,
    NotificationsModule,
    SupportModule,
    HealthModule,
    JobsModule,
    // Phase C1 — Creator CRM. Registered AFTER CreatorsModule so the
    // literal /admin/crm routes win over nothing, and so the module's own
    // dependencies (analytics, audit, notifications) are already global.
    CrmModule,
    // Phase C3 — Creator Activation. Registered AFTER CrmModule because it
    // reads and writes C1's event ledger rather than declaring its own.
    ActivationModule,
    // Creator Ideas: separate Admin-authored opportunity delivery from the
    // Creator-owned CreatorIdea activation flow.
    CreatorOpportunitiesModule,
    // Phase C4 — Creator Success. Also after CrmModule: it writes the same
    // ledger, and CommerceModule is imported by SuccessModule for the
    // optional sale hook, so the order here is load-bearing.
    SuccessModule,
    // Blog platform — editorial content (public /blog/**, CMS /admin/blog/**).
    BlogModule,
    SeoModule,
    // Phase C5 — SCALE. Last, and for the same reason as C4: it reads C1's
    // event ledger, C2's lead table, C4's referral table and A1's order
    // table, and every one of those modules must be initialised first.
    ScaleModule,
  ],
  // Multiple APP_GUARD bindings are honored by NestJS and run in order:
  // throttling first (protects anonymous endpoints like login too), then
  // authentication + role enforcement. ThrottlerGuard must be registered
  // explicitly here — ThrottlerModule.forRoot does not register it in v6.
  providers: [
    MigrationsBootGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: KillSwitchGuard },
  ],
})
export class AppModule {}
