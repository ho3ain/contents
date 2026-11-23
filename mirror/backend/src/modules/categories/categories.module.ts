import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../../database/entities/catalog/category.entity';
import { AgentCategory } from '../../database/entities/agents/agent-category.entity';
import { Permission } from '../../database/entities/catalog/permission.entity';
import { Integration } from '../../database/entities/catalog/integration.entity';
import { Industry } from '../../database/entities/catalog/industry.entity';
import { AgentIndustry } from '../../database/entities/agents/agent-industry.entity';
import { PublicQueryCacheModule } from '../../common/cache/public-query-cache.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { IndustriesService } from './industries.service';
import { TaxonomyAdminService } from './taxonomy-admin.service';

@Module({
  imports: [
    PublicQueryCacheModule,
    TypeOrmModule.forFeature([
      Category,
      AgentCategory,
      Permission,
      Integration,
      Industry,
      AgentIndustry,
    ]),
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService, IndustriesService, TaxonomyAdminService],
  exports: [CategoriesService, IndustriesService, TaxonomyAdminService],
})
export class CategoriesModule {}
