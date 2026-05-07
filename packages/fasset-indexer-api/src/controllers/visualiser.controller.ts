import { Controller, Get, Param, ParseBoolPipe, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor } from '@nestjs/cache-manager'
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
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

  @Get('scene')
  @ApiOperation({
    summary: 'Full scene snapshot in one round-trip',
    description: 'Bundles overview, agents, active mintings and active redemptions so the bridge can rehydrate the visualiser scene with one call instead of fanning out to several.'
  })
  getScene(): Promise<ApiResponse<VT.SceneSnapshot>> {
    return apiResponse(this.service.scene(), 200)
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

  @Get('agents/:vault/state')
  @ApiOperation({
    summary: 'Per-agent rollup: current state plus all in-flight flows for one vault',
    description: 'Returns the agent overview together with their active mintings, active redemptions, active redemption tickets, and current liquidation status — so the agent-detail panel can render from a single call instead of filtering global active lists client-side.'
  })
  @ApiParam({ name: 'vault', type: String, description: 'Agent vault address' })
  getAgentState(@Param('vault') vault: string): Promise<ApiResponse<VT.AgentState | null>> {
    return apiResponse(this.service.agentState(vault), 200)
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
  // flows

  @Get('flows/active')
  @ApiOperation({
    summary: 'Active in-flight flows (mint, redemption, transfer-to-core-vault, return-from-core-vault)',
    description: 'Returns one Flow per unresolved lifecycle object with a stable flowId and an embedded underlyingPayment field. Replaces the bridge\'s separate active-mintings + active-redemptions polls and removes the per-reservation underlying-payment polling.'
  })
  @ApiQuery({ name: 'fasset', type: String, required: false })
  @ApiQuery({ name: 'agent', type: String, required: false, description: 'Agent vault address' })
  getActiveFlows(
    @Query('fasset') fasset?: string,
    @Query('agent') agent?: string
  ): Promise<ApiResponse<VT.Flow[]>> {
    return apiResponse(this.service.activeFlows({
      fasset: fasset as FAsset | undefined,
      agentVault: agent
    }), 200)
  }

  @Get('flows')
  @ApiOperation({
    summary: 'Cursor-based delta feed of flow snapshots',
    description: 'Returns flows whose latest state-changing event occurred at timestamp >= since, with the current snapshot of each flow. The bridge polls this with the cursor returned by the previous call.'
  })
  @ApiQuery({ name: 'since', type: Number, required: false, description: 'Unix timestamp seconds; defaults to now-300' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Max flows to return (cap 500)' })
  @ApiQuery({ name: 'fasset', type: String, required: false })
  @ApiQuery({ name: 'agent', type: String, required: false })
  getFlowsSince(
    @Query('since', new ParseIntPipe({ optional: true })) since?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('fasset') fasset?: string,
    @Query('agent') agent?: string
  ): Promise<ApiResponse<VT.FlowsFeed>> {
    const sinceTs = since ?? unixnow() - 300
    return apiResponse(this.service.flowsSince(sinceTs, limit ?? 200, {
      fasset: fasset as FAsset | undefined,
      agentVault: agent
    }), 200)
  }

  @Get('flows/:flowId')
  @ApiOperation({
    summary: 'Single flow lookup by flowId (e.g. mint:FXRP:12345)',
    description: 'Returns the current snapshot for one flow, with embedded underlyingPayment if observed.'
  })
  @ApiParam({ name: 'flowId', type: String, description: 'flowId (e.g. mint:FXRP:12345, redemption:FXRP:42)' })
  getFlowById(@Param('flowId') flowId: string): Promise<ApiResponse<VT.Flow | null>> {
    return apiResponse(this.service.flowById(flowId), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // delta event feed

  @Get('events')
  @ApiOperation({
    summary: 'Cursor-based event delta feed for the visualiser bridge',
    description: 'Returns protocol events at block.timestamp >= since, ordered ascending. The bridge polls this with the cursor returned by the previous call. Optional kind/agent/fasset filters narrow the feed for clients that only need a slice (e.g. an agent-detail page).'
  })
  @ApiQuery({ name: 'since', type: Number, required: false, description: 'Unix timestamp seconds; defaults to now-300' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Max events to return (cap 500)' })
  @ApiQuery({ name: 'kind', type: String, required: false, description: 'Comma-separated VisualiserEventKind values; only matching kinds are fetched' })
  @ApiQuery({ name: 'agent', type: String, required: false, description: 'Agent vault address; events not bound to this vault are filtered out' })
  @ApiQuery({ name: 'fasset', type: String, required: false, description: 'FAsset symbol (FXRP, FBTC, ...)' })
  getEvents(
    @Query('since', new ParseIntPipe({ optional: true })) since?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('kind') kind?: string,
    @Query('agent') agent?: string,
    @Query('fasset') fasset?: string
  ): Promise<ApiResponse<VT.VisualiserEventFeed>> {
    const sinceTs = since ?? unixnow() - 300
    const kinds = kind
      ? kind.split(',').map(k => k.trim()).filter(Boolean) as VT.VisualiserEventKind[]
      : undefined
    return apiResponse(this.service.eventsSince(sinceTs, limit ?? 200, {
      kinds,
      agentVault: agent,
      fasset: fasset as FAsset | undefined
    }), 200)
  }
}
