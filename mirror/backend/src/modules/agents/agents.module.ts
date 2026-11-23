import { Module } from '@nestjs/common';
import { SeoCoreModule } from '../seo/seo-core.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../../database/entities/agents/agent.entity';
import { AgentVersion } from '../../database/entities/agents/agent-version.entity';
import { AgentCategory } from '../../database/entities/agents/agent-category.entity';
import { AgentPermission } from '../../database/entities/agents/agent-permission.entity';
import { AgentIntegration } from '../../database/entities/agents/agent-integration.entity';
import { AgentRequirement } from '../../database/entities/agents/agent-requirement.entity';
import { AgentDataPolicy } from '../../database/entities/agents/agent-data-policy.entity';
import { AgentVerification } from '../../database/entities/agents/agent-verification.entity';
import { Review } from '../../database/entities/reviews/review.entity';
import { Entitlement } from '../../database/entities/commerce/entitlement.entity';
import { AgentsController } from './agents.controller';
import { AgentSearchController } from './search/agent-search.controller';
import { AgentSearchService } from './search/agent-search.service';
import { EvaluationModule } from '../evaluation-engine/evaluation.module';
import { PublicQueryCacheModule } from '../../common/cache/public-query-cache.module';
import { AgentsService } from './agents.service';
import { AuthModule } from '../auth/auth.module';
import { RuntimeModule } from '../runtime/runtime.module';

@Module({
  imports: [
    EvaluationModule,
    PublicQueryCacheModule,
    SeoCoreModule,
    TypeOrmModule.forFeature([
      Agent,
      AgentVersion,
      AgentCategory,
      AgentPermission,
      AgentIntegration,
      AgentRequirement,
      AgentDataPolicy,
      AgentVerification,
      Review,
      Entitlement,
    ]),
    AuthModule,
    RuntimeModule,
  ],
  // AgentSearchController first: its literal routes must precede `:slug`.
  controllers: [AgentSearchController, AgentsController],
  providers: [AgentsService, AgentSearchService],
  exports: [AgentsService, AgentSearchService],
})
export class AgentsModule {}
