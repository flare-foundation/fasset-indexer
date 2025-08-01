import { Controller, Get } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { ApiResponse, apiResponse } from "../shared/api-response"
import { MetadataService } from "../services/metadata.service"

@ApiTags("Metadata")
@Controller("api/metadata")
export class MetadataController {
  constructor(private readonly service: MetadataService) {}

  @Get('/cache')
  getCache(): Promise<string[]> {
    return this.service.keys()
  }

  @Get('/current-block')
  getCurrentBlock(): Promise<ApiResponse<number | null>> {
    return apiResponse(this.service.currentBlock(), 200)
  }

  @Get('/blocks-for-current-update-sync')
  getBlocksToBackSync(): Promise<ApiResponse<[string | null, number | null]>> {
    return apiResponse(this.service.blocksToBackSync(), 200)
  }

}