import { ContractLookup, FAsset, FAssetType, FASSETS } from "fasset-indexer-core"
import { EntityManager, SelectQueryBuilder, raw, type ORM, ZeroAddress } from "fasset-indexer-core/orm"
import * as Entities from "fasset-indexer-core/entities"
import { EVENTS } from "fasset-indexer-core/config"
import { fassetToUsdPrice } from "./utils/prices"
import { SharedAnalytics } from "./shared"
import { AgentStatistics } from "./statistics"
import { PRICE_FACTOR } from "../config/constants"
import { COLLATERAL_POOL_PORTFOLIO_SQL } from "./utils/raw-sql"
import type {
  AmountResult,
  TimeSeries, Timespan, FAssetTimeSeries, FAssetTimespan,
  TokenPortfolio, FAssetCollateralPoolScore,
  FAssetValueResult, FAssetAmountResult
} from "./interface"


/**
 * DashboardAnalytics provides a set of analytics functions for the FAsset UI's dashboard.
 * It is seperated in case of UI's opensource release, and subsequent simplified indexer deployment.
 */
export class DashboardAnalytics extends SharedAnalytics {
  protected lookup: ContractLookup
  private statistics: AgentStatistics
  private zeroAddressId: number | null = null
  private supportedFAssets: FAsset[]

  constructor(public readonly orm: ORM, public readonly chain: string, addressesJson?: string) {
    super(orm)
    this.lookup = new ContractLookup(chain, addressesJson)
    this.statistics = new AgentStatistics(orm)
    this.supportedFAssets = FASSETS.filter(x => this.lookup.supportsFAsset(FAssetType[x]))
  }

  //////////////////////////////////////////////////////////////////////
  // system

  async transactionCount(): Promise<AmountResult> {
    const qb = this.orm.em.qb(Entities.EvmLog)
    const result = await qb.count().where({
      name: {
        $in: [
          EVENTS.COLLATERAL_POOL.EXIT,
          EVENTS.COLLATERAL_POOL.ENTER,
          EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED,
          EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED
        ]
      }
    }).execute()
    return { amount: result[0].count }
  }

  async fAssetholderCount(): Promise<FAssetAmountResult> {
    const res = await this.orm.em.fork().createQueryBuilder(Entities.TokenBalance, 'tb')
      .select(['tk.hex as token_address', raw('count(distinct tb.holder_id) as n_token_holders')])
      .join('tb.token', 'tk')
      .where({ 'tb.amount': { $gt: 0 }, 'tk.hex': { $in: this.lookup.fassetTokens } })
      .groupBy('tk.hex')
      .execute() as { token_address: string, n_token_holders: string | number | undefined }[]
    const normalized = res.map(({ token_address, n_token_holders }) => ({
      fasset: this.lookup.fAssetAddressToFAssetType(token_address),
      n_token_holders: Number(n_token_holders || 0)
    }))
    return this.convertOrmResultToFAssetAmountResult(normalized, 'n_token_holders')
  }

  async liquidationCount(): Promise<AmountResult> {
    const amount = await this.orm.em.fork().count(Entities.LiquidationPerformed, { valueUBA: { $gt: 0 } })
    return { amount }
  }

  async mintingExecutedCount(): Promise<AmountResult> {
    const amount = await this.orm.em.fork().count(Entities.MintingExecuted)
    return { amount }
  }

  async totalRedeemed(): Promise<FAssetValueResult> {
    const em = this.orm.em.fork()
    const rr = await em.createQueryBuilder(Entities.RedemptionRequested, 'rr')
      .select(['rr.fasset', raw('sum(rr.value_uba) as value')])
      .groupBy('fasset')
      .execute() as { fasset: number, value: string }[]
    const tc = await em.createQueryBuilder(Entities.TransferToCoreVaultStarted, 'tc')
      .select(['tc.fasset', raw('sum(tc.value_uba) as value')])
      .groupBy('fasset')
      .execute() as { fasset: number, value: string }[]
    const fvrrr = this.convertOrmResultToFAssetValueResult(rr, 'value')
    const fvrtc = this.convertOrmResultToFAssetValueResult(tc, 'value')
    return this.transformFAssetValueResults(fvrrr, fvrtc, (x, y) => x - y)
  }

