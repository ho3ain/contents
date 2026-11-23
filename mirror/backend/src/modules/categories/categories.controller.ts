import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCache } from '../../common/decorators/public-cache.decorator';
import { PublicQueryCache } from '../../common/cache/public-query-cache';
import { CategoriesService, CategoryWithCount } from './categories.service';
import { IndustriesService, IndustryWithCount } from './industries.service';
import { Permission } from '../../database/entities/catalog/permission.entity';
import { Integration } from '../../database/entities/catalog/integration.entity';

@ApiTags('catalog')
@Controller()
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly industriesService: IndustriesService,
    private readonly queryCache: PublicQueryCache,
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
    @InjectRepository(Integration)
    private readonly integrationsRepository: Repository<Integration>,
  ) {}

  @Get('categories')
  @Public()
  @PublicCache('reference')
  @ApiOperation({
    summary: 'List marketplace categories with published-agent counts',
  })
  list(): Promise<CategoryWithCount[]> {
    // The per-category counts scan every agent↔category link (~40 ms at 20k
    // listings, 8 rows out) and the list is requested on every page view; the
    // 60 s `reference` HTTP policy already tolerates this staleness.
    return this.queryCache.get('categories', {}, () =>
      this.categoriesService.listActive(),
    );
  }

  @Get('industries')
  @Public()
  @PublicCache('reference')
  @ApiOperation({
    summary: 'List active industries with published-agent counts',
  })
  industries(): Promise<IndustryWithCount[]> {
    return this.queryCache.get('industries', {}, () =>
      this.industriesService.listActive(),
    );
  }

  @Get('reference/permissions')
  @Public()
  @PublicCache('reference')
  @ApiOperation({
    summary: 'The permission taxonomy listing editors declare against',
  })
  permissions() {
    return this.permissionsRepository.find({ order: { code: 'ASC' } });
  }

  @Get('reference/integrations')
  @Public()
  @PublicCache('reference')
  @ApiOperation({
    summary: 'The integration catalog listing editors declare against',
  })
  integrations() {
    return this.integrationsRepository.find({ order: { name: 'ASC' } });
  }
}
