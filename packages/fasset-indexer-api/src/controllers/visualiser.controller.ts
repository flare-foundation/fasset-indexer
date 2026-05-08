import { Controller, Get, Param, ParseBoolPipe, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager'
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { type FAsset } from 'fasset-indexer-core'
import { VisualiserService } from '../services/visualiser.service'
import { apiResponse, type ApiResponse } from '../shared/api-response'
import { unixnow } from '../shared/utils'
import * as VT from '../analytics/visualiser-types'


// TTL (ms) for live-state endpoints the bridge polls tight.
// Capped at one bridge tick worth of staleness rather than the global 30s.
const LIVE_STATE_CACHE_MS = 5_000

@ApiTags('Visualiser')
@Controller('api/visualiser')
export class VisualiserController {
  constructor(private readonly service: VisualiserService) { }

  //////////////////////////////////////////////////////////////////////
  // overview

  @Get('overview')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({
    summary: 'Bundled scene snapshot for the visualiser frontend on first load',
    description: 'Returns chain, supported FAssets, latest block, lot sizes, FAsset supplies, tracked agent backing, prices, and agent counts in a single call.'
  })
  getSystemOverview(): Promise<ApiResponse<VT.SystemOverview>> {
    return apiResponse(this.service.systemOverview(), 200)
  }

  @Get('scene')
  @UseInterceptors(CacheInterceptor)
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
  @UseInterceptors(CacheInterceptor)
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
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Single agent vault detail by vault address' })
  @ApiQuery({ name: 'vault', type: String, required: true })
  getAgent(@Query('vault') vault: string): Promise<ApiResponse<VT.AgentOverview | null>> {
    return apiResponse(this.service.agent(vault), 200)
  }

  @Get('agents/:vault/state')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
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
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Latest FTSO price feeds with timestamps' })
  getPrices(): Promise<ApiResponse<VT.PriceTick[]>> {
    return apiResponse(this.service.prices(), 200)
  }

  @Get('redemption-tickets/active')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
  @ApiOperation({ summary: 'Agents currently in CCB / Liquidation / FullLiquidation' })
  getActiveLiquidations(): Promise<ApiResponse<VT.ActiveLiquidation[]>> {
    return apiResponse(this.service.activeLiquidations(), 200)
  }

  @Get('challenges')
  @UseInterceptors(CacheInterceptor)
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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
  @ApiOperation({
    summary: 'Cursor-based delta feed of flow snapshots',
    description: 'Returns flows whose latest state-changing event is at or after the cursor (since, since_block), with the current snapshot of each flow. Pass back both cursor.timestamp and cursor.blockIndex from the previous response as since and since_block to advance strictly past the boundary.'
  })
  @ApiQuery({ name: 'since', type: Number, required: false, description: 'Unix timestamp seconds; defaults to now-300' })
  @ApiQuery({ name: 'since_block', type: Number, required: false, description: 'Tiebreaker for events sharing the boundary timestamp; pass back cursor.blockIndex' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Max flows to return (cap 500)' })
  @ApiQuery({ name: 'fasset', type: String, required: false })
  @ApiQuery({ name: 'agent', type: String, required: false })
  getFlowsSince(
    @Query('since', new ParseIntPipe({ optional: true })) since?: number,
    @Query('since_block', new ParseIntPipe({ optional: true })) sinceBlock?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('fasset') fasset?: string,
    @Query('agent') agent?: string
  ): Promise<ApiResponse<VT.FlowsFeed>> {
    const sinceTs = since ?? unixnow() - 300
    return apiResponse(this.service.flowsSince(sinceTs, limit ?? 200, {
      fasset: fasset as FAsset | undefined,
      agentVault: agent,
      sinceBlock
    }), 200)
  }

  @Get('flows/:flowId')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
  @ApiOperation({
    summary: 'Single flow lookup by flowId (e.g. mint:FXRP:12345)',
    description: 'Returns the current snapshot for one flow, with embedded underlyingPayment if observed.'
  })
  @ApiParam({ name: 'flowId', type: String, description: 'flowId (e.g. mint:FXRP:12345, redemption:FXRP:42)' })
  getFlowById(@Param('flowId') flowId: string): Promise<ApiResponse<VT.Flow | null>> {
    return apiResponse(this.service.flowById(flowId), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // underlying-chain delta

  @Get('underlying-payments')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
  @ApiOperation({
    summary: 'Cursor-based delta feed of underlying-chain payment observations',
    description: 'Returns indexed UnderlyingReference rows at or after the cursor, ordered by underlying-chain (timestamp, height). Standalone feed with its own coordinate space — pass back cursor.timestamp as since and cursor.blockHeight as since_height. Each row carries the raw paymentReference; the bridge decodes it and joins against local flow state if it needs flowId / agentVault.'
  })
  @ApiQuery({ name: 'since', type: Number, required: false, description: 'Underlying-block timestamp; defaults to now-300' })
  @ApiQuery({ name: 'since_height', type: Number, required: false, description: 'Tiebreaker for observations sharing the boundary timestamp; pass back cursor.blockHeight' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Max rows to return (cap 500)' })
  @ApiQuery({ name: 'fasset', type: String, required: false })
  getUnderlyingPayments(
    @Query('since', new ParseIntPipe({ optional: true })) since?: number,
    @Query('since_height', new ParseIntPipe({ optional: true })) sinceHeight?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('fasset') fasset?: string
  ): Promise<ApiResponse<VT.UnderlyingPaymentsFeed>> {
    const sinceTs = since ?? unixnow() - 300
    return apiResponse(this.service.underlyingPaymentsSince(sinceTs, limit ?? 200, {
      fasset: fasset as FAsset | undefined,
      sinceHeight
    }), 200)
  }

  //////////////////////////////////////////////////////////////////////
  // delta event feed

  @Get('events')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(LIVE_STATE_CACHE_MS)
  @ApiOperation({
    summary: 'Cursor-based event delta feed for the visualiser bridge (EVM events only)',
    description: 'Returns on-chain protocol events at or after the cursor (since, since_block), ordered ascending. Cursor coordinates are EVM (block timestamp + Flare block index). Underlying-chain payment observations live on /underlying-payments with its own cursor. Pass back both cursor.timestamp and cursor.blockIndex from the previous response as since and since_block to advance strictly past the boundary; without since_block the boundary timestamp\'s events are re-emitted (inclusive). Optional kind/agent/fasset filters narrow the feed.'
  })
  @ApiQuery({ name: 'since', type: Number, required: false, description: 'Unix timestamp seconds; defaults to now-300' })
  @ApiQuery({ name: 'since_block', type: Number, required: false, description: 'Tiebreaker for events sharing the boundary timestamp; pass back cursor.blockIndex' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Max events to return (cap 500)' })
  @ApiQuery({ name: 'kind', type: String, required: false, description: 'Comma-separated VisualiserEventKind values; only matching kinds are fetched' })
  @ApiQuery({ name: 'agent', type: String, required: false, description: 'Agent vault address; events not bound to this vault are filtered out' })
  @ApiQuery({ name: 'fasset', type: String, required: false, description: 'FAsset symbol (FXRP, FBTC, ...)' })
  getEvents(
    @Query('since', new ParseIntPipe({ optional: true })) since?: number,
    @Query('since_block', new ParseIntPipe({ optional: true })) sinceBlock?: number,
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
      fasset: fasset as FAsset | undefined,
      sinceBlock
    }), 200)
  }
}
