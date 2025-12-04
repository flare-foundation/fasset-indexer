import { Controller, Get, ParseIntPipe, Query } from "@nestjs/common"
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger"
import { unixnow } from "../shared/utils"
import { ApiResponse, apiResponse } from "../shared/api-response"
import { StatisticsService } from "../services/statistics.service"
import { DashboardService } from "../services/dashboard.service"
import type { FAssetTimeSeries, FAssetValueResult, StatisticAverage } from "../analytics/types"

const STAT_LIMIT = 100
const DELTA = 60 * 60 * 24 * 7 // one week

@ApiTags("Statistics")
@Controller("api/statistics")
export class StatisticsController {
  constructor(
    private readonly service: StatisticsService,
    private readonly dashboard: DashboardService
  ) { }

  @Get('/collateral-pool-score?')
  @ApiQuery({ name: 'pool', type: String, required: true })
  getCollateralPoolScore(
    @Query('pool') pool: string,
  ): Promise<ApiResponse<bigint>> {
    return apiResponse(this.service.collateralPoolScore(pool, unixnow(), DELTA, STAT_LIMIT), 200, false)
  }

  @Get('redemption-default-wa?')
  @ApiQuery({ name: 'vault', type: String, required: true })
  getRedemptionDefaultWA(
    @Query('vault') vault: string,
  ): Promise<ApiResponse<StatisticAverage>> {
    const now = unixnow()
    return apiResponse(this.structureReturn(this.service.redemptionDefaultWA(vault, now, DELTA, STAT_LIMIT), now), 200)
  }

  @Get('redemption-time-wa?')
  @ApiQuery({ name: 'vault', type: String, required: true })
  getRedemptionTimeWA(
    @Query('vault') vault: string
  ): Promise<ApiResponse<StatisticAverage>> {
    const now = unixnow()
    return apiResponse(this.structureReturn(this.service.redemptionTimeWA(vault, now, DELTA, STAT_LIMIT), now), 200)
  }

  @Get('liquidated-amount-wa?')
  @ApiQuery({ name: 'vault', type: String, required: true })
  getLiquidatedAmountWA(
    @Query('vault') vault: string
  ): Promise<ApiResponse<StatisticAverage>> {
    const now = unixnow()
    return apiResponse(this.structureReturn(this.service.liquidatedAmountWA(vault, now, DELTA, STAT_LIMIT), now), 200)
  }

  @Get('liquidated-duration-wa?')
  @ApiQuery({ name: 'vault', type: String, required: true })
  getLiquidatedDurationWA(
    @Query('vault') vault: string
  ): Promise<ApiResponse<StatisticAverage>> {
    const now = unixnow()
    return apiResponse(this.structureReturn(this.service.liquidationDurationWA(vault, now, DELTA, STAT_LIMIT), now), 200)
  }

  @Get('redemption-frequency-wa?')
  @ApiQuery({ name: 'vault', type: String, required: true })
  getRedemptionFrequencyWA(
    @Query('vault') vault: string
  ): Promise<ApiResponse<StatisticAverage>> {
    const now = unixnow()
    return apiResponse(this.structureReturn(this.service.redemptionCountWA(vault, now, DELTA, STAT_LIMIT), now), 200)
  }

  @Get('/timeseries/user-minted?')
  @ApiOperation({ summary: 'Time series of total user\'s minted FAssets' })
  @ApiQuery({ name: 'startTime', type: Number, required: false })
  getTimeSeriesUserMinted(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('user') user: string,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<FAssetTimeSeries<bigint>>> {
    if (npoints > 1) return apiResponse(Promise.reject('at most one point allowed'), 400)
    return apiResponse(this.dashboard.mintedTimeSeries(end, npoints, start, user), 200)
  }

  @Get('/timeseries/user-redeemed?')
  @ApiOperation({ summary: 'Time series of total user\'s redeemed FAssets' })
  @ApiQuery({ name: 'startTime', type: Number, required: false })
  getTimeSeriesUserRedeemed(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('user') user: string,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<FAssetTimeSeries<bigint>>> {
    if (npoints > 1) return apiResponse(Promise.reject('at most one point allowed'), 400)
    return apiResponse(this.dashboard.redeemedTimeSeries(end, npoints, start, user), 200)
  }

  @Get('/underlying-user-minted?')
  @ApiOperation({ summary: 'Minted amount of underlying user address' })
  getUnderlyingUserMinted(
    @Query('user') user: string,
    @Query('startTime', ParseIntPipe) start: number,
    @Query('endtime', ParseIntPipe) end: number,
  ): Promise<ApiResponse<FAssetValueResult>> {
    return apiResponse(this.service.mintedByUnderlyingAddressDuring(user, start, end), 200)
  }

  @Get('/underlying-user-redeemed?')
  @ApiOperation({ summary: 'Minted amount of underlying user address' })
  getUnderlyingUserRedeemed(
    @Query('user') user: string,
    @Query('startTime', ParseIntPipe) start: number,
    @Query('endtime', ParseIntPipe) end: number,
  ): Promise<ApiResponse<FAssetValueResult>> {
    return apiResponse(this.service.redeemedByUnderlyingAddressDuring(user, start, end), 200)
  }

  @Get('/underlying-minter-addresses?')
  @ApiOperation({ summary: 'Underlying addresses that the given user address minted from' })
  getUnderlyingMinterAddresses(
    @Query('user') user: string
  ): Promise<ApiResponse<string[]>> {
    return apiResponse(this.service.underlyingMinterAddresses(user), 200)
  }

  @Get('/minter-default-count?')
  @ApiOperation({ summary: 'Number of defaults by the given minter evm address' })
  getMinterDefaultCount(
    @Query('user') user: string
  ): Promise<ApiResponse<number>> {
    return apiResponse(this.service.minterDefaultCount(user), 200)
  }

  protected async structureReturn(prms: Promise<[bigint, number]>, now: number): Promise<StatisticAverage> {
    return prms.then(([avg, num]) => ({
      average: avg,
      total: num,
      limit: STAT_LIMIT,
      delta: DELTA,
      now
    }))
  }

}