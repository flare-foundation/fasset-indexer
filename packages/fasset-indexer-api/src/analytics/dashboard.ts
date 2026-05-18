import { ContractLookup, FAsset, FAssetType, FASSETS } from "fasset-indexer-core"
import { EntityManager, raw, type ORM, ZeroAddress } from "fasset-indexer-core/orm"
import * as Entities from "fasset-indexer-core/entities"
import { EVENTS } from "fasset-indexer-core/config"
import { unixnow } from "../shared/utils"
import { FAssetPriceLoader } from "./utils/prices"
import { SharedAnalytics } from "./shared"
import { AgentStatistics } from "./statistics"
import { MAX_BIPS, PRICE_FACTOR } from "../config/constants"
import { COLLATERAL_POOL_PORTFOLIO_SQL, FASSET_SUPPLY_AT_TIMESTAMPS, UNDERLYING_AGENT_BALANCE } from "./utils/raw-sql"
import type {
  AmountResult,
  TimeSeries, Timespan, FAssetTimeSeries, FAssetTimespan,
  TokenPortfolio, FAssetCollateralPoolScore,
  FAssetValueResult, FAssetAmountResult
} from "./types"


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

  constructor(public readonly orm: ORM, public readonly chain: string, addressesJson?: string, deployment?: string) {
    const lookup = new ContractLookup(chain, addressesJson, deployment)
    const fassets = FASSETS.filter(x => lookup.supportsFAsset(FAssetType[x]))
    super(orm, fassets)
    this.price = new FAssetPriceLoader()
    this.statistics = new AgentStatistics(orm)
    this.lookup = lookup
  }

  //////////////////////////////////////////////////////////////////////
  // system

  async transactionCount(): Promise<AmountResult> {
    const qb = this.orm.em.qb(Entities.EvmLog)
    const result = await qb.count().where({
      name: {
        $in: [
          EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED,
          EVENTS.ASSET_MANAGER.REDEMPTION_WITH_TAG_REQUESTED,
          EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED,
          EVENTS.ASSET_MANAGER.DIRECT_MINTING_EXECUTED,
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
    const em = this.orm.em.fork()
    const [standard, direct, directToSA] = await Promise.all([
      em.count(Entities.MintingExecuted),
      em.count(Entities.DirectMintingExecuted),
      em.count(Entities.DirectMintingExecutedToSmartAccount)
    ])
    return { amount: standard + direct + directToSA }
  }

  async totalRedeemed(): Promise<FAssetValueResult> {
    return this.redeemedDuring(this.orm.em.fork(), 0, unixnow())
  }

  async totalRedeemedLots(): Promise<FAssetAmountResult> {
    const [lotSizes, redeemed] = await Promise.all([
      this.lotSizeUBA(), this.totalRedeemed()
    ])
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
    const [requested, executed] = await Promise.all([
      this.agentRedemptionRequestCount(agentAddress),
      this.agentRedemptionPerformedCount(agentAddress)
    ])
    return { amount: requested.amount > 0 ? executed.amount / requested.amount : 0 }
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
    const qbc = this.orm.em.fork().qb(Entities.TransferToCoreVaultStarted)
    qbc.count().where({ agentVault: { address: { hex: agentAddress } } })
    const [redemptions, coreVaultTransfers] = await Promise.all([qbr.execute(), qbc.execute()])
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
    const [entered, exited, claimed, selfCloseExited] = await Promise.all([
      em.count(Entities.CPEntered),
      em.count(Entities.CPExited),
      em.count(Entities.CPClaimedReward),
      em.count(Entities.CPSelfCloseExited)
    ])
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

  async totalDepositedPoolFees(): Promise<FAssetValueResult> {
    return this.totalDepositedPoolFeesAt(this.orm.em.fork())
  }

  ///////////////////////////////////////////////////////////////
  // timespans

  async fAssetSupplyTimespan(timestamps: number[]): Promise<FAssetTimespan<bigint>> {
    const ret = {} as FAssetTimespan<bigint>
    if (timestamps.length === 0) return ret
    await this.ensureZeroAddressId()
    if (this.zeroAddressId === null) return ret
    const em = this.orm.em.fork()
    const fassetByAddressId = new Map<number, FAsset>()
    for (const fasset of this.supportedFAssets) {
      const hex = this.lookup.fAssetTypeToFAssetAddress(FAssetType[fasset])
      const addr = await em.findOne(Entities.EvmAddress, { hex })
      if (addr === null) continue
      fassetByAddressId.set(addr.id, fasset)
      ret[fasset] = timestamps.map(timestamp => ({ timestamp, value: BigInt(0) }))
    }
    if (fassetByAddressId.size === 0) return ret
    const tsIndex = new Map(timestamps.map((t, i) => [t, i]))
    const rows = await em.getConnection('read').execute(
      FASSET_SUPPLY_AT_TIMESTAMPS(this.zeroAddressId, [...fassetByAddressId.keys()], timestamps)
    ) as { token_id: number, timestamp: number, supply: string | number }[]
    for (const { token_id, timestamp, supply } of rows) {
      const fasset = fassetByAddressId.get(Number(token_id))
      if (fasset === undefined) continue
      const i = tsIndex.get(Number(timestamp))
      if (i === undefined) continue
      ret[fasset][i].value = BigInt(supply)
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

  async fAssetSupplyAggregateTimespan(timestamps: number[]): Promise<Timespan<bigint>> {
    const timespans = await this.fAssetSupplyTimespan(timestamps)
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
    const [trackedAgentBalance, coreVaultBalance, fassetSupply] = await Promise.all([
      this.trackedAgentBackingTimespan(timestamps),
      this.coreVaultBalanceTimespan(timestamps),
      this.fAssetSupplyTimespan(timestamps)
    ])
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
    const [ts1, ts2] = await Promise.all([
      this.coreVaultReturnOutflowAggregateTimeSeries(end, npoints, start),
      this.coreVaultRedeemOutflowAggregateTimeSeries(end, npoints, start)
    ])
    return this.transformTimeSeries(ts1, ts2, add)
  }

  async coreVaultBalanceAggregateTimeSeries(end: number, npoints: number, start?: number): Promise<TimeSeries<bigint>> {
    const [ts1, ts2] = await Promise.all([
      this.coreVaultInflowAggregateTimeSeries(end, npoints, start),
      this.coreVaultOutflowAggregateTimeSeries(end, npoints, start)
    ])
    return this.transformTimeSeries(ts1, ts2, sub)
  }

  async mintedTimeSeries(end: number, npoints: number, start?: number, user?: string): Promise<FAssetTimeSeries<bigint>> {
    const fun = (e: EntityManager, f: number, t: number) => this.mintedDuring(e, f, t, user)
    return this.prepareTimeSeries(fun.bind(this), npoints, end, start)
  }

  async redeemedTimeSeries(end: number, npoints: number, start?: number, user?: string): Promise<FAssetTimeSeries<bigint>> {
    const fun = (e: EntityManager, f: number, t: number) => this.redeemedDuring(e, f, t, user)
    return this.prepareTimeSeries(fun.bind(this), npoints, end, start)
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

  protected async totalDepositedPoolFeesAt(
    em: EntityManager, timestamp?: number
  ): Promise<FAssetValueResult> {
    const [mintPoolFees, selfMintFees, redeemPoolFees] = await Promise.all([
      this.filterEnterOrExitQueryBy(
        em.createQueryBuilder(Entities.MintingExecuted, 'me')
          .select(['me.fasset', raw('sum(me.pool_fee_uba) as fees')])
          .groupBy('me.fasset'),
        'me', undefined, undefined, timestamp
      ).execute() as Promise<{ fasset: number, fees: bigint }[]>,
      this.filterEnterOrExitQueryBy(
        em.createQueryBuilder(Entities.SelfMint, 'sm')
          .select(['sm.fasset', raw('sum(sm.pool_fee_uba) as fees')])
          .groupBy('sm.fasset'),
        'sm', undefined, undefined, timestamp
      ).execute() as Promise<{ fasset: number, fees: bigint }[]>,
      this.filterEnterOrExitQueryBy(
        em.createQueryBuilder(Entities.RedemptionPoolFeeMinted, 'rpfme')
          .select(['rpfme.fasset', raw('sum(rpfme.pool_fee_uba) as fees')])
          .groupBy('rpfme.fasset'),
        'rpfme', undefined, undefined, timestamp
      ).execute() as Promise<{ fasset: number, fees: bigint }[]>
    ])
    return this.transformFAssetValueResults(
      this.convertOrmResultToFAssetValueResult(mintPoolFees, 'fees'),
      this.transformFAssetValueResults(
        this.convertOrmResultToFAssetValueResult(selfMintFees, 'fees'),
        this.convertOrmResultToFAssetValueResult(redeemPoolFees, 'fees'),
        add
      ),
      add
    )
  }

  protected async mintedDuring(em: EntityManager, from: number, to: number, user?: string): Promise<FAssetValueResult> {
    // standard collateral-reserved flow
    let query = em.createQueryBuilder(Entities.MintingExecuted, 'me')
      .select(['me.fasset', raw('sum(cr.value_uba) as value')])
      .join('me.collateralReserved', 'cr')
      .join('me.evmLog', 'el')
      .join('el.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
    if (user != null) {
      query = query.join('cr.minter', 'mi').andWhere({ 'mi.hex': user })
    }
    const addressFilter = user != null ? { join: 'targetAddress', hex: user } : undefined
    const queries: Promise<FAssetValueResult>[] = [
      (query.execute() as Promise<{ fasset: FAssetType, value: string }[]>).then(r => this.convertOrmResultToFAssetValueResult(r, 'value')),
      this.sumByFAssetDuring(em, Entities.DirectMintingExecuted, 'minted_amount_uba', from, to, addressFilter)
    ]
    // smart-account direct mints have no per-user link, only counted in totals
    if (user == null) {
      queries.push(this.sumByFAssetDuring(em, Entities.DirectMintingExecutedToSmartAccount, 'minted_amount_uba', from, to))
    }
    const results = await Promise.all(queries)
    return results.reduce((acc, r) => this.transformFAssetValueResults(acc, r, add))
  }

  protected async redeemedDuring(em: EntityManager, from: number, to: number, user?: string): Promise<FAssetValueResult> {
    let rquery = em.createQueryBuilder(Entities.RedemptionRequested, 'rr')
      .select(['rr.fasset', raw('sum(rr.value_uba) as value')])
      .join('rr.evmLog', 'log')
      .join('log.block', 'block')
      .where({ 'block.timestamp': { $gte: from, $lt: to } })
      .groupBy('fasset')
    if (user != null) {
      rquery = rquery.join('rr.redeemer', 're').andWhere({ 're.hex': user })
      const redeemed = await rquery.execute() as { fasset: FAssetType, value: string }[]
      return this.convertOrmResultToFAssetValueResult(redeemed, 'value')
    }
    const [redeemed, transferred] = await Promise.all([
      rquery.execute() as Promise<{ fasset: FAssetType, value: string }[]>,
      em.createQueryBuilder(Entities.TransferToCoreVaultStarted, 'tc')
        .select(['tc.fasset', raw('sum(tc.value_uba) as value')])
        .join('tc.evmLog', 'log')
        .join('log.block', 'block')
        .where({ 'block.timestamp': { $gte: from, $lt: to } })
        .groupBy('fasset')
        .execute() as Promise<{ fasset: number, value: string }[]>
    ])
    return this.transformFAssetValueResults(
      this.convertOrmResultToFAssetValueResult(redeemed, 'value'),
      this.convertOrmResultToFAssetValueResult(transferred, 'value'),
      sub
    )
  }

  protected async coreVaultTransferredDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    return this.sumByFAssetDuring(em, Entities.TransferToCoreVaultStarted, 'value_uba', from, to)
  }

  protected async coreVaultInflowDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const [transferred, donated, directMint, directMintSA] = await Promise.all([
      this.sumByFAssetDuring(em, Entities.TransferToCoreVaultSuccessful, 'value_uba', from, to),
      this.sumByFAssetDuring(em, Entities.CoreVaultFundsAdded, 'amount_uba', from, to),
      this.sumByFAssetDuring(em, Entities.DirectMintingExecuted, 'minted_amount_uba', from, to),
      this.sumByFAssetDuring(em, Entities.DirectMintingExecutedToSmartAccount, 'minted_amount_uba', from, to)
    ])
    return [transferred, donated, directMint, directMintSA].reduce((acc, r) => this.transformFAssetValueResults(acc, r, add))
  }

  protected async coreVaultReturnOutflowDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    return this.sumByFAssetDuring(em, Entities.ReturnFromCoreVaultConfirmed, 'received_underlying_uba', from, to)
  }

  protected async coreVaultRedeemOutflowDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    return this.sumByFAssetDuring(em, Entities.CoreVaultRedemptionRequested, 'value_uba', from, to)
  }

  protected async coreVaultOutflowDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const [returns, redeems] = await Promise.all([
      this.coreVaultReturnOutflowDuring(em, from, to),
      this.coreVaultRedeemOutflowDuring(em, from, to)
    ])
    return this.transformFAssetValueResults(returns, redeems, add)
  }

  protected async coreVaultBalanceDuring(em: EntityManager, from: number, to: number): Promise<FAssetValueResult> {
    const [inflow, outflow] = await Promise.all([
      this.coreVaultInflowDuring(em, from, to),
      this.coreVaultOutflowDuring(em, from, to)
    ])
    return this.transformFAssetValueResults(inflow, outflow, sub)
  }

  protected async trackedAgentBackingAt(em: EntityManager, timestamp: number): Promise<FAssetValueResult> {
    const res = await em.getConnection('read').execute(UNDERLYING_AGENT_BALANCE, [timestamp]) as {
      fasset: FAssetType, total_balance: string
    }[]
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

  /**
   * SUM a snake_case column on a FAssetEventBound entity, grouped by fasset,
   * restricted to events whose block timestamp falls in [from, to).
   * Optionally filters by an EvmAddress relation on the entity.
   */
  protected async sumByFAssetDuring<T extends object>(
    em: EntityManager, entity: new () => T, column: string,
    from: number, to: number,
    addressFilter?: { join: string, hex: string }
  ): Promise<FAssetValueResult> {
    let qb = em.createQueryBuilder(entity, 'e')
      .select(['e.fasset', raw(`sum(e.${column}) as value`)])
      .join('e.evmLog', 'el')
      .join('el.block', 'eb')
      .where({ 'eb.timestamp': { $gte: from, $lt: to } })
      .groupBy('e.fasset')
    if (addressFilter != null) {
      qb = qb.join(`e.${addressFilter.join}`, 'af').andWhere({ 'af.hex': addressFilter.hex })
    }
    const result = await qb.execute() as { fasset: FAssetType, value: string }[]
    return this.convertOrmResultToFAssetValueResult(result, 'value')
  }

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
    const buckets = Array.from({ length: npoints }, (_, i) => ({
      i, si: start + i * interval, ei: start + (i + 1) * interval
    }))
    for (const { i, si, ei } of buckets) {
      for (const fasset of this.supportedFAssets) {
        if (i === 0) ret[fasset] = []
        ret[fasset].push({ index: i, start: si, end: ei, value: BigInt(0) })
      }
    }
    const results = await Promise.all(buckets.map(({ si, ei }) => query(si, ei)))
    for (let i = 0; i < npoints; i++) {
      for (const [fasset, { value }] of Object.entries(results[i])) {
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
    for (const [i, timestamp] of timestamps.entries()) {
      for (const fasset of this.supportedFAssets) {
        if (i === 0) ret[fasset] = []
        ret[fasset].push({ timestamp, value: BigInt(0) })
      }
    }
    const results = await Promise.all(timestamps.map(t => fun(t)))
    for (let i = 0; i < timestamps.length; i++) {
      for (const [fasset, { value }] of Object.entries(results[i])) {
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

  protected transformFAssetTimespan<T, U>(
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

  protected transformTimespan<T, U>(
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

}