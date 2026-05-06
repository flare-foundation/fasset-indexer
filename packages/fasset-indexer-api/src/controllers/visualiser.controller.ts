import { Controller, Get, ParseBoolPipe, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor } from '@nestjs/cache-manager'
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { type FAsset } from 'fasset-indexer-core'
import { VisualiserService } from '../services/visualiser.service'
import { apiResponse, type ApiResponse } from '../shared/api-response'
import { unixnow } from '../shared/utils'
import * as VT from '../analytics/visualiser-types'


@ApiTags('Visualiser')
@UseInterceptors(CacheInterceptor)
@Controller('api/visualiser')
export class VisualiserController {
  constructor(private readonly service: VisualiserService) { }

  //////////////////////////////////////////////////////////////////////
  // overview

  @Get('overview')
  @ApiOperation({
    summary: 'Bundled scene snapshot for the visualiser frontend on first load',
    description: 'Returns chain, supported FAssets, latest block, lot sizes, FAsset supplies, tracked agent backing, prices, and agent counts in a single call.'
  })
  getSystemOverview(): Promise<ApiResponse<VT.SystemOverview>> {
    return apiResponse(this.service.systemOverview(), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // agents

  @Get('agents')
  @ApiOperation({ summary: 'All agent vaults with their full live state (status, CRs, collateral, in-flight UBA)' })
  @ApiQuery({ name: 'fasset', type: String, required: false, description: 'Filter by FAsset (FXRP, FBTC, ...)' })
  @ApiQuery({ name: 'status', type: Number, required: false, description: '0=Normal, 1=CCB, 2=Liquidation, 3=FullLiquidation, 4=Destroying' })
  @ApiQuery({ name: 'available', type: Boolean, required: false, description: 'Only publicly available agents' })
  getAgents(
    @Query('fasset') fasset?: string,
    @Query('status', new ParseIntPipe({ optional: true })) status?: number,
    @Query('available', new ParseBoolPipe({ optional: true })) available?: boolean
  ): Promise<ApiResponse<VT.AgentOverview[]>> {
    const filter = {
      fasset: fasset as FAsset | undefined,
      status: status as VT.AgentStatus | undefined,
      available
    }
    return apiResponse(this.service.agents(filter), 200)
  }

  @Get('agents/by-vault')
  @ApiOperation({ summary: 'Single agent vault detail by vault address' })
  @ApiQuery({ name: 'vault', type: String, required: true })
  getAgent(@Query('vault') vault: string): Promise<ApiResponse<VT.AgentOverview | null>> {
    return apiResponse(this.service.agent(vault), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // live state

  @Get('prices')
  @ApiOperation({ summary: 'Latest FTSO price feeds with timestamps' })
  getPrices(): Promise<ApiResponse<VT.PriceTick[]>> {
    return apiResponse(this.service.prices(), 200)
  }

  @Get('redemption-tickets/active')
  @ApiOperation({ summary: 'Active (undestroyed) redemption tickets — the agent queue depth' })
  @ApiQuery({ name: 'fasset', type: String, required: false })
  @ApiQuery({ name: 'agent', type: String, required: false, description: 'Agent vault address' })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  getActiveTickets(
    @Query('fasset') fasset?: string,
    @Query('agent') agent?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ): Promise<ApiResponse<VT.ActiveRedemptionTicket[]>> {
    return apiResponse(this.service.activeRedemptionTickets(fasset as FAsset | undefined, agent, limit ?? 200), 200)
  }

  @Get('mintings/active')
  @ApiOperation({ summary: 'Collateral reservations awaiting underlying payment (in-flight mints)' })
  @ApiQuery({ name: 'fasset', type: String, required: false })
  @ApiQuery({ name: 'agent', type: String, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  getActiveMintings(
    @Query('fasset') fasset?: string,
    @Query('agent') agent?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ): Promise<ApiResponse<VT.ActiveMinting[]>> {
    return apiResponse(this.service.activeMintings(fasset as FAsset | undefined, agent, limit ?? 200), 200)
  }

  @Get('redemptions/active')
  @ApiOperation({ summary: 'Redemption requests awaiting agent payment or default (in-flight redemptions)' })
  @ApiQuery({ name: 'fasset', type: String, required: false })
  @ApiQuery({ name: 'agent', type: String, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  getActiveRedemptions(
    @Query('fasset') fasset?: string,
    @Query('agent') agent?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ): Promise<ApiResponse<VT.ActiveRedemption[]>> {
    return apiResponse(this.service.activeRedemptions(fasset as FAsset | undefined, agent, limit ?? 200), 200)
  }

  @Get('liquidations/active')
  @ApiOperation({ summary: 'Agents currently in CCB / Liquidation / FullLiquidation' })
  getActiveLiquidations(): Promise<ApiResponse<VT.ActiveLiquidation[]>> {
    return apiResponse(this.service.activeLiquidations(), 200)
  }

  @Get('challenges')
  @ApiOperation({ summary: 'Recent challenge events (illegal payment, duplicate payment, underlying balance too low)' })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'offset', type: Number, required: false })
  getChallenges(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number
  ): Promise<ApiResponse<VT.ChallengeEvent[]>> {
    return apiResponse(this.service.challenges(limit ?? 100, offset ?? 0), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // delta event feed

  @Get('events')
  @ApiOperation({
    summary: 'Cursor-based event delta feed for the visualiser bridge',
    description: 'Returns protocol events at block.timestamp >= since, ordered ascending. The bridge polls this with the cursor returned by the previous call.'
  })
  @ApiQuery({ name: 'since', type: Number, required: false, description: 'Unix timestamp seconds; defaults to now-300' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Max events to return (cap 500)' })
  getEvents(
    @Query('since', new ParseIntPipe({ optional: true })) since?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ): Promise<ApiResponse<VT.VisualiserEventFeed>> {
    const sinceTs = since ?? unixnow() - 300
    return apiResponse(this.service.eventsSince(sinceTs, limit ?? 200), 200)
  }
}
