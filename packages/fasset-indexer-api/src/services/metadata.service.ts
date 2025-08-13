import { Injectable, Inject } from '@nestjs/common'
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { MetadataAnalytics } from '../analytics/metadata'
import type { ApiContext } from '../config/context'


@Injectable()
export class MetadataService extends MetadataAnalytics {

  constructor(
    @Inject('apiContext') context: ApiContext,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {
    super(context.orm)
  }

  keys(): Promise<string[]> {
    return this.cacheManager.store.keys()
  }
}