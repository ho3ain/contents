import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BlogCategory,
  BlogComment,
  BlogCommentBan,
  BlogCommentLike,
  BlogCommentReport,
  BlogPost,
  BlogPostAgent,
  BlogPostRating,
  BlogPostMarketCategory,
  BlogPostRelation,
  BlogPostRevision,
  BlogPostTag,
  BlogSlugRedirect,
  BlogTag,
} from '../../database/entities/blog';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { SeoCoreModule } from '../seo/seo-core.module';
import { BlogAdminController } from './blog-admin.controller';
import { BlogCommentsAdminController } from './blog-comments-admin.controller';
import { BlogEngagementController } from './blog-engagement.controller';
import { BlogEngagementService } from './blog-engagement.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlogPostsService } from './blog-posts.service';
import { BlogPublicController } from './blog-public.controller';
import { BlogPublicService } from './blog-public.service';
import { BlogTaxonomyService } from './blog-taxonomy.service';

/**
 * Blog platform — editorial content integrated with the marketplace.
 * Public reads live under `/blog/**`, the CMS under `/admin/blog/**`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BlogCategory,
      BlogTag,
      BlogPost,
      BlogPostTag,
      BlogPostRelation,
      BlogPostAgent,
      BlogPostMarketCategory,
      BlogSlugRedirect,
      BlogPostRevision,
      BlogPostRating,
      BlogComment,
      BlogCommentLike,
      BlogCommentReport,
      BlogCommentBan,
    ]),
    AuditModule,
    StorageModule,
    SeoCoreModule,
    NotificationsModule,
  ],
  controllers: [
    BlogPublicController,
    BlogEngagementController,
    BlogAdminController,
    BlogCommentsAdminController,
  ],
  providers: [
    BlogTaxonomyService,
    BlogPostsService,
    BlogPublicService,
    BlogEngagementService,
  ],
  exports: [BlogPublicService, BlogPostsService],
})
export class BlogModule {}
