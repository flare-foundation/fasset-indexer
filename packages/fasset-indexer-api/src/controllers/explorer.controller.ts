import { Controller, Get, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor } from '@nestjs/cache-manager'
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { ExplorerService } from '../services/explorer.service'
import { apiResponse, ApiResponse } from '../shared/api-response'
import {
  type MintTransactionDetails,
  type RedeemTransactionDetails,
  type RetrunFromCoreVaultTransactionDetails,
  type TransferToCoreVaultTransactionDetails,
  type TransactionsInfo,
  type GenericTransactionClassification,
  TransactionType
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
  @ApiQuery({ name: 'user', type: String, required: false })
  @ApiQuery({ name: 'agent', type: String, required: false })
  @ApiQuery({ name: 'start', type: Number, required: false })
  @ApiQuery({ name: 'end', type: Number, required: false })
  @ApiQuery({ name: 'asc', type: Boolean, required: false })
  @ApiQuery({ name: 'types', type: String, isArray: true, required: false })
  getTransactions(
    @Query('limit', ParseIntPipe) limit: number,
    @Query('offset', ParseIntPipe) offset: number,
    @Query('user') user?: string,
    @Query('agent') agent?: string,
    @Query('asc') asc?: boolean,
    @Query('start', new ParseIntPipe({ optional: true })) start?: number,
    @Query('end', new ParseIntPipe({ optional: true })) end?: number,
    @Query('types') types?: string | string[]
  ): Promise<ApiResponse<TransactionsInfo>> {
    if (types != null && typeof types == 'string') types = [types]
    const transactionTypes = types != null ? this.parseTransactionTypes(types as string[]) : null
    return apiResponse(this.service.transactions(limit, offset, user, agent, start, end, asc, transactionTypes), 200)
  }

  @Get('transaction-classification')
  @ApiOperation({ summary: 'Classify given native or underlying transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getTransactionClassification(
    @Query('hash') hash: string
  ): Promise<ApiResponse<GenericTransactionClassification>> {
    return apiResponse(this.service.transactionClassification(hash), 200)
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
  ): Promise<ApiResponse<RetrunFromCoreVaultTransactionDetails>> {
    return apiResponse(this.service.returnFromCoreVaultTransactionDetails(hash), 200)
  }

  private parseTransactionTypes(types: string[]): TransactionType[] {
    return types.map(t => TransactionType[t])
  }
}