import { Injectable, Inject } from '@nestjs/common'
import { VisualiserAnalytics } from '../analytics/visualiser'
import type { ApiContext } from '../config/context'


@Injectable()
export class VisualiserService extends VisualiserAnalytics {

  constructor(@Inject('apiContext') config: ApiContext) {
    super(config.orm, config.chain, config.loader.addressesJson, config.loader.deployment)
  }
}
