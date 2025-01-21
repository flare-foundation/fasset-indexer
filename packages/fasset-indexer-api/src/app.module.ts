import { Module } from '@nestjs/common'
import { CacheModule } from '@nestjs/cache-manager'
import { DashboardService } from './services/dashboard.service'
import { NotificationService } from './services/notification.service'
import { MetadataService } from './services/metadata.service'
import { StatisticsService } from './services/statistics.service'
import { NotificationController } from './controllers/notification.controller'
import { DashboardController } from './controllers/dashboard.controller'
import { StatisticsController } from './controllers/statistics.controller'
import { MetadataController } from './controllers/metadata.controller'
import { ApiConfigLoader } from './config/config'
import { ApiContext } from './config/context'
import { CACHE_MAX_ENTRIES, CACHE_TTL_MS } from './config/constants'


const apiContextProvider = {
  provide: "apiContext",
  useFactory: async () => {
    const apiConfig = new ApiConfigLoader()
    return ApiContext.create(apiConfig)
  }
}

@Module({
  imports: [CacheModule.register({ ttl: CACHE_TTL_MS, max: CACHE_MAX_ENTRIES })],
  controllers: [DashboardController, NotificationController, MetadataController, StatisticsController],
  providers: [apiContextProvider, DashboardService, NotificationService, MetadataService, StatisticsService]
})
export class FAssetIndexerModule {}
