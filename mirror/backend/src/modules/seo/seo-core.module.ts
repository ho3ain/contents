import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ContentLink,
  ContentSeo,
  LinkSuggestion,
} from '../../database/entities/seo';
import { ContentLinksService } from './content-links.service';
import { ContentSeoService } from './content-seo.service';

/**
 * Shared SEO foundation used by the blog module (link sync on save, public
 * metadata) and by the SEO studio routes. Deliberately imports NO feature
 * module so it can sit underneath all of them.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ContentSeo, ContentLink, LinkSuggestion]),
  ],
  providers: [ContentLinksService, ContentSeoService],
  exports: [ContentLinksService, ContentSeoService, TypeOrmModule],
})
export class SeoCoreModule {}