  async totalRedeemedLots(): Promise<FAssetAmountResult> {
    const ret = {} as FAssetAmountResult
    const em = this.orm.em.fork()
    const tr = await this.totalRedeemed()
    for (const [fasset, { value }] of Object.entries(tr)) {
      const fassetType = FAssetType[fasset]
      const settings = await em.findOneOrFail(Entities.AssetManagerSettings, { fasset: fassetType })
      ret[fasset] = { amount: Number(value / settings.lotSizeAmg) }
    }
    return ret
  }

  async redemptionDefault(id: number, fasset: FAssetType): Promise<Entities.RedemptionDefault | null> {
    const em = this.orm.em.fork()
    const redemptionDefault = await em.findOne(Entities.RedemptionDefault,
      { fasset: fasset, redemptionRequested: { requestId: id } },
      {
        populate: [
          'redemptionRequested.redeemer',
          'redemptionRequested.paymentAddress',
          'redemptionRequested.agentVault.address',
          'redemptionRequested.agentVault.underlyingAddress',
          'redemptionRequested.executor'
        ]
      }
    )
    return redemptionDefault
  }

  //////////////////////////////////////////////////////////////////////
  // agents

  async agentRedemptionSuccessRate(agentAddress: string): Promise<AmountResult> {
    const requested = await this.agentRedemptionRequestCount(agentAddress)
    const executed = await this.agentRedemptionPerformedCount(agentAddress)
    const rate = requested.amount > 0 ? executed.amount / requested.amount : 0
    return { amount: rate }
  }

  async agentMintingExecutedCount(agentAddress: string): Promise<AmountResult> {
    const qb = this.orm.em.fork().qb(Entities.MintingExecuted)
    qb.count().where({ collateralReserved: { agentVault: { address: { hex: agentAddress } } } })
    const result = await qb.execute()
    return { amount: Number(result[0].count || 0) }
  }

  async agentRedemptionRequestCount(agentAddress: string): Promise<AmountResult> {
    const qbr = this.orm.em.fork().qb(Entities.RedemptionRequested)
    qbr.count().where({ agentVault: { address: { hex: agentAddress } } })
    const redemptions = await qbr.execute()
    const qbc = this.orm.em.fork().qb(Entities.TransferToCoreVaultStarted)
    qbc.count().where({ agentVault: { address: { hex: agentAddress } } })
    const coreVaultTransfers = await qbc.execute()
    return { amount: Number(redemptions[0].count || 0) - Number(coreVaultTransfers[0].count || 0) }
  }

  async agentRedemptionPerformedCount(agentAddress: string): Promise<AmountResult> {
    const qb = this.orm.em.fork().qb(Entities.RedemptionPerformed)
    qb.count().where({ redemptionRequested: { agentVault: { address: { hex: agentAddress } } } })
    const result = await qb.execute()
    return { amount: Number(result[0].count || 0) }
  }

  async agentLiquidationCount(agentAddress: string): Promise<AmountResult> {
    const qb = this.orm.em.fork().qb(Entities.LiquidationPerformed)
    qb.count().where({ agentVault: { address: { hex: agentAddress } }, valueUBA: { $gt: 0 } })
    const result = await qb.execute()
    return { amount: Number(result[0].count || 0) }
  }

  //////////////////////////////////////////////////////////////////////
  // collateral pools

  async poolTransactionsCount(): Promise<AmountResult> {
    const em = this.orm.em.fork()
    const entered = await em.count(Entities.CPEntered)
    const exited = await em.count(Entities.CPExited)
    const claimed = await em.count(Entities.CPClaimedReward)
    const selfCloseExited = await em.count(Entities.CPSelfCloseExited)
    return { amount: entered + exited + claimed + selfCloseExited }
  }

