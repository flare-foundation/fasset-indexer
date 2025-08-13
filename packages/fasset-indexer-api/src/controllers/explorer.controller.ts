import { Controller, Get, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor } from '@nestjs/cache-manager'
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { ExplorerService } from '../services/explorer.service'
import { apiResponse, ApiResponse } from '../shared/api-response'
import type {
  MintTransactionDetails, RedeemTransactionDetails,
  ReturnFromCoreVaultTransactionDetails,
  TransactionInfo, TransferToCoreVaultTransactionDetails
} from '../analytics/interface'


@ApiTags('FAsset Explorer')
@UseInterceptors(CacheInterceptor)
@Controller('api/explorer')
export class ExplorerController {
  constructor(private readonly service: ExplorerService) {}

  @Get('transactions')
  @ApiOperation({ summary: 'Transactions tracked by the FAsset explorer' })
  @ApiQuery({ name: 'limit', type: Number })
  @ApiQuery({ name: "offset", type: Number })
  getTransactions(
    @Query('limit', ParseIntPipe) limit: number,
    @Query('offset', ParseIntPipe) offset: number,
  ): Promise<ApiResponse<TransactionInfo[]>> {
    return apiResponse(this.service.transactions(limit, offset), 200)
  }

  @Get('transactions-details/minting')
  @ApiOperation({ summary: 'Progression details for the given collateral reservation request transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getMintingTransactionDetails(
    @Query('hash') hash: string,
  ): Promise<ApiResponse<MintTransactionDetails>> {
    return apiResponse(this.service.mintingTransactionDetails(hash), 200)
  }

  @Get('transactions-details/redemption')
  @ApiOperation({ summary: 'Progression details for the given redemption request transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getRedemptionTransactionDetails(
    @Query('hash') hash: string,
  ): Promise<ApiResponse<RedeemTransactionDetails>> {
    return apiResponse(this.service.redemptionTransactionDetails(hash), 200)
  }

  @Get('transactions-details/transfer-to-core-vault')
  @ApiOperation({ summary: 'Progression details for the given core vault transfer request transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getCoreVaultTransferTransactionDetails(
    @Query('hash') hash: string,
  ): Promise<ApiResponse<TransferToCoreVaultTransactionDetails>> {
    return apiResponse(this.service.transferToCoreVaultTransactionDetails(hash), 200)
  }

  @Get('transactions-details/return-from-core-vault')
  @ApiOperation({ summary: 'Progression details for the given return from core vault request transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getReturnFromCoreVaultTransactionDetails(
    @Query('hash') hash: string,
  ): Promise<ApiResponse<ReturnFromCoreVaultTransactionDetails>> {
    return apiResponse(this.service.returnFromCoreVaultTransactionDetails(hash), 200)
  }

}