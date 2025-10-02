import { FASSETS } from "fasset-indexer-core"
import { raw, type ORM } from "fasset-indexer-core/orm"
import {
  AgentVault, MintingExecuted,
  RedemptionDefault, RedemptionPerformed, RedemptionRequested,
  LiquidationPerformed, CollateralTypeAdded
} from "fasset-indexer-core/entities"
import { SharedAnalytics } from "./shared"
import { weightedAverage } from "./utils/weighted-average"
import { FAssetPriceLoader } from "./utils/prices"
import { LIQUIDATION_DURATION_SQL } from "./utils/raw-sql"


export class AgentStatistics extends SharedAnalytics {
  private price: FAssetPriceLoader

  constructor(public readonly orm: ORM) {
    super(orm, FASSETS)
    this.price = new FAssetPriceLoader()
  }

  async redemptionDefaultWA(vault: string, now: number, delta: number, lim: number): Promise<[bigint, number]> {
    const result = await this.orm.em.fork().createQueryBuilder(RedemptionDefault, 'rd')
      .join('rd.redemptionRequested', 'rr')
      .join('rr.agentVault', 'av')
      .join('av.address', 'ava')
      .join('rr.evmLog', 'el')
      .join('el.block', 'bl')
      .where({ 'ava.hex': vault, 'bl.timestamp': { $gte: now - delta } })
      .select(['bl.timestamp', 'rr.value_uba'])
      .addSelect(raw('rr.value_uba * bl.timestamp as _impact'))
      .orderBy({ [raw('_impact')]: 'desc' })
      .limit(lim)
      .execute() as { timestamp: number, value_uba: string }[]
    const timespan = result.map(r => ({ timestamp: r.timestamp, value: BigInt(r.value_uba) }))
    return [weightedAverage(timespan, now, delta), timespan.length]
  }

  async redemptionTimeWA(vault: string, now: number, delta: number, lim: number): Promise<[bigint, number]> {
    const result = await this.orm.em.fork().createQueryBuilder(RedemptionPerformed, 'rp')
      .join('rp.redemptionRequested', 'rr')
      .join('rr.agentVault', 'av')
      .join('av.address', 'ava')
      .join('rr.evmLog', 'rr_el')
      .join('rr_el.block', 'rr_bl')
      .join('rp.evmLog', 'rp_el')
      .join('rp_el.block', 'rp_bl')
      .where({ 'ava.hex': vault, 'rp_bl.timestamp': { $gte: now - delta } })
      .select([raw('rp_bl.timestamp - rr_bl.timestamp as period'), 'rp_bl.timestamp'])
      .addSelect(raw('(rp_bl.timestamp - rr_bl.timestamp) * rp_bl.timestamp::numeric(25) as _impact'))
      .orderBy({ [raw('_impact')]: 'desc' })
      .limit(lim)
      .execute() as { timestamp: number, period: string }[]
    const timespan = result.map(r => ({ timestamp: r.timestamp, value: BigInt(r.period) }))
    return [weightedAverage(timespan, now, delta), timespan.length]
  }

  async liquidatedAmountWA(vault: string, now: number, delta: number, lim: number): Promise<[bigint, number]> {
    const result = await this.orm.em.fork().createQueryBuilder(LiquidationPerformed, 'lp')
      .join('lp.agentVault', 'av')
      .join('av.address', 'ava')
      .join('lp.evmLog', 'el')
      .join('el.block', 'bl')
      .where({ 'ava.hex': vault, 'bl.timestamp': { $gte: now - delta } })
      .select(['bl.timestamp', 'lp.valueUBA'])
      .addSelect(raw('lp.value_uba * bl.timestamp as _impact'))
      .orderBy({ [raw('_impact')]: 'desc' })
      .limit(lim)
      .execute() as { timestamp: number, valueUBA: string }[]
    const timespan = result.map(r => ({ timestamp: r.timestamp, value: BigInt(r.valueUBA) }))
    return [weightedAverage(timespan, now, delta), timespan.length]
  }

