import { CacheInterceptor } from "@nestjs/cache-manager"
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger"
import { Controller, Get, Param, UseInterceptors } from "@nestjs/common"
import { FxrpLaunchService } from "../services/fxrp-launch.service"
import { ApiResponse, apiResponse } from "../shared/api-response"
import { FAssetValueResult } from "../analytics/types"

@ApiTags('FXRP Launch')
@UseInterceptors(CacheInterceptor)
@Controller('api/fxrp-launch')
export class FxrpLaunch {
  constructor(private readonly service: FxrpLaunchService) { }

  @Get('/total-minted/:user/:from')
  @ApiOperation({ summary: 'Amount of FAsset user has minted from given timestamp on' })
  @ApiParam({ name: 'user', type: String, description: 'minting user' })
  @ApiParam({ name: "from", type: Number, description: 'time of first allowed minting' })
  getPoolCollateralDiff(
    @Param('user') user: string,
    @Param('from') from: number
  ): Promise<ApiResponse<FAssetValueResult>> {
    return apiResponse(this.service.mintedByUserFromTimestamp(user, from), 200)
  }
}