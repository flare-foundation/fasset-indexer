import { ContractLookup, FAsset, FAssetType, FASSETS } from "fasset-indexer-core"
import { EntityManager, raw, type ORM, ZeroAddress } from "fasset-indexer-core/orm"
import * as Entities from "fasset-indexer-core/entities"
import { EVENTS } from "fasset-indexer-core/config"
import { unixnow } from "../shared/utils"
import { FAssetPriceLoader } from "./utils/prices"
import { SharedAnalytics } from "./shared"
import { AgentStatistics } from "./statistics"
import { MAX_BIPS, PRICE_FACTOR } from "../config/constants"
import { COLLATERAL_POOL_PORTFOLIO_SQL, UNDERLYING_AGENT_BALANCE } from "./utils/raw-sql"
import type {
  AmountResult,
  TimeSeries, Timespan, FAssetTimeSeries, FAssetTimespan,
  TokenPortfolio, FAssetCollateralPoolScore,
  FAssetValueResult, FAssetAmountResult
} from "./interface"


const add = (x: bigint, y: bigint) => x + y
const sub = (x: bigint, y: bigint) => x - y
const rat = (x: bigint, y: bigint) => y == BigInt(0) ? 0 : Number(MAX_BIPS * x / y) / Number(MAX_BIPS)
const div = (x: bigint, y: bigint) => y == BigInt(0) ? BigInt(0) : x / y

/**
 * DashboardAnalytics provides a set of analytics functions for the FAsset UI's dashboard.
 * It is seperated in case of UI's opensource release, and subsequent simplified indexer deployment.
 */
export class DashboardAnalytics extends SharedAnalytics {
  protected lookup: ContractLookup
  private price: FAssetPriceLoader
  private statistics: AgentStatistics
  private zeroAddressId: number | null = null
  private supportedFAssets: FAsset[]

  constructor(public readonly orm: ORM, public readonly chain: string, addressesJson?: string) {
    super(orm)
    this.lookup = new ContractLookup(chain, addressesJson)
    this.price = new FAssetPriceLoader()
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
          EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED,
          EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED,
          EVENTS.COLLATERAL_POOL.CP_ENTERED,
          EVENTS.COLLATERAL_POOL.CP_EXITED,
          EVENTS.COLLATERAL_POOL.CP_FEES_WITHDRAWN,
          EVENTS.COLLATERAL_POOL.CP_SELF_CLOSE_EXITED,
          EVENTS.COLLATERAL_POOL.EXIT,
          EVENTS.COLLATERAL_POOL.ENTER,
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
    return this.redeemedDuring(this.orm.em.fork(), 0, unixnow())
  }

  async totalRedeemedLots(): Promise<FAssetAmountResult> {
    const redeemed = await this.totalRedeemed()
    const lotSizes = await this.lotSizeUBA()
    const valueResult = this.transformFAssetValueResults(redeemed, lotSizes, div)
    return this.convertFAssetValueResultToFAssetAmountResult(valueResult)
  }

  async lotSizeUBA(): Promise<FAssetValueResult> {
    const em = this.orm.em.fork()
    const settings = await em.createQueryBuilder(Entities.AssetManagerSettings, 'ams')
      .select(['fasset', 'lotSizeAmg'])
      .execute() as { fasset: FAssetType, lotSizeAmg: string }[]
    return this.convertOrmResultToFAssetValueResult(settings, 'lotSizeAmg')
  }

  async trackedAgentUnderlyingBacking(): Promise<FAssetValueResult> {
    return this.trackedAgentBackingAt(this.orm.em.fork(), unixnow())
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

  async bestCollateralPools(
    n: number, minTotalPoolNatWei: bigint, now: number, delta: number, lim: number
  ): Promise<FAssetCollateralPoolScore> {
    const em = this.orm.em.fork()
    const vaults = await em.find(Entities.AgentVaultInfo,
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
      const res = await this.totalClaimedPoolFeesAt(em, pool)
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
    return this.totalClaimedPoolFeesAt(this.orm.em.fork(), pool, user)
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
        const value = await this.tokenSupplyAt(em, fAssetEvmAddress.id, timestamp, this.zeroAddressId)
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
    const fun = (em: EntityManager, timestamp: number) => this.totalClaimedPoolFeesAt(em, pool, user, timestamp)
    return this.prepareTimespan(fun.bind(this), timestamps)
  }

  async coreVaultOutflowTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
   return this.prepareTimespan(this.coreVaultOutflowAt.bind(this), timestamps)
  }

  async coreVaultInflowTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    return this.prepareTimespan(this.coreVaultInflowAt.bind(this), timestamps)
  }