  async liquidationDurationWA(vault: string, now: number, delta: number, lim: number): Promise<[bigint, number]> {
    const result = await this.orm.em.getConnection('read')
      .execute(LIQUIDATION_DURATION_SQL, [vault, vault, now - delta, lim]) as { timestamp: number, diff: string }[]
    const timespan = result.map(r => ({ timestamp: r.timestamp, value: BigInt(r.diff) }))
    return [weightedAverage(timespan, now, delta), timespan.length]
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////
  // agent vault size

  async redemptionCountWA(vault: string, now: number, delta: number, lim: number): Promise<[bigint, number]> {
    const result = await this.orm.em.fork().createQueryBuilder(RedemptionRequested, 'rp')
      .join('rp.agentVault', 'av')
      .join('av.address', 'ava')
      .join('rp.evmLog', 'el')
      .join('el.block', 'bl')
      .select(raw('bl.timestamp as timestamp'))
      .where({ 'ava.hex': vault, 'bl.timestamp': { $gte: now - delta }})
      .orderBy({ [raw('timestamp')]: 'desc' })
      .limit(lim)
      .execute() as { timestamp: number }[]
    const timespan = result.map(r => ({ timestamp: r.timestamp, value: BigInt(1) }))
    return [weightedAverage(timespan, now, delta), timespan.length]
  }

  async redemptionSizeWA(vault: string, now: number, delta: number, lim: number): Promise<[bigint, number]> {
    const result = await this.orm.em.fork().createQueryBuilder(RedemptionRequested, 'rr')
      .join('rr.agentVault', 'av')
      .join('av.address', 'ava')
      .join('rr.evmLog', 'el')
      .join('el.block', 'bl')
      .where({ 'ava.hex': vault, 'bl.timestamp': { $gte: now - delta }})
      .select(['bl.timestamp', 'rr.value_uba'])
      .addSelect(raw('rr.value_uba * bl.timestamp as _impact'))
      .orderBy({ [raw('_impact')]: 'desc' })
      .limit(lim)
      .execute() as { timestamp: number, valueUBA: string }[]
    const timespan = result.map(r => ({ timestamp: r.timestamp, value: BigInt(r.valueUBA) }))
    return [weightedAverage(timespan, now, delta), timespan.length]
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////
  // collateral pools

  async collateralPoolScore(pool: string, now: number, delta: number, lim: number): Promise<bigint> {
    const em = this.orm.em.fork()
    // get usd value of pool yield
    const poolYieldFAsset = await this.collateralPoolYieldWA(pool, now, delta, lim)
    const vault = await em.findOneOrFail(AgentVault, { collateralPool: { hex: pool }})
    const poolYieldUsd = await this.price.fassetToUsd(em, vault.fasset, poolYieldFAsset)
    // get usd value of pool collateral
    const poolCollateralNat = await this.poolCollateralAt(pool, undefined, now)
    const token = await em.findOneOrFail(CollateralTypeAdded, { collateralClass: 1 }, { populate: ['address'] })
    const poolCollateralUsd = await this.price.tokenToUsd(em, token.address.hex, poolCollateralNat)
    // return
    return BigInt(1e5) * poolYieldUsd / poolCollateralUsd
  }

  async collateralPoolYieldWA(pool: string, now: number, delta: number, lim: number): Promise<bigint> {
    const em = this.orm.em.fork()
    const vault = await em.findOneOrFail(AgentVault, { collateralPool: { hex: pool }}, { populate: ['address'] })
    const receivedFAssets = await em.createQueryBuilder(MintingExecuted, 'me')
      .join('me.collateralReserved', 'cr')
      .join('cr.agentVault', 'av')
      .join('av.address', 'ava')
      .join('me.evmLog', 'el')
      .join('el.block', 'bl')
      .where({ 'ava.hex': vault.address.hex, 'bl.timestamp': { $gte: now - delta }})
      .select(['bl.timestamp', 'me.poolFeeUBA'])
      .addSelect(raw('me.pool_fee_uba * bl.timestamp as _impact'))
      .orderBy({ [raw('_impact')]: 'desc' })
      .limit(lim)
      .execute() as { timestamp: number, poolFeeUBA: string }[]
    // should also calculate the amount of airdrops claimed, amount of donations, and amount of liquidations
    // that stole collateral from users (this is a hard one)
    const timespan = receivedFAssets.map(r => ({ timestamp: r.timestamp, value: BigInt(r.poolFeeUBA) }))
    return weightedAverage(timespan, now, delta)
  }
}