  async bestCollateralPools(n: number, minTotalPoolNatWei: bigint, now: number, delta: number, lim: number): Promise<FAssetCollateralPoolScore> {
    const vaults = await this.orm.em.fork().find(Entities.AgentVaultInfo,
      { totalPoolCollateralNATWei: { $gte: minTotalPoolNatWei }, status: 0, publiclyAvailable: true },
      { populate: ['agentVault.collateralPool'] })
    const scores = []
    for (const vault of vaults) {
      const pool = vault.agentVault.collateralPool.hex
      const score = await this.statistics.collateralPoolScore(pool, now, delta, lim)
      const fasset = vault.agentVault.fasset
      scores.push({ pool, score, fasset })
    }
    scores.sort((a, b) => a > b ? -1 : a < b ? 1 : 0).splice(n)
    const ret = {} as FAssetCollateralPoolScore
    for (const { pool, score, fasset } of scores) {
      const res = await this.totalClaimedPoolFees(pool)
      const fas = FAssetType[fasset] as FAsset
      const claimed = res[fas]?.value || BigInt(0)
      ret[fas] ??= []
      ret[fas].push({ pool, score, claimed })
    }
    return ret
  }

  async userCollateralPoolTokenPortfolio(user: string): Promise<TokenPortfolio> {
    const ret = {} as TokenPortfolio
    const con = this.orm.em.getConnection('read')
    const res = await con.execute(COLLATERAL_POOL_PORTFOLIO_SQL, [user])
    for (const r of res) {
      ret[r.cpt_address] = { balance: BigInt(r.balance) }
    }
    return ret
  }

  async totalClaimedPoolFees(pool?: string, user?: string): Promise<FAssetValueResult> {
    return this.totalClaimedPoolFeesAt(pool, user)
  }

  ///////////////////////////////////////////////////////////////
  // timespans

