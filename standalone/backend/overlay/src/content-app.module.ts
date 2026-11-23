import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlogModule } from './modules/blog/blog.module';
import { SeoModule } from './modules/seo/seo.module';
import { ENTITIES } from './database/entities';

/**
 * Root module for the EXTRACTED content-production feature.
 *
 * This file is NOT part of the MESH source. It is scaffolding written for this
 * extract so that BlogModule + SeoModule can be booted on their own. Everything
 * under `src/modules/**` and `src/database/**` is a byte-identical copy of MESH
 * (verify with `_tools/verify_mirror.py`).
 *
 * ---------------------------------------------------------------------------
 * WHAT IS AND IS NOT VERIFIED
 * ---------------------------------------------------------------------------
 * Verified, with the exact commands in ../../VERIFICATION.md:
 *   * `tsc --noEmit` over the BlogModule + SeoModule import graph  -> exit 0
 *   * 12 backend unit suites / 123 tests                            -> exit 0
 *
 * NOT verified — no PostgreSQL instance was available in the extraction
 * environment, so none of the following was ever executed:
 *   * migrations running against a real database
 *   * this module actually booting
 *   * any end-to-end suite under `test/`
 * Treat the runtime wiring below as a reviewed starting point, not as a
 * tested artifact.
 *
 * ---------------------------------------------------------------------------
 * DELIBERATELY OMITTED vs the real MESH AppModule
 * ---------------------------------------------------------------------------
 * MESH registers three global guards (ThrottlerGuard, RolesGuard,
 * KillSwitchGuard) in `src/app.module.ts`. They are NOT registered here because
 * they belong to the auth/control-plane subsystem, not to the content feature.
 *
 * >> Consequence: with this module alone, routes that MESH protects with
 * >> `blog:view` / `blog:manage` / `blog:publish` are NOT protected.
 * >> Re-attach your own authentication and authorisation before exposing
 * >> `/admin/blog/**` or `/admin/seo/**` to anyone.
 *
 * The permission names the controllers expect are declared in
 * `src/modules/control-plane/authz/route-permissions.ts` (copied here).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number.parseInt(config.get<string>('DB_PORT', '5432'), 10),
        username: config.get<string>('DB_USERNAME', 'agenthub'),
        password: config.get<string>('DB_PASSWORD', 'agenthub'),
        database: config.get<string>('DB_NAME', 'agenthub'),
        entities: ENTITIES,
        migrations: [`${__dirname}/database/migrations/*.{ts,js}`],
        migrationsTableName: 'typeorm_migrations',
        // Never true. The extract ships real migrations; let them own the schema.
        synchronize: false,
        logging: false,
      }),
    }),
    BlogModule,
    SeoModule,
  ],
})
export class ContentAppModule {}
