import { Controller, Get, Query } from "@nestjs/common"
import { ApiQuery, ApiTags } from "@nestjs/swagger"
import { ApiResponse, apiResponse } from "../shared/api-response"
import { StatisticsService } from "../services/statistics.service"
import { unixnow } from "../shared/utils"
import type { StatisticAverage } from "../analytics/types"

const STAT_LIMIT = 100
const DELTA = 60 * 60 * 24 * 7 // one week

@ApiTags("Statistics")
@Controller("api/statistics")
export class StatisticsController {
  constructor(private readonly service: StatisticsService) {}

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