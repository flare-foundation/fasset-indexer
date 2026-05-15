import { Injectable, Inject } from '@nestjs/common'
import { DashboardAnalytics } from '../analytics/dashboard'
import type { ApiContext } from '../config/context'


@Injectable()
export class DashboardService extends DashboardAnalytics {

  constructor(@Inject('apiContext') config: ApiContext) {
    super(config.orm, config.chain, config.loader.addressesJson, config.loader.deployment)
  }
}