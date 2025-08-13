import { Injectable, Inject } from '@nestjs/common'
import { AgentStatistics } from '../analytics/statistics'
import type { ApiContext } from '../config/context'


@Injectable()
export class StatisticsService extends AgentStatistics {

  constructor(@Inject('apiContext') context: ApiContext) {
    super(context.orm)
  }
}