  async fAssetSupplyTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    const ret = {} as FAssetTimespan<bigint>
    await this.ensureZeroAddressId()
    if (this.zeroAddressId === null) return ret
    const em = this.orm.em.fork()
    for (const fasset of this.supportedFAssets) {
      const fAssetAddress = this.lookup.fAssetTypeToFAssetAddress(FAssetType[fasset])
      const fAssetEvmAddress = await em.findOne(Entities.EvmAddress, { hex: fAssetAddress })
      if (fAssetEvmAddress === null) continue
      ret[fasset] = []
      for (const timestamp of timestamps) {
        const value = await this.tokenSupplyAt(fAssetEvmAddress.id, timestamp, this.zeroAddressId)
        ret[fasset].push({ timestamp, value })
      }
    }
    return ret
  }

  async poolCollateralTimespan(timestamps: number[], pool?: string): Promise<Timespan<bigint>> {
    const ret = [] as Timespan<bigint>
    for (const timestamp of timestamps) {
      const value = await this.poolCollateralAt(pool, undefined, timestamp)
      ret.push({ timestamp, value })
    }
    return ret
  }

  async claimedPoolFeesTimespan(timestamps: number[], pool?: string, user?: string): Promise<FAssetTimespan<bigint>> {
    return this.getTimespan(timestamps, (timestamp: number) => this.totalClaimedPoolFeesAt(pool, user, timestamp))
  }

  async claimedPoolFeesAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.claimedPoolFeesTimespan(timestamps)
    return this.aggregateFAssetTimespans(timespans)
  }

  async coreVaultOutflowTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    return this.getTimespan(timestamps, timestamp => this.coreVaultOutflowAt(timestamp))
  }

  async coreVaultOutflowAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.coreVaultOutflowTimespan(timestamps)
    return this.aggregateFAssetTimespans(timespans)
  }

  async coreVaultInflowTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    return this.getTimespan(timestamps, timestamp => this.coreVaultInflowAt(timestamp))
  }

  async coreVaultInflowAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.coreVaultInflowTimespan(timestamps)
    return this.aggregateFAssetTimespans(timespans)
  }

  async coreVaultBalanceTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    return this.getTimespan(timestamps, timestamp => this.coreVaultBalanceAt(timestamp))
  }

  async coreVaultBalanceAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.coreVaultBalanceTimespan(timestamps)
    return this.aggregateFAssetTimespans(timespans)
  }

  //////////////////////////////////////////////////////////////////////
  // timeseries

  async mintedAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const timeseries = await this.mintedTimeSeries(end, npoints, start)
    return this.aggregateTimeSeries(timeseries)
  }

  async redeemedAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const redeemedTs = await this.redeemedTimeSeries(end, npoints, start)
    const transferredTs = await this.coreVaultTransferredTimeSeries(end, npoints, start)
    return this.transformTimeSeries(
      await this.aggregateTimeSeries(redeemedTs),
      await this.aggregateTimeSeries(transferredTs),
      (x, y) => x - y
    )
  }

  async coreVaultInflowAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const timeseries = await this.coreVaultInflowTimeSeries(end, npoints, start)
    return this.aggregateTimeSeries(timeseries)
  }

  async coreVaultReturnOutflowAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const timeseries = await this.coreVaultReturnOutflowTimeSeries(end, npoints, start)
    return this.aggregateTimeSeries(timeseries)
  }

  async coreVaultRedeemOutflowAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const timeseries = await this.coreVaultRedeemOutflowTimeSeries(end, npoints, start)
    return this.aggregateTimeSeries(timeseries)
  }

  async coreVaultOutflowAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const ts1 = await this.coreVaultReturnOutflowAggregateTimeSeries(end, npoints, start)
    const ts2 = await this.coreVaultRedeemOutflowAggregateTimeSeries(end, npoints, start)
    return this.transformTimeSeries(ts1, ts2, (x, y) => x + y)
  }

  async coreVaultBalanceAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const ts1 = await this.coreVaultInflowAggregateTimeSeries(end, npoints, start)
    const ts2 = await this.coreVaultOutflowAggregateTimeSeries(end, npoints, start)
    return this.transformTimeSeries(ts1, ts2, (x, y) => x - y)
  }

  async mintedTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    const em = this.orm.em.fork()
    return this.getTimeSeries(
      ($gt, $lt) => em.createQueryBuilder(Entities.MintingExecuted, 'me')
        .select(['me.fasset', raw('sum(cr.value_uba) as value')])
        .join('me.collateralReserved', 'cr')
        .join('me.evmLog', 'el')
        .join('el.block', 'block')
        .where({ 'block.timestamp': { $gt, $lt } })
        .groupBy('fasset'),
      end, npoints, start ?? await this.getMinTimestamp(em)
    )
  }

  async redeemedTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    const em = this.orm.em.fork()
    return this.getTimeSeries(
      ($gt, $lt) => em.createQueryBuilder(Entities.RedemptionRequested, 'rr')
        .select(['rr.fasset', raw('sum(rr.value_uba) as value')])
        .join('rr.evmLog', 'log')
        .join('log.block', 'block')
        .where({ 'block.timestamp': { $gt, $lt } })
        .groupBy('fasset'),
      end, npoints, start ?? await this.getMinTimestamp(em)
    )
  }

  async coreVaultTransferredTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    const em = this.orm.em.fork()
    return this.getTimeSeries(
      ($gt, $lt) => em.createQueryBuilder(Entities.TransferToCoreVaultStarted, 'ts')
        .select(['ts.fasset', raw('sum(ts.value_uba) as value')])
        .join('ts.evmLog', 'log')
        .join('log.block', 'block')
        .where({ 'block.timestamp': { $gt, $lt } })
        .groupBy('fasset'),
      end, npoints, start ?? await this.getMinTimestamp(em)
    )
  }

  async coreVaultInflowTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    const em = this.orm.em.fork()
    return this.getTimeSeries(
      ($gt, $lt) => em.createQueryBuilder(Entities.TransferToCoreVaultSuccessful, 'ts')
        .select(['ts.fasset', raw('sum(ts.value_uba) as value')])
        .join('ts.evmLog', 'log')
        .join('log.block', 'block')
        .where({ 'block.timestamp': { $gt, $lt } })
        .groupBy('fasset'),
      end, npoints, start ?? await this.getMinTimestamp(em)
    )
  }

  async coreVaultReturnOutflowTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    const em = this.orm.em.fork()
    return this.getTimeSeries(
      ($gt, $lt) => em.createQueryBuilder(Entities.ReturnFromCoreVaultConfirmed, 'rc')
        .select(['rc.fasset', raw('sum(rc.received_underlying_uba) as value')])
        .join('rc.evmLog', 'log')
        .join('log.block', 'block')
        .where({ 'block.timestamp': { $gt, $lt } })
        .groupBy('fasset'),
      end, npoints, start ?? await this.getMinTimestamp(em)
    )
  }

  async coreVaultRedeemOutflowTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    const em = this.orm.em.fork()
    return this.getTimeSeries(
      ($gt, $lt) => em.createQueryBuilder(Entities.CoreVaultRedemptionRequested, 'rc')
        .select(['rc.fasset', raw('sum(rc.value_uba) as value')])
        .join('rc.evmLog', 'log')
        .join('log.block', 'block')
        .where({ 'block.timestamp': { $gt, $lt } })
        .groupBy('fasset'),
      end, npoints, start ?? await this.getMinTimestamp(em)
    )
  }

  //////////////////////////////////////////////////////////////////////
  // timemapped generic metrics (no idea how to name this better)

  private async totalClaimedPoolFeesAt(pool?: string, user?: string, timestamp?: number): Promise<FAssetValueResult> {
    const enteredFees = await this.filterEnterOrExitQueryBy(
      this.orm.em.fork().createQueryBuilder(Entities.CPFeesWithdrawn, 'cpfw')
        .select(['cpfw.fasset', raw('sum(cpfw.withdrawn_fees_uba) as fees')])
        .groupBy('cpfw.fasset'),
      'cpfw', pool, user, timestamp
    ).execute() as { fasset: number, fees: bigint }[]
    return this.convertOrmResultToFAssetValueResult(enteredFees, 'fees')
  }

  private async tokenSupplyAt(tokenId: number, timestamp: number, zeroAddressId: number): Promise<bigint> {
    if (zeroAddressId === null) return BigInt(0)
    const minted = await this.orm.em.fork().createQueryBuilder(Entities.ERC20Transfer, 't')
      .select([raw('sum(t.value) as minted')])
      .join('evmLog', 'el')
      .join('el.block', 'block')
      .where({ 't.from_id': zeroAddressId, 'el.address': tokenId, 'block.timestamp': { $lte: timestamp } })
      .execute() as { minted: bigint }[]
    const mintedValue = BigInt(minted[0]?.minted || 0)
    if (mintedValue == BigInt(0)) return BigInt(0)
    const burned = await this.orm.em.fork().createQueryBuilder(Entities.ERC20Transfer, 't')
      .select([raw('sum(t.value) as burned')])
      .where({ 't.to_id': zeroAddressId, 'el.address': tokenId, 'block.timestamp': { $lte: timestamp } })
      .join('evmLog', 'el')
      .join('el.block', 'block')
      .execute() as { burned: bigint }[]
    const burnedValue = BigInt(burned[0]?.burned || 0)
    return mintedValue - burnedValue
  }

  private async coreVaultInflowAt(timestamp: number): Promise<FAssetValueResult> {
    const res = await this.orm.em.fork().createQueryBuilder(Entities.TransferToCoreVaultSuccessful, 'succ')
      .select(['succ.fasset', raw('sum(succ.value_uba) as value')])
      .where({ 'block.timestamp': { $lte: timestamp } })
      .join('evmLog', 'el')
      .join('el.block', 'block')
      .groupBy('succ.fasset')
      .execute() as { fasset: number, value: 'string' }[]
    return this.convertOrmResultToFAssetValueResult(res, 'value')
  }

  private async coreVaultOutflowAt(timestamp: number): Promise<FAssetValueResult> {
    const em = this.orm.em.fork()
    const redemptionOutflow = await em.createQueryBuilder(Entities.CoreVaultRedemptionRequested, 'red')
      .select(['red.fasset', raw('sum(red.value_uba) as value')])
      .where({ 'block.timestamp': { $lte: timestamp } })
      .join('evmLog', 'el')
      .join('el.block', 'block')
      .groupBy('red.fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    const returnOutflow = await em.createQueryBuilder(Entities.ReturnFromCoreVaultConfirmed, 'ret')
      .select(['ret.fasset', raw('sum(ret.received_underlying_uba) as value')])
      .where({ 'block.timestamp': { $lte: timestamp } })
      .join('evmLog', 'el')
      .join('el.block', 'block')
      .groupBy('ret.fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    const redemptionOutflowFAssetValueResult = this.convertOrmResultToFAssetValueResult(redemptionOutflow, 'value')
    const returnOutflowFAssetValueResult = this.convertOrmResultToFAssetValueResult(returnOutflow, 'value')
    return this.transformFAssetValueResults(redemptionOutflowFAssetValueResult, returnOutflowFAssetValueResult, (x, y) => x + y)
  }

  private async coreVaultBalanceAt(timestamp: number): Promise<FAssetValueResult> {
    const inflow = await this.coreVaultInflowAt(timestamp)
    const outflow = await this.coreVaultOutflowAt(timestamp)
    return this.transformFAssetValueResults(inflow, outflow, (x, y) => x - y)
  }

  //////////////////////////////////////////////////////////////////////
  // helpers

  protected async getTimeSeries<T extends Entities.FAssetEventBound>(
    query: (si: number, ei: number) => SelectQueryBuilder<T>,
    end: number, npoints: number, start: number
  ): Promise<FAssetTimeSeries<bigint>> {
    const ret = {} as FAssetTimeSeries<bigint>
    const interval = (end - start) / npoints
    for (let i = 0; i < npoints; i++) {
      const si = start + i * interval
      const ei = start + (i + 1) * interval
      const results = await query(si, ei).execute() as { fasset: number, value: bigint }[]
      for (const fasset of this.supportedFAssets) {
        if (i === 0) ret[fasset] = []
        ret[fasset].push({ index: i, start: si, end: ei, value: BigInt(0) })
      }
      for (const result of results) {
        const value = BigInt(result.value)
        const fasset = FAssetType[result.fasset] as FAsset
        ret[fasset][i].value += value
      }
    }
    return ret
  }

  protected async aggregateTimeSeries(timeseries: FAssetTimeSeries<bigint>): Promise<TimeSeries<bigint>> {
    const em = this.orm.em.fork()
    const acc = {} as { [index: number]: { start: number, end: number, value: bigint } }
    for (const fasset in timeseries) {
      const [priceMul, priceDiv] = await fassetToUsdPrice(em, FAssetType[fasset as FAsset])
      for (const point of timeseries[fasset as FAsset]) {
        const value = PRICE_FACTOR * point.value * priceMul / priceDiv
        if (acc[point.index] === undefined) {
          acc[point.index] = { start: point.start, end: point.end, value }
          continue
        }
        acc[point.index].value += value
      }
    }
    return Object.entries(acc).map(([index, data]) => ({ index: parseInt(index), ...data }))
  }

  protected async getTimespan(timestamps: number[], fun: (timespan: number) => Promise<FAssetValueResult>):
    Promise<FAssetTimespan<bigint>> {
    const ret = {} as FAssetTimespan<bigint>
    for (const timestamp of timestamps) {
      for (const fasset of this.supportedFAssets) {
        ret[fasset as FAsset] ??= []
        ret[fasset].push({ timestamp, value: BigInt(0) })
      }
      const res = await fun(timestamp)
      for (const [fasset, { value }] of Object.entries(res)) {
        const i = ret[fasset].length - 1
        ret[fasset as FAsset][i].value += value
      }
    }
    return ret
  }

  protected async aggregateFAssetTimespans(timespans: FAssetTimespan<bigint>): Promise<Timespan<bigint>> {
    const acc: { [timestamp: number]: bigint } = {}
    const em = this.orm.em.fork()
    for (const [fasset, timespan] of Object.entries(timespans)) {
      const [priceMul, priceDiv] = await fassetToUsdPrice(em, FAssetType[fasset as FAsset])
      for (const point of timespan) {
        const value = PRICE_FACTOR * point.value * priceMul / priceDiv
        if (acc[point.timestamp] === undefined) {
          acc[point.timestamp] = value
          continue
        }
        acc[point.timestamp] += value
      }
    }
    return Object.entries(acc).map(([timestamp, value]) => ({ timestamp: parseInt(timestamp), value }))
  }

  protected async getMinTimestamp(em: EntityManager): Promise<number> {
    const minBlockVar = await em.find(Entities.EvmBlock, {}, { orderBy: { index: 'asc' }, limit: 1 })
    return minBlockVar[0]?.timestamp ?? 0
  }

  protected async ensureZeroAddressId(): Promise<void> {
    if (this.zeroAddressId !== null) return
    this.zeroAddressId = await this.orm.em.fork().findOne(Entities.EvmAddress, { hex: ZeroAddress })
      .then(zeroAddress => this.zeroAddressId = zeroAddress?.id ?? null)
  }

  protected transformTimeSeries(
    ts1: TimeSeries<bigint>,
    ts2: TimeSeries<bigint>,
    transformer: (x: bigint, y: bigint) => bigint
  ): TimeSeries<bigint> {
    const res = [] as TimeSeries<bigint>
    for (const elt of ts1) {
      const x = elt.value
      const y = ts2[elt.index].value
      res.push({ ...elt, value: transformer(x, y) })
    }
    return res
  }

  protected transformFAssetValueResults(
    res1: FAssetValueResult,
    res2: FAssetValueResult,
    transformer: (x: bigint, y: bigint) => bigint
  ): FAssetValueResult {
    const res = {} as FAssetValueResult
    for (let fasset of this.supportedFAssets) {
      const x = res1[fasset]?.value ?? BigInt(0)
      const y = res2[fasset]?.value ?? BigInt(0)
      res[fasset] = { value: transformer(x, y) }
    }
    return res
  }

  private convertOrmResultToFAssetValueResult<K extends string>(
    result: ({ fasset: number } & { [key in K]: string | bigint })[], key: K
  ): FAssetValueResult {
    const ret = {} as FAssetValueResult
    for (const x of result) {
      ret[FAssetType[x.fasset] as FAsset] = { value: BigInt(x?.[key] ?? 0) }
    }
    return ret
  }

  private convertOrmResultToFAssetAmountResult<K extends string>(
    result: ({ fasset: number } & { [key in K]: string | number })[], key: K
  ): FAssetAmountResult {
    const ret = {} as FAssetAmountResult
    for (const x of result) {
      ret[FAssetType[x.fasset] as FAsset] = { amount: Number(x?.[key] ?? 0) }
    }
    return ret
  }

  private convertTimespanToTimeSeries(timespan: Timespan<bigint>): TimeSeries<bigint> {
    const timeseries: TimeSeries<bigint> = []
    let { timestamp: prevtsp, value: accval } = timespan[0]
    for (let i = 1; i < timeseries.length; i++) {
      const { timestamp, value } = timespan[i]
      timeseries.push({
        index: i - 1,
        start: prevtsp,
        end: timestamp,
        value: value - accval
      })
      prevtsp = timestamp
      accval = value
    }
    return timeseries
  }
}