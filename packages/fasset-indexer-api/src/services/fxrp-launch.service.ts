import { Injectable, Inject } from '@nestjs/common'
import { FxrpLaunchAnalytics } from '../analytics/fxrp-launch'
import type { ApiContext } from '../config/context'


@Injectable()
export class FxrpLaunchService extends FxrpLaunchAnalytics {

  constructor(@Inject('apiContext') config: ApiContext) {
    super(config.orm, config.chain, config.loader.addressesJson)
  }
}