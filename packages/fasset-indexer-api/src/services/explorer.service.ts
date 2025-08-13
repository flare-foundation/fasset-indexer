import { Injectable, Inject } from '@nestjs/common'
import { ExplorerAnalytics } from "../analytics/explorer"
import type { ApiContext } from '../config/context'


@Injectable()
export class ExplorerService extends ExplorerAnalytics {

  constructor(@Inject('apiContext') config: ApiContext) {
    super(config.orm, config.chain, config.loader.addressesJson)
  }
}