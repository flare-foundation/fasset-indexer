import { FAssetType } from "fasset-indexer-core"
import { EntityManager, raw } from "fasset-indexer-core/orm"
import * as Entities from "fasset-indexer-core/entities"
import { DashboardAnalytics } from "./dashboard"
import type { FAssetValueResult } from "./interface"

export class FxrpLaunchAnalytics extends DashboardAnalytics {

  public mintedByUserFromTimestamp(user: string, from: number): Promise<FAssetValueResult> {
    return this._mintedByUserFromTimestamp(this.orm.em.fork(), user, from)
  }

  protected async _mintedByUserFromTimestamp(em: EntityManager, user: string, from: number): Promise<FAssetValueResult> {
    const minted = await em.createQueryBuilder(Entities.MintingExecuted, 'me')
      .select(['me.fasset', raw('sum(cr.value_uba) as value')])
      .join('me.collateralReserved', 'cr')
      .join('me.evmLog', 'el')
      .join('el.block', 'block')
      .join('cr.minter', 'cm')
      .where({ 'block.timestamp': { $gte: from }, 'cm.hex': user })
      .groupBy('fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    return this.convertOrmResultToFAssetValueResult(minted, 'value')
  }
}