import { Controller, Get, ParseBoolPipe, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager'
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { FAssetType } from 'fasset-indexer-core'
import { unixnow } from '../shared/utils'
import { DashboardService } from '../services/dashboard.service'
import { apiResponse, type ApiResponse } from '../shared/api-response'
import {
  CP_SCORE_MIN_POOL_COLLATERAL_WEI,
  MAX_RETURNED_OBJECTS,
  MAX_TIMESERIES_PTS,
  MAX_TIMESPAN_PTS
} from '../config/constants'
import type { RedemptionDefault } from 'fasset-indexer-core/entities'
import type {
  AmountResult, TimeSeries, Timespan, TokenPortfolio,
  FAssetCollateralPoolScore, FAssetValueResult,
  FAssetAmountResult, FAssetTimespan
} from '../analytics/interface'


@ApiTags('Dashboard')
@UseInterceptors(CacheInterceptor)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) { }

  //////////////////////////////////////////////////////////////////////
  // system

  @Get('transaction-count')
  @ApiOperation({ summary: 'Number of FAsset transactions' })
  getTransactionCount(): Promise<ApiResponse<AmountResult>> {
    return apiResponse(this.service.transactionCount(), 200)
  }

  @Get('fasset-holder-count')
  @ApiOperation({ summary: 'Number of fasset token holders' })
  getFAssetHolderCount(): Promise<ApiResponse<FAssetAmountResult>> {
    return apiResponse(this.service.fAssetholderCount(), 200)
  }

  @Get('performed-liquidation-count')
  @ApiOperation({ summary: 'Number of performed liquidations' })
  getLiquidationCount(): Promise<ApiResponse<AmountResult>> {
    return apiResponse(this.service.liquidationCount(), 200)
  }

  @Get('minting-executed-count')
  @ApiOperation({ summary: 'Number of executed mintings' })
  getMintingExecutedCount(): Promise<ApiResponse<AmountResult>> {
    return apiResponse(this.service.mintingExecutedCount(), 200)
  }

  @Get('total-redeemed-lots')
  @ApiOperation({ summary: 'Number of redeemed lots' })
  getRedeemedLots(): Promise<ApiResponse<FAssetAmountResult>> {
    return apiResponse(this.service.totalRedeemedLots(), 200)
  }

  @Get('redemption-default?')
  @ApiOperation({ summary: 'Redemption deault data' })
  getRedemptionDefault(@Query('id') id: number, @Query('fasset') fasset: string): Promise<ApiResponse<RedemptionDefault>> {
    return apiResponse(this.service.redemptionDefault(id, FAssetType[fasset]), 200)
  }

  @Get('/total-tracked-underlying-agent-backing?')
  @ApiOperation({ summary: 'Total underlying assets tracked by the contracts' })
  getTrackedUnderlyingBacking(): Promise<ApiResponse<FAssetValueResult>>{
    return apiResponse(this.service.trackedAgentUnderlyingBacking(), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // agents

  @Get('agent-minting-executed-count?')
  @ApiOperation({ summary: 'Number of executed mintings by agent' })
  getAgentMintingExecutedCount(@Query('agent') agent: string): Promise<ApiResponse<AmountResult>> {
    return apiResponse(this.service.agentMintingExecutedCount(agent), 200)
  }

  @Get('agent-redemption-success-rate?')
  @ApiOperation({ summary: 'Redemption success rate by agent' })
  getAgentRedemptionSuccessRate(@Query('agent') agent: string): Promise<ApiResponse<AmountResult>> {
    return apiResponse(this.service.agentRedemptionSuccessRate(agent), 200)
  }

  @Get('agent-performed-liquidation-count?')
  @ApiOperation({ summary: 'Number of performed liquidations by agent' })
  getAgentLiquidationCount(@Query('agent') agent: string): Promise<ApiResponse<AmountResult>> {
    return apiResponse(this.service.agentLiquidationCount(agent), 200)
  }

  /////////////////////////////////////////////////////////////////////
  // collateral pools

  @Get('collateral-pool-transactions-count')
  @ApiOperation({ summary: 'Number of FAsset transactions related to collateral pools' })
  getPoolTransactionCount(): Promise<ApiResponse<AmountResult>> {
    return apiResponse(this.service.poolTransactionsCount(), 200)
  }

  @Get('best-performing-collateral-pools?')
  @CacheTTL(3600) // heavy calculation, cache for an hour
  @ApiOperation({ summary: 'The main collateral pools to advertise' })
  @ApiQuery({ name: "minNatWei", type: String, required: false })
  getBestCollateralPools(
    @Query('n', ParseIntPipe) n: number,
    @Query('minNatWei') minNatWei?: string
  ): Promise<ApiResponse<FAssetCollateralPoolScore>> {
    const err = this.restrictReturnedObjects(n)
    if (err !== null) return apiResponse(Promise.reject(err), 400)
    return apiResponse(this.service.bestCollateralPools(n, BigInt(minNatWei) ?? CP_SCORE_MIN_POOL_COLLATERAL_WEI,
      unixnow(), 3600 * 24 * 7, 100), 200)
  }

  @Get('user-collateral-pool-token-portfolio?')
  @ApiOperation({ summary: 'User\'s collateral pool token portfolio' })
  getUserCollateralPoolTokenPortfolio(
    @Query('user') user: string
  ): Promise<ApiResponse<TokenPortfolio>> {
    return apiResponse(this.service.userCollateralPoolTokenPortfolio(user), 200)
  }

  @Get('total-claimed-pool-fees?')
  @ApiOperation({ summary: 'Total claimed collateral pool fees' })
  @ApiQuery({ name: "pool", type: String, required: false })
  @ApiQuery({ name: "user", type: String, required: false })
  getTotalClaimedPoolFees(
    @Query('pool') pool?: string,
    @Query('user') user?: string
  ): Promise<ApiResponse<FAssetValueResult>> {
    return apiResponse(this.service.totalClaimedPoolFees(pool, user), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // timespan

  @Get('/timespan/fasset-supply?')
  @ApiOperation({ summary: 'Timespan of fasset supply along timestamps' })
  @ApiQuery({ name: 'timestamps', type: Number, isArray: true })
  getFassetSupplyDiff(
    @Query('timestamps') timestamps: string | string[]
  ): Promise<ApiResponse<FAssetTimespan<bigint>>> {
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
    return apiResponse(this.service.fAssetSupplyTimespan(ts), 200)
  }

  @Get('/timespan/pool-collateral?')
  @ApiOperation({ summary: 'Timespan of pool collateral along timestamps' })
  @ApiQuery({ name: 'timestamps', type: Number, isArray: true })
  @ApiQuery({ name: "pool", type: String, required: false })
  getPoolCollateralDiff(
    @Query('timestamps') timestamps: string | string[],
    @Query('pool') pool?: string
  ): Promise<ApiResponse<Timespan<bigint>>> {
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
    return apiResponse(this.service.poolCollateralTimespan(ts, pool), 200)
  }

  @Get('/timespan/claimed-pool-fees?')
  @ApiOperation({ summary: 'Timespan of collected pool fees along timestamps' })
  @ApiQuery({ name: "timestamps", type: Number, isArray: true })
  @ApiQuery({ name: "pool", type: String, required: false })
  @ApiQuery({ name: "usd", type: Boolean, required: false })
  getPoolFeesDiff(
    @Query('timestamps') timestamps: string | string[],
    @Query('pool') pool?: string,
    @Query('usd', new ParseBoolPipe({ optional: true })) usd?: boolean
  ): Promise<ApiResponse<FAssetTimespan<bigint> | Timespan<bigint>>> {
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
    if (usd === true) {
      return apiResponse(this.service.claimedPoolFeesAggregateTimespan(ts), 200)
    } else {
      return apiResponse(this.service.claimedPoolFeesTimespan(ts, pool, undefined), 200)
    }
  }

  @Get('timespan/core-vault-inflows?')
  @ApiOperation({ summary: 'Timespan of inflows to the core vault by fasset' })
  @ApiQuery({ name: "timestamps", type: Number, isArray: true })
  getCoreVaultInflowTimespan(
    @Query('timestamps') timestamps: string | string[]
  ): Promise<ApiResponse<FAssetTimespan<bigint>>> {
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
    return apiResponse(this.service.coreVaultInflowTimespan(ts), 200)
  }

  @Get('/timespan/core-vault-inflows-usd?')
  @ApiOperation({ summary: 'Timespan of inflows to the core vault aggregated in $' })
  @ApiQuery({ name: "timestamps", type: Number, isArray: true })
  getCoreVaultInflowsAggregateTimespan(
    @Query('timestamps') timestamps: string | string[]
  ): Promise<ApiResponse<Timespan<bigint>>>{
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
    return apiResponse(this.service.coreVaultInflowAggregateTimespan(ts), 200)
  }

  @Get('/timespan/core-vault-outflows?')
  @ApiOperation({ summary: 'Timespan of outflows to the core vault vault by fasset' })
  @ApiQuery({ name: "timestamps", type: Number, isArray: true })
  getCoreVaultOutflowTimespan(
    @Query('timestamps') timestamps: string | string[]
  ): Promise<ApiResponse<FAssetTimespan<bigint>>>{
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
    return apiResponse(this.service.coreVaultOutflowTimespan(ts), 200)
  }

  @Get('/timespan/core-vault-outflows-usd?')
  @ApiOperation({ summary: 'Timespan of outflows to the core vault aggregated in $' })
  @ApiQuery({ name: "timestamps", type: Number, isArray: true })
  getCoreVaultOutflowAggregateTimespan(
    @Query('timestamps') timestamps: string | string[]
  ): Promise<ApiResponse<Timespan<bigint>>>{
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
    return apiResponse(this.service.coreVaultOutflowAggregateTimespan(ts), 200)
  }

  @Get('/timespan/core-vault-balance-usd?')
  @ApiOperation({ summary: 'Timespan of core vault balance aggregated in $' })
  @ApiQuery({ name: "timestamps", type: Number, isArray: true })
  getCoreVaultBalanceAggregateTimespan(
    @Query('timestamps') timestamps: string | string[]
  ): Promise<ApiResponse<Timespan<bigint>>>{
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
      return apiResponse(this.service.coreVaultBalanceAggregateTimespan(ts), 200)
  }

  @Get('/timespan/tracked-underlying-backing-ratio?')
  @ApiOperation({ summary: 'Timespan of the ratio between issued FAssets and backed Assets' })
  @ApiQuery({ name: "timestamps", type: Number, isArray: true })
  getTrackedUnderlyingBackingRatioTimespan(
    @Query('timestamps') timestamps: string | string[]
  ): Promise<ApiResponse<FAssetTimespan<number>>>{
    const ts = this.parseTimestamps(timestamps)
    const er = this.restrictTimespan(ts)
    if (er !== null) return apiResponse(Promise.reject(er), 400)
      return apiResponse(this.service.trackedUnderlyingBackingRatioTimeSeries(ts), 200)
  }

  ///////////////////////////////////////////////////////////////
  // timeseries

  @Get('/timeseries/redeemed?')
  @ApiOperation({ summary: 'Time series of the total $ value of redeemed FAssets' })
  @ApiQuery({ name: "startTime", type: Number, required: false })
  getTimeSeriesRedeemed(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<TimeSeries<bigint>>> {
    const err = this.restrictPoints(end, npoints, start)
    if (err !== null) return apiResponse(Promise.reject(err), 400)
    return apiResponse(this.service.redeemedAggregateTimeSeries(end, npoints, start), 200)
  }

  @Get('/timeseries/minted?')
  @ApiOperation({ summary: 'Time series of the total $ value of minted FAssets' })
  @ApiQuery({ name: "startTime", type: Number, required: false })
  getTimeSeriesMinted(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<TimeSeries<bigint>>> {
    const err = this.restrictPoints(end, npoints, start)
    if (err !== null) return apiResponse(Promise.reject(err), 400)
    return apiResponse(this.service.mintedAggregateTimeSeries(end, npoints, start), 200)
  }

  @Get('/timeseries/core-vault-inflow?')
  @ApiOperation({ summary: 'Time series of the total $ inflow of assets to core vault' })
  @ApiQuery({ name: "startTime", type: Number, required: false })
  getTimeSeriesCoreVaultInflow(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<TimeSeries<bigint>>> {
    const err = this.restrictPoints(end, npoints, start)
    if (err !== null) return apiResponse(Promise.reject(err), 400)
    return apiResponse(this.service.coreVaultInflowAggregateTimeSeries(end, npoints, start), 200)
  }

  @Get('/timeseries/core-vault-outflow?')
  @ApiOperation({ summary: 'Time series of the total $ outflow of assets from core vault' })
  @ApiQuery({ name: "startTime", type: Number, required: false })
  getTimeSeriesCoreVaultOutflow(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<TimeSeries<bigint>>> {
    const err = this.restrictPoints(end, npoints, start)
    if (err !== null) return apiResponse(Promise.reject(err), 400)
    return apiResponse(this.service.coreVaultOutflowAggregateTimeSeries(end, npoints, start), 200)
  }

  @Get('/timeseries/core-vault-tvl?')
  @ApiOperation({ summary: 'Time series of the total $ TVL of core vault (currently just XRP balance value)' })
  @ApiQuery({ name: "startTime", type: Number, required: false })
  getTimeSeriesCoreVaultTvl(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<TimeSeries<bigint>>> {
    const err = this.restrictPoints(end, npoints, start)
    if (err !== null) return apiResponse(Promise.reject(err), 400)
    return apiResponse(this.service.coreVaultBalanceAggregateTimeSeries(end, npoints, start), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // helpers

  protected parseTimestamps(timestamps: string | string[]): number[] {
    if (typeof timestamps === 'string') {
      return timestamps.split(',').map(x => parseInt(x))
    }
    return timestamps.map(x => parseInt(x))
  }

  private restrictTimespan(timespan: number[]): Error | null {
    if (timespan.length > MAX_TIMESPAN_PTS) {
      return new Error(`Timespan must be an array of maximum ${MAX_TIMESPAN_PTS} timestamps`)
    }
    return null
  }

  private restrictPoints(end: number, npoints: number, start?: number): Error | null {
    if (npoints > MAX_TIMESERIES_PTS) {
      return new Error(`Cannot request more than ${MAX_TIMESERIES_PTS} points`)
    }
    return null
  }

  private restrictReturnedObjects(n: number): Error | null {
    if (n > MAX_RETURNED_OBJECTS) {
      return new Error(`Cannot request more than ${MAX_RETURNED_OBJECTS} objects`)
    }
    return null
  }
}