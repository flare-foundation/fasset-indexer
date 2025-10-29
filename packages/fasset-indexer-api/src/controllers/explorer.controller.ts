import { Controller, Get, ParseBoolPipe, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor } from '@nestjs/cache-manager'
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { FAssetType } from 'fasset-indexer-core'
import { ExplorerService } from '../services/explorer.service'
import { DashboardService } from '../services/dashboard.service'
import { apiResponse, ApiResponse } from '../shared/api-response'
import { MAX_TIMESERIES_PTS } from '../config/constants'
import * as Types from '../analytics/types'


@ApiTags('FAsset Explorer')
@UseInterceptors(CacheInterceptor)
@Controller('api/explorer')
export class ExplorerController {
  constructor(
    private readonly service: ExplorerService,
    private readonly dashboard: DashboardService
  ) { }

  @Get('statistics')
  @ApiOperation({ summary: 'Explorer Statistics' })
  @ApiQuery({ name: 'start', type: Number, required: false })
  @ApiQuery({ name: 'end', type: Number, required: false })
  getStatistics(
    @Query('start', new ParseIntPipe({ optional: true })) start?: number,
    @Query('end', new ParseIntPipe({ optional: true })) end?: number,
  ): Promise<ApiResponse<Types.ExplorerAggregateStatistics>> {
    return apiResponse(this.service.statistics(start, end), 200)
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Transactions tracked by the FAsset explorer' })
  @ApiQuery({ name: 'limit', type: Number })
  @ApiQuery({ name: "offset", type: Number })
  @ApiQuery({ name: 'user', type: String, required: false })
  @ApiQuery({ name: 'agent', type: String, required: false })
  @ApiQuery({ name: 'start', type: Number, required: false })
  @ApiQuery({ name: 'end', type: Number, required: false })
  @ApiQuery({ name: 'asc', type: Boolean, required: false })
  @ApiQuery({ name: 'status', type: Number, required: false })
  @ApiQuery({ name: 'types', type: String, isArray: true, required: false })
  getTransactions(
    @Query('limit', ParseIntPipe) limit: number,
    @Query('offset', ParseIntPipe) offset: number,
    @Query('user') user?: string,
    @Query('agent') agent?: string,
    @Query('asc', new ParseBoolPipe({ optional: true })) asc?: boolean,
    @Query('start', new ParseIntPipe({ optional: true })) start?: number,
    @Query('end', new ParseIntPipe({ optional: true })) end?: number,
    @Query('status', new ParseIntPipe({ optional: true })) status?: number,
    @Query('types') types?: string | string[]
  ): Promise<ApiResponse<Types.TransactionsInfo>> {
    if (types != null && typeof types == 'string') types = [types]
    const transactionTypes = types != null ? this.parseTransactionTypes(types as string[]) : undefined
    return apiResponse(this.service.transactions(limit, offset, user, agent, start, end, asc, status, transactionTypes), 200)
  }

  @Get('transaction-classification')
  @ApiOperation({ summary: 'Classify given native or underlying transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getTransactionClassification(
    @Query('hash') hash: string
  ): Promise<ApiResponse<Types.GenericTransactionClassification>> {
    return apiResponse(this.service.transactionClassification(hash), 200)
  }

  @Get('transactions-details/minting')
  @ApiOperation({ summary: 'Progression details for the given collateral reservation request transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getMintingTransactionDetails(
    @Query('hash') hash: string,
  ): Promise<ApiResponse<Types.MintTransactionDetails>> {
    return apiResponse(this.service.mintingTransactionDetails(hash), 200)
  }

  @Get('transactions-details/redemption')
  @ApiOperation({ summary: 'Progression details for the given redemption request transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getRedemptionTransactionDetails(
    @Query('hash') hash: string,
  ): Promise<ApiResponse<Types.RedeemTransactionDetails>> {
    return apiResponse(this.service.redemptionTransactionDetails(hash), 200)
  }

  @Get('transactions-details/transfer-to-core-vault')
  @ApiOperation({ summary: 'Progression details for the given core vault transfer request transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getCoreVaultTransferTransactionDetails(
    @Query('hash') hash: string,
  ): Promise<ApiResponse<Types.TransferToCoreVaultTransactionDetails>> {
    return apiResponse(this.service.transferToCoreVaultTransactionDetails(hash), 200)
  }

  @Get('transactions-details/return-from-core-vault')
  @ApiOperation({ summary: 'Progression details for the given return from core vault request transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getReturnFromCoreVaultTransactionDetails(
    @Query('hash') hash: string,
  ): Promise<ApiResponse<Types.ReturnFromCoreVaultTransactionDetails>> {
    return apiResponse(this.service.returnFromCoreVaultTransactionDetails(hash), 200)
  }

  @Get('transaction-details/self-mint')
  @ApiOperation({ summary: 'Progression details for the given self mint transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getSelfMintTransactionDetails(
    @Query('hash') hash: string
  ): Promise<ApiResponse<Types.SelfMintTransactionDetails>> {
    return apiResponse(this.service.selfMintTransactionDetails(hash), 200)
  }

  @Get('transaction-details/agent-balance-topup')
  @ApiOperation({ summary: 'Progression details for the given agent balance topup transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getUnderlyingBalanceTopupTransactionDetails(
    @Query('hash') hash: string
  ): Promise<ApiResponse<Types.BalanceTopupTransactionDetails>> {
    return apiResponse(this.service.underlyingBalanceToppedUpTransactionDetails(hash), 200)
  }

  @Get('transaction-details/agent-balance-withdrawal')
  @ApiOperation({ summary: 'Progression details for the given agent balance topup transaction' })
  @ApiQuery({ name: 'hash', type: String })
  getAgentBalanceWithdrawalTransactionDetails(
    @Query('hash') hash: string
  ): Promise<ApiResponse<Types.WithdrawalTransactionDetails>> {
    return apiResponse(this.service.underlyingWithdrawalTransactionDetails(hash), 200)
  }

  @Get('/timeseries/redeemed?')
  @ApiOperation({ summary: 'Time series of the total redeemed FXRP' })
  @ApiQuery({ name: "startTime", type: Number, required: false })
  getTimeSeriesRedeemed(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<Types.FAssetTimeSeries<bigint>>> {
    const err = this.restrictPoints(end, npoints, start)
    if (err !== null) return apiResponse(Promise.reject(err), 400)
    const key = FAssetType[FAssetType.FXRP]
    return apiResponse(this.dashboard.redeemedTimeSeries(end, npoints, start).then(x => x[key]), 200)
  }

  @Get('/timeseries/minted?')
  @ApiOperation({ summary: 'Time series of the total minted FXRP' })
  @ApiQuery({ name: "startTime", type: Number, required: false })
  getTimeSeriesMinted(
    @Query('endtime', ParseIntPipe) end: number,
    @Query('npoints', ParseIntPipe) npoints: number,
    @Query('startTime', new ParseIntPipe({ optional: true })) start?: number
  ): Promise<ApiResponse<Types.FAssetTimeSeries<bigint>>> {
    const err = this.restrictPoints(end, npoints, start)
    if (err !== null) return apiResponse(Promise.reject(err), 400)
    const key = FAssetType[FAssetType.FXRP]
    return apiResponse(this.dashboard.mintedTimeSeries(end, npoints, start).then(x => x[key]), 200)
  }

  private parseTransactionTypes(types: string[]): Types.TransactionType[] {
    return types.map(t => Types.TransactionType[t])
  }

  private restrictPoints(end: number, npoints: number, start?: number): Error | null {
    if (npoints > MAX_TIMESERIES_PTS) {
      return new Error(`Cannot request more than ${MAX_TIMESERIES_PTS} points`)
    }
    return null
  }
}