import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuntimeRegistration } from '../../database/entities/runtime/runtime-registration.entity';
import { RuntimeCredential } from '../../database/entities/runtime/runtime-credential.entity';
import { RuntimeRelease } from '../../database/entities/runtime/runtime-release.entity';
import { RuntimeEvent } from '../../database/entities/runtime/runtime-event.entity';
import { RuntimeConformanceRun } from '../../database/entities/runtime/runtime-conformance-run.entity';
import { Agent } from '../../database/entities/agents/agent.entity';
import { AgentVersion } from '../../database/entities/agents/agent-version.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { TechnicalReviewModule } from '../technical-review/technical-review.module';
import { CommerceModule } from '../commerce/commerce.module';
import { FinanceModule } from '../finance/finance.module';
import {
  CreatorRuntimesController,
  AdminRuntimesController,
  RuntimeConnectorController,
  RuntimeGatewayController,
} from './runtime.controller';
import { RuntimesService } from './runtimes.service';
import { RuntimeGatewayService } from './runtime-gateway.service';
import { ManagedRuntimeService } from './managed-runtime.service';
import { ConnectorClientService } from './connector-client.service';
import { GatewayAssertionService } from './gateway-assertion.service';

@Module({
  imports: [
    CommerceModule,
    FinanceModule,
    TechnicalReviewModule,
    TypeOrmModule.forFeature([
      RuntimeRegistration,
      RuntimeCredential,
      RuntimeRelease,
      RuntimeEvent,
      RuntimeConformanceRun,
      Agent,
      AgentVersion,
      CreatorProfile,
    ]),
  ],
  controllers: [
    CreatorRuntimesController,
    AdminRuntimesController,
    RuntimeConnectorController,
    RuntimeGatewayController,
  ],
  providers: [
    RuntimesService,
    RuntimeGatewayService,
    ManagedRuntimeService,
    ConnectorClientService,
    GatewayAssertionService,
  ],
  // Monitoring consumes these bounded, validated probes; Runtime never imports
  // Monitoring, which keeps lifecycle authority and the dependency graph one-way.
  exports: [
    RuntimesService,
    RuntimeGatewayService,
    ManagedRuntimeService,
    ConnectorClientService,
  ],
})
export class RuntimeModule {}
