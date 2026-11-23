import { Module } from '@nestjs/common';
import { PublicQueryCache } from './public-query-cache';

/** One shared instance (one LRU, one set of counters) for every importer. */
@Module({ providers: [PublicQueryCache], exports: [PublicQueryCache] })
export class PublicQueryCacheModule {}