  async coreVaultBalanceTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    return this.prepareTimespan(this.coreVaultBalanceAt.bind(this), timestamps)
  }

  async trackedAgentUnderlyingBackingTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    return this.prepareTimespan(this.trackedAgentBackingAt.bind(this), timestamps)
  }

  async claimedPoolFeesAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.claimedPoolFeesTimespan(timestamps)
    return this.aggregateFAssetTimespans(timespans)
  }

  async coreVaultOutflowAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.coreVaultOutflowTimespan(timestamps)
    return this.aggregateFAssetTimespans(timespans)
  }

  async coreVaultInflowAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.coreVaultInflowTimespan(timestamps)
    return this.aggregateFAssetTimespans(timespans)
  }

  async coreVaultBalanceAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.coreVaultBalanceTimespan(timestamps)
    return this.aggregateFAssetTimespans(timespans)
  }

  async trackedAgentBackingTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    return this.prepareTimespan(this.trackedAgentBackingAt.bind(this), timestamps)
  }

  async trackedUnderlyingBackingRatioTimeSeries(timestamps: number[]): Promise<FAssetTimespan<number>> {
    const trackedAgentBalance = await this.trackedAgentBackingTimespan(timestamps)
    const coreVaultBalance = await this.coreVaultBalanceTimespan(timestamps)
    const fassetSupply = await this.fAssetSupplyTimespan(timestamps)
    const underlyingBacking = this.transformFAssetTimespan(trackedAgentBalance, coreVaultBalance, add)
    return this.transformFAssetTimespan(underlyingBacking, fassetSupply, rat)
  }

  //////////////////////////////////////////////////////////////////////
  // timeseries

  async mintedAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const timeseries = await this.mintedTimeSeries(end, npoints, start)
    return this.aggregateTimeSeries(timeseries)
  }

  async redeemedAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const timeseries = await this.redeemedTimeSeries(end, npoints, start)
    return this.aggregateTimeSeries(timeseries)
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
    return this.transformTimeSeries(ts1, ts2, add)
  }

  async coreVaultBalanceAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const ts1 = await this.coreVaultInflowAggregateTimeSeries(end, npoints, start)
    const ts2 = await this.coreVaultOutflowAggregateTimeSeries(end, npoints, start)
    return this.transformTimeSeries(ts1, ts2, sub)
  }

  async mintedTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    return this.prepareTimeSeries(this.mintedDuring.bind(this), npoints, end, start)
  }

  async redeemedTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    return this.prepareTimeSeries(this.redeemedDuring.bind(this), npoints, end, start)
  }

  async coreVaultTransferredTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    return this.prepareTimeSeries(this.coreVaultTransferredDuring.bind(this), npoints, end, start)
  }

  async coreVaultInflowTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    return this.prepareTimeSeries(this.coreVaultInflowDuring.bind(this), npoints, end, start)
  }

  async coreVaultReturnOutflowTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    return this.prepareTimeSeries(this.coreVaultReturnOutflowDuring.bind(this), npoints, end, start)
  }

  async coreVaultRedeemOutflowTimeSeries(end: number, npoints: number, start?: number): Promise<FAssetTimeSeries<bigint>> {
    return this.prepareTimeSeries(this.coreVaultRedeemOutflowDuring.bind(this), npoints, end, start)
  }

  //////////////////////////////////////////////////////////////////////
  // generic query definitions

  protected async totalClaimedPoolFeesAt(
    em: EntityManager, pool?: string, user?: string, timestamp?: number
  ): Promise<FAssetValueResult> {
    const enteredFees = await this.filterEnterOrExitQueryBy(
      em.createQueryBuilder(Entities.CPFeesWithdrawn, 'cpfw')
        .select(['cpfw.fasset', raw('sum(cpfw.withdrawn_fees_uba) as fees')])
        .groupBy('cpfw.fasset'),
      'cpfw', pool, user, timestamp
    ).execute() as { fasset: number, fees: bigint }[]
    return this.convertOrmResultToFAssetValueResult(enteredFees, 'fees')
  }

  protected async tokenSupplyAt(
    em: EntityManager, tokenId: number, timestamp: number, zeroAddressId: number
  ): Promise<bigint> {
    if (zeroAddressId === null) return BigInt(0)
    const minted = await em.createQueryBuilder(Entities.ERC20Transfer, 't')
      .select([raw('sum(t.value) as minted')])
      .join('evmLog', 'el')
      .join('el.block', 'block')
      .where({ 't.from_id': zeroAddressId, 'el.address': tokenId, 'block.timestamp': { $lte: timestamp } })
      .execute() as { minted: bigint }[]
    const mintedValue = BigInt(minted[0]?.minted || 0)
    if (mintedValue == BigInt(0)) return BigInt(0)
    const burned = await em.createQueryBuilder(Entities.ERC20Transfer, 't')
      .select([raw('sum(t.value) as burned')])
      .where({ 't.to_id': zeroAddressId, 'el.address': tokenId, 'block.timestamp': { $lte: timestamp } })
      .join('evmLog', 'el')
      .join('el.block', 'block')
      .execute() as { burned: bigint }[]
    const burnedValue = BigInt(burned[0]?.burned || 0)
    return mintedValue - burnedValue
  }

  protected async mintedDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const minted = await em.createQueryBuilder(Entities.MintingExecuted, 'me')
      .select(['me.fasset', raw('sum(cr.value_uba) as value')])
      .join('me.collateralReserved', 'cr')
      .join('me.evmLog', 'el')
      .join('el.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    return this.convertOrmResultToFAssetValueResult(minted, 'value')
  }

  protected async redeemedDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const redeemed = await em.createQueryBuilder(Entities.RedemptionRequested, 'rr')
      .select(['rr.fasset', raw('sum(rr.value_uba) as value')])
      .join('rr.evmLog', 'log')
      .join('log.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    const transferred = await em.createQueryBuilder(Entities.TransferToCoreVaultStarted, 'tc')
      .select(['tc.fasset', raw('sum(tc.value_uba) as value')])
      .join('tc.evmLog', 'log')
      .join('log.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
      .execute() as { fasset: number, value: string }[]
    return this.transformFAssetValueResults(
      this.convertOrmResultToFAssetValueResult(redeemed, 'value'),
      this.convertOrmResultToFAssetValueResult(transferred, 'value'),
      sub
    )
  }

  protected async coreVaultTransferredDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const transferred = await em.createQueryBuilder(Entities.TransferToCoreVaultStarted, 'ts')
      .select(['ts.fasset', raw('sum(ts.value_uba) as value')])
      .join('ts.evmLog', 'log')
      .join('log.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    return this.convertOrmResultToFAssetValueResult(transferred, 'value')
  }

  protected async coreVaultInflowDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const inflow = await em.createQueryBuilder(Entities.TransferToCoreVaultSuccessful, 'ts')
      .select(['ts.fasset', raw('sum(ts.value_uba) as value')])
      .join('ts.evmLog', 'log')
      .join('log.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    return this.convertOrmResultToFAssetValueResult(inflow, 'value')
  }

  protected async coreVaultReturnOutflowDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const outflow = await em.createQueryBuilder(Entities.ReturnFromCoreVaultConfirmed, 'rc')
      .select(['rc.fasset', raw('sum(rc.received_underlying_uba) as value')])
      .join('rc.evmLog', 'log')
      .join('log.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    return this.convertOrmResultToFAssetValueResult(outflow, 'value')
  }

  protected async coreVaultRedeemOutflowDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const outflow = await em.createQueryBuilder(Entities.CoreVaultRedemptionRequested, 'rc')
      .select(['rc.fasset', raw('sum(rc.value_uba) as value')])
      .join('rc.evmLog', 'log')
      .join('log.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
      .execute() as { fasset: FAssetType, value: string }[]
    return this.convertOrmResultToFAssetValueResult(outflow, 'value')
  }

  protected async coreVaultOutflowDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const returns = await this.coreVaultReturnOutflowDuring(em, from, to)
    const redeems = await this.coreVaultRedeemOutflowDuring(em, from, to)
    return this.transformFAssetValueResults(returns, redeems, add)
  }

  protected async coreVaultBalanceDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const inflow = await this.coreVaultInflowDuring(em, from, to)
    const outflow = await this.coreVaultOutflowDuring(em, from, to)
    return this.transformFAssetValueResults(inflow, outflow, sub)
  }

  protected async trackedAgentBackingAt(em: EntityManager, timestamp: number): Promise<FAssetValueResult> {
    const res = await em.getConnection('read').execute(UNDERLYING_AGENT_BALANCE, [timestamp]) as {
      fasset: FAssetType, total_balance: string }[]
    return this.convertOrmResultToFAssetValueResult(res, 'total_balance')
  }

  protected async coreVaultInflowAt(em: EntityManager, timestamp: number): Promise<FAssetValueResult> {
    return this.coreVaultInflowDuring(em, 0, timestamp)
  }

  protected async coreVaultOutflowAt(em: EntityManager, timestamp: number): Promise<FAssetValueResult> {
    return this.coreVaultOutflowDuring(em, 0, timestamp)
  }

  protected async coreVaultBalanceAt(em: EntityManager, timestamp: number): Promise<FAssetValueResult> {
    return this.coreVaultBalanceDuring(em, 0, timestamp)
  }

  //////////////////////////////////////////////////////////////////////
  // helpers

  protected async prepareTimeSeries(
    query: (em: EntityManager, from: number, to: number) => Promise<FAssetValueResult>,
    npoints: number, end: number, start?: number
  ): Promise<FAssetTimeSeries<bigint>> {
    const em = this.orm.em.fork()
    const queryWithEm = (f: number, t: number) => query(em, f, t)
    const startWithDefault = start ?? await this.getMinTimestamp(em)
    return this.getTimeSeries(queryWithEm.bind(this), npoints, startWithDefault, end)
  }

  protected async getTimeSeries(
    query: (si: number, ei: number) => Promise<FAssetValueResult>,
    npoints: number, start: number, end: number
  ): Promise<FAssetTimeSeries<bigint>> {
    const ret = {} as FAssetTimeSeries<bigint>
    const interval = (end - start) / npoints
    for (let i = 0; i < npoints; i++) {
      const si = start + i * interval
      const ei = start + (i + 1) * interval
      for (const fasset of this.supportedFAssets) {
        if (i === 0) ret[fasset] = []
        ret[fasset].push({ index: i, start: si, end: ei, value: BigInt(0) })
      }
      const results = await query(si, ei)
      for (const [fasset, { value }] of Object.entries(results)) {
        ret[fasset as FAsset][i].value += value
      }
    }
    return ret
  }

  protected async aggregateTimeSeries(timeseries: FAssetTimeSeries<bigint>): Promise<TimeSeries<bigint>> {
    this.price.clearCache()
    const em = this.orm.em.fork()
    const acc = {} as { [index: number]: { start: number, end: number, value: bigint } }
    for (const [fasset, ts] of Object.entries(timeseries)) {
      for (const point of ts) {
        let value = BigInt(0)
        if (point.value != BigInt(0)) {
          const [priceMul, priceDiv] = await this.price.getFAssetToUsdPrice(em, FAssetType[fasset as FAsset])
          value = PRICE_FACTOR * point.value * priceMul / priceDiv
        }
        if (acc[point.index] === undefined) {
          acc[point.index] = { start: point.start, end: point.end, value }
          continue
        }
        acc[point.index].value += value
      }
    }
    return Object.entries(acc).map(([index, data]) => ({ index: parseInt(index), ...data }))
  }

  protected async prepareTimespan(
    fun: (em: EntityManager, timespan: number) => Promise<FAssetValueResult>,
    timestamps: number[]
  ): Promise<FAssetTimespan<bigint>> {
    const em = this.orm.em.fork()
    return this.getTimespan(timestamps, ((t: number) => fun(em, t)).bind(this))
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
    this.price.clearCache()
    const acc: { [timestamp: number]: bigint } = {}
    const em = this.orm.em.fork()
    for (const [fasset, timespan] of Object.entries(timespans)) {
      for (const point of timespan) {
        let value = BigInt(0)
        if (point.value != BigInt(0)) {
          const [priceMul, priceDiv] = await this.price.getFAssetToUsdPrice(em, FAssetType[fasset as FAsset])
          value = PRICE_FACTOR * point.value * priceMul / priceDiv
        }
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

  protected transformFAssetTimeSeries<T>(
    ts1: FAssetTimeSeries<T>,
    ts2: FAssetTimeSeries<T>,
    transformer: (x: T, y: T) => T
  ): FAssetTimeSeries<T> {
    const res = {} as FAssetTimeSeries<T>
    for (const key of Object.keys(ts1)) {
      const val2 = ts2[key]
      if (val2 == null) continue
      res[key] = this.transformTimeSeries(
        ts1[key], ts2[key], transformer)
    }
    return res
  }

  protected transformTimeSeries<T>(
    ts1: TimeSeries<T>,
    ts2: TimeSeries<T>,
    transformer: (x: T, y: T) => T
  ): TimeSeries<T> {
    const res = [] as TimeSeries<T>
    for (const elt of ts1) {
      const x = elt.value
      const y = ts2[elt.index].value
      res.push({ ...elt, value: transformer(x, y) })
    }
    return res
  }

  protected transformFAssetTimespan<T,U>(
    ts1: FAssetTimespan<T>,
    ts2: FAssetTimespan<T>,
    transformer: (x: T, y: T) => U
  ): FAssetTimespan<U> {
    const res = {} as FAssetTimespan<U>
    for (const key of Object.keys(ts1)) {
      const val2 = ts2[key]
      if (val2 == null) continue
      res[key] = this.transformTimespan(
        ts1[key], ts2[key], transformer)
    }
    return res
  }

  protected transformTimespan<T,U>(
    ts1: Timespan<T>,
    ts2: Timespan<T>,
    transformer: (x: T, y: T) => U
  ): Timespan<U> {
    const res = [] as Timespan<U>
    for (let i = 0; i < ts1.length; i++) {
      const x = ts1[i].value
      const y = ts2[i].value
      res.push({
        timestamp: ts1[i].timestamp,
        value: transformer(x, y)
      })
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

  protected transformFAssetAmountResults(
    res1: FAssetAmountResult,
    res2: FAssetAmountResult,
    transformer: (x: number, y: number) => number
  ): FAssetAmountResult {
    const res = {} as FAssetAmountResult
    for (let fasset of this.supportedFAssets) {
      const x = res1[fasset]?.amount ?? 0
      const y = res2[fasset]?.amount ?? 0
      res[fasset] = { amount: transformer(x, y) }
    }
    return res
  }

  protected convertFAssetValueResultToFAssetAmountResult(
    result: FAssetValueResult
  ): FAssetAmountResult {
    return Object.fromEntries(Object.entries(result).map(
      ([fasset, { value }]) => [ fasset, { amount: Number(value) }]
    )) as FAssetAmountResult
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

  private convertFAssetTimeSeriesToFAssetTimespan(timeseries: FAssetTimeSeries<bigint>): FAssetTimespan<bigint> {
    return Object.fromEntries(Object.entries(timeseries).map(
      ([fasset, ts]) => [fasset, this.convertTimeSeriesToTimespan(ts)])
    ) as FAssetTimespan<bigint>
  }

  private convertTimeSeriesToTimespan(timeseries: TimeSeries<bigint>): Timespan<bigint> {
    const timespan: Timespan<bigint> = []
    let pval = BigInt(0)
    for (const { end, value } of timeseries) {
      pval += value
      timespan.push({ timestamp: end, value: pval })
    }
    return timespan
  }

}