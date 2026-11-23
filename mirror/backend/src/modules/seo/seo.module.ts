import { Module } from '@nestjs/common';
import { BlogModule } from '../blog/blog.module';
import { CategoriesModule } from '../categories/categories.module';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { LinkSuggestionsService } from './link-suggestions.service';
import { SeoAdminController } from './seo-admin.controller';
import { SeoController } from './seo.controller';
import { SeoCoreModule } from './seo-core.module';
import { SeoService } from './seo.service';
import { SeoRenderService } from './seo-render.service';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [SeoCoreModule, BlogModule, CategoriesModule, AgentsModule],
  controllers: [SeoController, SeoAdminController],
  providers: [
    SeoService,
    SeoRenderService,
    KnowledgeGraphService,
    LinkSuggestionsService,
  ],
})
export class SeoModule {}
