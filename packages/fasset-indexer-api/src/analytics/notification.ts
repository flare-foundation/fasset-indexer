import { createOrm } from "fasset-indexer-core/orm"
import * as Entities from "fasset-indexer-core/entities"
import { ConfigLoader, FAssetType } from "fasset-indexer-core"
import { unixnow } from "../shared/utils"
import { UNFINALIZED_DOGE_REDEMPTIONS } from "./utils/raw-sql"
import { EVENTS } from "fasset-indexer-core/config"
import type { ORM } from "fasset-indexer-core/orm"


export class NotificationAnalytics {
  constructor(public readonly orm: ORM) {}

  async create(loader: ConfigLoader): Promise<NotificationAnalytics> {
    const orm = await createOrm(loader.dbConfig, 'safe')
    return new NotificationAnalytics(orm)
  }

  ////////////////////////////////////////////////////////////////////////////
  // underlying connectors

  async getRedemptionPaymentStatus(redemptionId: number, fasset: FAssetType): Promise<any> {
    const em = this.orm.em.fork()
    const redemption = await em.findOneOrFail(Entities.RedemptionRequested,
      { requestId: redemptionId, fasset })
    const succeeded = await em.findOne(Entities.RedemptionPerformed,
      { redemptionRequested: redemption }, { populate: ['evmLog.block'] })
    if (succeeded != null) return succeeded
    const defaulted = await em.findOne(Entities.RedemptionDefault,
      { redemptionRequested: redemption }, { populate: ['evmLog.block'] })
    if (defaulted != null) return defaulted
    const underlying = await em.findOne(Entities.UnderlyingVoutReference,
      { reference: redemption.paymentReference, fasset }, { populate: ['block'] })
    if (underlying != null) return underlying
    return null
  }

  async unhandledDogeRedemptions(startTime: number, limit = 100): Promise<any> {
    const em = this.orm.em.fork()
    const result = await em.getConnection('read').execute(UNFINALIZED_DOGE_REDEMPTIONS, [startTime, limit]) as {
      fasset: string, name: string, hex: string, request_id: string, index: number, timestamp: number
    }[]
    return result.map(x => ({ ...x, diff: unixnow() - x.timestamp }))
  }

  //////////////////////////////////////////////////////////////////////
  // system health

  async totalFreeLots(): Promise<{
    publicLots: bigint,
    privateLots: bigint,
    liquidationLots: bigint,
    normalLots: bigint
  }> {
    const publicLots = await this._totalFreeLots(true)
    const privateLots = await this._totalFreeLots(false)
    const liquidationLots = await this._totalFreeLots(undefined, true)
    const normalLots = await this._totalFreeLots(undefined, false)
    return { publicLots, privateLots, liquidationLots, normalLots }
  }

  private async _totalFreeLots(publicAgents?: boolean, inLiquidation?: boolean): Promise<bigint> {
    const publicFilter = (publicAgents !== undefined) ? `AND avi.publicly_available = ${publicAgents}` : ""
    const liquidationFilter = (inLiquidation !== undefined) ? `AND avi.status ${inLiquidation ? `> 0`: `= 0`}` : ""
    const em = this.orm.em.fork()
    const result = await em.getConnection('read').execute(`
      SELECT SUM(avi.free_collateral_lots) as total
      FROM agent_vault_info avi
      INNER JOIN agent_vault av ON avi.agent_vault_address_id = av.address_id
      WHERE av.destroyed = FALSE ${publicFilter} ${liquidationFilter}
    `)
    return result[0].total
  }

  async agentsInLiquidation(): Promise<[number, number]> {
    const nAgentsInLiquidation = await this.orm.em.fork().count(Entities.AgentVaultInfo, { status: 2 })
    const nAgents = await this.orm.em.fork().count(Entities.AgentVaultInfo)
    return [nAgentsInLiquidation, nAgents]
  }

  async eventsPerInterval(seconds: number = 60): Promise<number> {
    return this.orm.em.fork().count(Entities.EvmLog, { block: { timestamp: { $gt: Date.now() / 1000 - seconds }}})
  }

  async fullLiquidationReason(agent: string): Promise<
    Entities.IllegalPaymentConfirmed |
    Entities.DuplicatePaymentConfirmed |
    Entities.UnderlyingBalanceTooLow |
    null
  > {
    const em = this.orm.em.fork()
    const illegal = await em.findOne(Entities.IllegalPaymentConfirmed,
      { agentVault: { address: { hex: agent }}},
      { populate: ['evmLog.block', 'agentVault.address', 'agentVault.underlyingAddress'] }
    )
    if (illegal) return illegal
    const duplicate = await em.findOne(Entities.DuplicatePaymentConfirmed,
      { agentVault: { address: { hex: agent }}},
      { populate: ['evmLog.block', 'agentVault.address', 'agentVault.underlyingAddress'] }
    )
    if (duplicate) return duplicate
    const balance = await em.findOne(Entities.UnderlyingBalanceTooLow,
      { agentVault: { address: { hex: agent }}},
      { populate: ['evmLog.block', 'agentVault.address', 'agentVault.underlyingAddress'] }
    )
    return balance
  }

  async lastCollateralPoolClaim(pool: string): Promise<number> {
    const last = await this.orm.em.fork().find(Entities.EvmLog,
      { name: EVENTS.COLLATERAL_POOL.EXIT, address: { hex: pool }},
      { orderBy: { block: 'desc' }, populate: ['block'], limit: 1 }
    )
    return last[0]?.block.timestamp ?? 0
  }
}