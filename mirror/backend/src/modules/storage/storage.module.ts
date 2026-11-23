import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAsset } from '../../database/entities/platform/media-asset.entity';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { LocalStorageProvider, STORAGE_PROVIDER } from './storage.provider';

/**
 * Gap closure — media storage abstraction. The provider token resolves to
 * null when STORAGE_DRIVER=none (the default): uploads answer 503
 * STORAGE_DISABLED and the product keeps its URL fields.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MediaAsset])],
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('storageDriver') === 'local'
          ? new LocalStorageProvider(
              config.getOrThrow<string>('storageLocalDir'),
            )
          : null,
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
