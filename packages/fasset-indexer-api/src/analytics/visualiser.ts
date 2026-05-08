import {
  FAsset, FAssetType,
  CollateralReservationResolution, RedemptionResolution,
  TransferToCoreVaultResolution, ReturnFromCoreVaultResolution
} from "fasset-indexer-core"
import { PaymentReference } from "fasset-indexer-core/utils"
import * as Entities from "fasset-indexer-core/entities"
import { unixnow } from "../shared/utils"
import { DashboardAnalytics } from "./dashboard"
import * as VT from "./visualiser-types"


/**
 * VisualiserAnalytics powers the /api/visualiser/* endpoints used by the
 * fasset-visualiser bridge. Bundles the full live state of the protocol
 * (agents, prices, in-flight requests, queue tickets, challenges) and a
 * cursor-based event delta feed for polling-based fan-out to the frontend.
 */
export class VisualiserAnalytics extends DashboardAnalytics {

  ////////////////////////////////////////////////////////////////////////
  // overview

  async systemOverview(): Promise<VT.SystemOverview> {
    const em = this.orm.em.fork()
    const now = unixnow()
    const [latestBlocks, lots, supplyTs, backingResult, prices, agentCount] = await Promise.all([
      em.find(Entities.EvmBlock, {}, { orderBy: { index: 'desc' }, limit: 1 }),
      this.lotSizeUBA(),
      this.fAssetSupplyTimespan([now]),
      this.trackedAgentUnderlyingBacking(),
      this.prices(),
      this.agentCounts()
    ])
    const latestBlock = latestBlocks[0]
    const lotSizesUBA: Partial<Record<FAsset, bigint>> = {}
    for (const [fasset, v] of Object.entries(lots)) {
      lotSizesUBA[fasset as FAsset] = v.value
    }
    const fAssetSupplyUBA: Partial<Record<FAsset, bigint>> = {}
    for (const [fasset, points] of Object.entries(supplyTs)) {
      fAssetSupplyUBA[fasset as FAsset] = points[0]?.value ?? BigInt(0)
    }
    const trackedAgentBackingUBA: Partial<Record<FAsset, bigint>> = {}
    for (const [fasset, v] of Object.entries(backingResult)) {
      trackedAgentBackingUBA[fasset as FAsset] = v.value
    }
    return {
      chain: this.chain,
      fassets: this.supportedFAssets,
      latestBlock: {
        index: latestBlock?.index ?? null,
        timestamp: latestBlock?.timestamp ?? null
      },
      lotSizesUBA,
      fAssetSupplyUBA,
      trackedAgentBackingUBA,
      prices,
      agentCount
    }
  }

  async agentCounts(): Promise<{ total: number, available: number, liquidating: number, fullLiquidation: number }> {
    const em = this.orm.em.fork()
    const [total, available, liquidating, fullLiquidation] = await Promise.all([
      em.count(Entities.AgentVaultInfo, {}),
      em.count(Entities.AgentVaultInfo, { publiclyAvailable: true, status: 0 }),
      em.count(Entities.AgentVaultInfo, { status: { $in: [VT.AgentStatus.CCB, VT.AgentStatus.Liquidation] } }),
      em.count(Entities.AgentVaultInfo, { status: VT.AgentStatus.FullLiquidation })
    ])
    return { total, available, liquidating, fullLiquidation }
  }

  ////////////////////////////////////////////////////////////////////////
  // agents

  async agents(filter?: { fasset?: FAsset, status?: VT.AgentStatus, available?: boolean }): Promise<VT.AgentOverview[]> {
    const em = this.orm.em.fork()
    const where: Record<string, unknown> = {}
    if (filter?.status !== undefined) where.status = filter.status
    if (filter?.available !== undefined) where.publiclyAvailable = filter.available
    const infos = await em.find(Entities.AgentVaultInfo, where, {
      populate: [
        'agentVault.address',
        'agentVault.underlyingAddress',
        'agentVault.collateralPool',
        'agentVault.collateralPoolToken',
        'agentVault.owner.address',
        'agentVault.owner.manager.address'
      ]
    })
    const settingsRows = await em.find(Entities.AgentVaultSettings, {}, {
      populate: ['agentVault.address']
    })
    const settingsByVault = new Map<string, Entities.AgentVaultSettings>()
    for (const s of settingsRows) settingsByVault.set(s.agentVault.address.hex, s)
    const managers = await em.find(Entities.AgentManager, {}, { populate: ['address'] })
    const managerMeta = new Map<string, { name?: string, iconUrl?: string }>()
    for (const m of managers) managerMeta.set(m.address.hex, { name: m.name, iconUrl: m.iconUrl })

    const ret: VT.AgentOverview[] = []
    for (const info of infos) {
      const vault = info.agentVault.address.hex
      const fasset = FAssetType[info.agentVault.fasset] as FAsset
      if (filter?.fasset !== undefined && fasset !== filter.fasset) continue
      const ownerManagerHex = info.agentVault.owner.manager.address.hex
      const meta = managerMeta.get(ownerManagerHex) ?? {}
      const settings = settingsByVault.get(vault)
      ret.push({
        vault,
        underlyingAddress: info.agentVault.underlyingAddress.text,
        collateralPool: info.agentVault.collateralPool.hex,
        collateralPoolToken: info.agentVault.collateralPoolToken?.hex,
        fasset,
        ownerManager: ownerManagerHex,
        ownerName: meta.name,
        ownerIconUrl: meta.iconUrl,
        publiclyAvailable: info.publiclyAvailable,
        destroyed: info.agentVault.destroyed,
        status: info.status as VT.AgentStatus,
        vaultCollateralRatioBIPS: info.vaultCollateralRatioBIPS,
        poolCollateralRatioBIPS: info.poolCollateralRatioBIPS,
        totalVaultCollateralWei: info.totalVaultCollateralWei,
        freeVaultCollateralWei: info.freeVaultCollateralWei,
        totalPoolCollateralNATWei: info.totalPoolCollateralNATWei,
        freePoolCollateralNATWei: info.freePoolCollateralNATWei,
        freeCollateralLots: info.freeCollateralLots,
        mintedUBA: info.mintedUBA,
        reservedUBA: info.reservedUBA,
        redeemingUBA: info.redeemingUBA,
        poolRedeemingUBA: info.poolRedeemingUBA,
        dustUBA: info.dustUBA,
        underlyingBalanceUBA: info.underlyingBalanceUBA,
        freeUnderlyingBalanceUBA: info.freeUnderlyingBalanceUBA,
        requiredUnderlyingBalanceUBA: info.requiredUnderlyingBalanceUBA,
        ccbStartTimestamp: info.ccbStartTimestamp,
        liquidationStartTimestamp: info.liquidationStartTimestamp,
        maxLiquidationAmountUBA: info.maxLiquidationAmountUBA,
        liquidationPaymentFactorVaultBIPS: info.liquidationPaymentFactorVaultBIPS,
        liquidationPaymentFactorPoolBIPS: info.liquidationPaymentFactorPoolBIPS,
        feeBIPS: settings?.feeBIPS,
        poolFeeShareBIPS: settings?.poolFeeShareBIPS,
        mintingVaultCollateralRatioBIPS: settings?.mintingVaultCollateralRatioBIPS,
        mintingPoolCollateralRatioBIPS: settings?.mintingPoolCollateralRatioBIPS
      })
    }
    return ret
  }

  async agent(vault: string): Promise<VT.AgentOverview | null> {
    const list = await this.agents()
    return list.find(a => a.vault.toLowerCase() === vault.toLowerCase()) ?? null
  }

  ////////////////////////////////////////////////////////////////////////
  // live state

  async prices(): Promise<VT.PriceTick[]> {
    const em = this.orm.em.fork()
    const rows = await em.find(Entities.FtsoPrice, {}, { orderBy: { symbol: 'asc' } })
    return rows.map(r => ({
      symbol: r.symbol, price: r.price, decimals: r.decimals, timestamp: r.timestamp
    }))
  }

  async activeRedemptionTickets(fasset?: FAsset, agentVault?: string, limit = 200): Promise<VT.ActiveRedemptionTicket[]> {
    const em = this.orm.em.fork()
    const tickets = await em.find(Entities.RedemptionTicket, { destroyed: false }, {
      populate: [
        'redemptionTicketCreated.evmLog.block',
        'redemptionTicketCreated.agentVault.address'
      ],
      limit
    })
    return tickets
      .filter(t => fasset == null || (FAssetType[t.redemptionTicketCreated.fasset] as FAsset) === fasset)
      .filter(t => agentVault == null
        || t.redemptionTicketCreated.agentVault.address.hex.toLowerCase() === agentVault.toLowerCase())
      .map(t => ({
        ticketId: t.redemptionTicketCreated.redemptionTicketId.toString(),
        fasset: FAssetType[t.redemptionTicketCreated.fasset] as FAsset,
        agentVault: t.redemptionTicketCreated.agentVault.address.hex,
        ticketValueUBA: t.ticketValueUBA,
        createdAtTimestamp: t.redemptionTicketCreated.evmLog.block.timestamp
      }))
  }

  async activeMintings(fasset?: FAsset, agentVault?: string, limit = 200): Promise<VT.ActiveMinting[]> {
    const em = this.orm.em.fork()
    const where: Record<string, unknown> = { resolution: CollateralReservationResolution.NONE }
    if (fasset != null) where.fasset = FAssetType[fasset]
    const reservations = await em.find(Entities.CollateralReserved, where, {
      populate: [
        'evmLog.block',
        'agentVault.address',
        'minter',
        'paymentAddress'
      ],
      orderBy: { evmLog: { block: { timestamp: 'desc' } } },
      limit
    })
    return reservations
      .filter(r => agentVault == null || r.agentVault.address.hex.toLowerCase() === agentVault.toLowerCase())
      .map(r => ({
        collateralReservationId: r.collateralReservationId,
        fasset: FAssetType[r.fasset] as FAsset,
        agentVault: r.agentVault.address.hex,
        minter: r.minter.hex,
        paymentAddress: r.paymentAddress.text,
        valueUBA: r.valueUBA,
        feeUBA: r.feeUBA,
        reservedAtTimestamp: r.evmLog.block.timestamp,
        paymentDeadlineTimestamp: r.lastUnderlyingTimestamp
      }))
  }

  async activeRedemptions(fasset?: FAsset, agentVault?: string, limit = 200): Promise<VT.ActiveRedemption[]> {
    const em = this.orm.em.fork()
    const where: Record<string, unknown> = { resolution: RedemptionResolution.NONE }
    if (fasset != null) where.fasset = FAssetType[fasset]
    const requests = await em.find(Entities.RedemptionRequested, where, {
      populate: [
        'evmLog.block',
        'agentVault.address',
        'redeemer',
        'paymentAddress'
      ],
      orderBy: { evmLog: { block: { timestamp: 'desc' } } },
      limit
    })
    return requests
      .filter(r => agentVault == null || r.agentVault.address.hex.toLowerCase() === agentVault.toLowerCase())
      .map(r => ({
        requestId: r.requestId,
        fasset: FAssetType[r.fasset] as FAsset,
        agentVault: r.agentVault.address.hex,
        redeemer: r.redeemer.hex,
        paymentAddress: r.paymentAddress.text,
        valueUBA: r.valueUBA,
        feeUBA: r.feeUBA,
        requestedAtTimestamp: r.evmLog.block.timestamp,
        paymentDeadlineTimestamp: r.lastUnderlyingTimestamp
      }))
  }

  async activeLiquidations(): Promise<VT.ActiveLiquidation[]> {
    const em = this.orm.em.fork()
    const infos = await em.find(Entities.AgentVaultInfo, {
      status: { $in: [VT.AgentStatus.CCB, VT.AgentStatus.Liquidation, VT.AgentStatus.FullLiquidation] }
    }, { populate: ['agentVault.address'] })
    return infos.map(info => ({
      agentVault: info.agentVault.address.hex,
      fasset: FAssetType[info.agentVault.fasset] as FAsset,
      status: info.status as VT.AgentStatus,
      ccbStartTimestamp: info.ccbStartTimestamp,
      liquidationStartTimestamp: info.liquidationStartTimestamp,
      maxLiquidationAmountUBA: info.maxLiquidationAmountUBA,
      liquidationPaymentFactorVaultBIPS: info.liquidationPaymentFactorVaultBIPS,
      liquidationPaymentFactorPoolBIPS: info.liquidationPaymentFactorPoolBIPS,
      vaultCollateralRatioBIPS: info.vaultCollateralRatioBIPS,
      poolCollateralRatioBIPS: info.poolCollateralRatioBIPS,
      mintedUBA: info.mintedUBA
    }))
  }

  async challenges(limit = 100, offset = 0): Promise<VT.ChallengeEvent[]> {
    const em = this.orm.em.fork()
    const populate = [
      'evmLog.block',
      'evmLog.transaction',
      'agentVault.address'
    ] as const
    const order = { evmLog: { block: { timestamp: 'desc' as const } } }
    const [illegal, duplicate, balanceLow] = await Promise.all([
      em.find(Entities.IllegalPaymentConfirmed, {}, { populate, orderBy: order, limit, offset }),
      em.find(Entities.DuplicatePaymentConfirmed, {}, { populate, orderBy: order, limit, offset }),
      em.find(Entities.UnderlyingBalanceTooLow, {}, { populate, orderBy: order, limit, offset })
    ])
    const events: VT.ChallengeEvent[] = []
    for (const e of illegal) {
      events.push({
        kind: 'IllegalPayment',
        timestamp: e.evmLog.block.timestamp,
        blockIndex: e.evmLog.block.index,
        txHash: e.evmLog.transaction.hash,
        fasset: FAssetType[e.fasset] as FAsset,
        agentVault: e.agentVault.address.hex,
        details: { transactionHash: e.transactionHash }
      })
    }
    for (const e of duplicate) {
      events.push({
        kind: 'DuplicatePayment',
        timestamp: e.evmLog.block.timestamp,
        blockIndex: e.evmLog.block.index,
        txHash: e.evmLog.transaction.hash,
        fasset: FAssetType[e.fasset] as FAsset,
        agentVault: e.agentVault.address.hex,
        details: { transactionHash1: e.transactionHash1, transactionHash2: e.transactionHash2 }
      })
    }
    for (const e of balanceLow) {
      events.push({
        kind: 'UnderlyingBalanceTooLow',
        timestamp: e.evmLog.block.timestamp,
        blockIndex: e.evmLog.block.index,
        txHash: e.evmLog.transaction.hash,
        fasset: FAssetType[e.fasset] as FAsset,
        agentVault: e.agentVault.address.hex,
        details: { balance: e.balance, requiredBalance: e.requiredBalance }
      })
    }
    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
  }

  ////////////////////////////////////////////////////////////////////////
  // bundled snapshots

  async scene(): Promise<VT.SceneSnapshot> {
    const [overview, agents] = await Promise.all([
      this.systemOverview(),
      this.agents()
    ])
    return { ...overview, agents }
  }

  async agentState(vault: string): Promise<VT.AgentState | null> {
    const agent = await this.agent(vault)
    if (agent == null) return null
    const [activeMintings, activeRedemptions, activeTickets] = await Promise.all([
      this.activeMintings(undefined, vault),
      this.activeRedemptions(undefined, vault),
      this.activeRedemptionTickets(undefined, vault)
    ])
    const inLiquidation = (
      agent.status === VT.AgentStatus.CCB
      || agent.status === VT.AgentStatus.Liquidation
      || agent.status === VT.AgentStatus.FullLiquidation
    )
    const liquidation: VT.ActiveLiquidation | undefined = inLiquidation ? {
      agentVault: agent.vault,
      fasset: agent.fasset,
      status: agent.status,
      ccbStartTimestamp: agent.ccbStartTimestamp,
      liquidationStartTimestamp: agent.liquidationStartTimestamp,
      maxLiquidationAmountUBA: agent.maxLiquidationAmountUBA,
      liquidationPaymentFactorVaultBIPS: agent.liquidationPaymentFactorVaultBIPS,
      liquidationPaymentFactorPoolBIPS: agent.liquidationPaymentFactorPoolBIPS,
      vaultCollateralRatioBIPS: agent.vaultCollateralRatioBIPS,
      poolCollateralRatioBIPS: agent.poolCollateralRatioBIPS,
      mintedUBA: agent.mintedUBA
    } : undefined
    return { agent, activeMintings, activeRedemptions, activeTickets, liquidation }
  }

  ////////////////////////////////////////////////////////////////////////
  // flows

  async activeFlows(filter?: { fasset?: FAsset, agentVault?: string }): Promise<VT.Flow[]> {
    const em = this.orm.em.fork()
    const fassetEnum = filter?.fasset != null ? FAssetType[filter.fasset] : undefined
    const where: Record<string, unknown> = {}
    if (fassetEnum != null) where.fasset = fassetEnum

    const [reservations, redemptions, transfers, returns] = await Promise.all([
      em.find(Entities.CollateralReserved, { ...where, resolution: CollateralReservationResolution.NONE }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address', 'minter', 'paymentAddress']
      }),
      em.find(Entities.RedemptionRequested, { ...where, resolution: RedemptionResolution.NONE }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address', 'redeemer', 'paymentAddress']
      }),
      em.find(Entities.TransferToCoreVaultStarted, { ...where, resolution: TransferToCoreVaultResolution.NONE }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address']
      }),
      em.find(Entities.ReturnFromCoreVaultRequested, { ...where, resolution: ReturnFromCoreVaultResolution.NONE }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address']
      })
    ])

    const flows: VT.Flow[] = []
    for (const r of reservations) flows.push(this.mintFlowFromReservation(r, 'active'))
    for (const r of redemptions) flows.push(this.redemptionFlowFromRequest(r, 'active'))
    for (const r of transfers) flows.push(this.transferFlowFromStarted(r, 'active'))
    for (const r of returns) flows.push(this.returnFlowFromRequested(r, 'active'))

    const filtered = filter?.agentVault != null
      ? flows.filter(f => f.agentVault?.toLowerCase() === filter.agentVault!.toLowerCase())
      : flows

    await this.attachUnderlyingPayments(em, filtered)
    return filtered.sort((a, b) => b.startedAtTimestamp - a.startedAtTimestamp)
  }

  async flowById(flowId: string): Promise<VT.Flow | null> {
    const parsed = this.parseFlowId(flowId)
    if (parsed == null) return null
    const em = this.orm.em.fork()
    const fassetEnum = FAssetType[parsed.fasset]
    let flow: VT.Flow | null = null
    if (parsed.kind === 'mint') {
      const r = await em.findOne(Entities.CollateralReserved,
        { fasset: fassetEnum, collateralReservationId: Number(parsed.id) },
        { populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address', 'minter', 'paymentAddress'] })
      if (r != null) flow = this.mintFlowFromReservation(r, this.mintStatus(r.resolution))
    } else if (parsed.kind === 'redemption') {
      const r = await em.findOne(Entities.RedemptionRequested,
        { fasset: fassetEnum, requestId: Number(parsed.id) },
        { populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address', 'redeemer', 'paymentAddress'] })
      if (r != null) flow = this.redemptionFlowFromRequest(r, this.redemptionStatus(r.resolution))
    } else if (parsed.kind === 'transferToCoreVault') {
      const r = await em.findOne(Entities.TransferToCoreVaultStarted,
        { fasset: fassetEnum, transferRedemptionRequestId: Number(parsed.id) },
        { populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address'] })
      if (r != null) flow = this.transferFlowFromStarted(r, this.transferStatus(r.resolution))
    } else if (parsed.kind === 'returnFromCoreVault') {
      const r = await em.findOne(Entities.ReturnFromCoreVaultRequested,
        { fasset: fassetEnum, requestId: Number(parsed.id) },
        { populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address'] })
      if (r != null) flow = this.returnFlowFromRequested(r, this.returnStatus(r.resolution))
    } else if (parsed.kind === 'directMint') {
      const txId = parsed.id as string
      const [regular, smartAccount] = await Promise.all([
        em.findOne(Entities.DirectMintingExecuted,
          { fasset: fassetEnum, transactionId: txId },
          { populate: ['evmLog.block', 'evmLog.transaction', 'targetAddress'] }),
        em.findOne(Entities.DirectMintingExecutedToSmartAccount,
          { fasset: fassetEnum, transactionId: txId },
          { populate: ['evmLog.block', 'evmLog.transaction', 'sourceAddress'] })
      ])
      if (regular != null) flow = this.directMintFlow(regular)
      else if (smartAccount != null) flow = this.directMintToSmartAccountFlow(smartAccount)
    }
    if (flow == null) return null
    await this.attachUnderlyingPayments(em, [flow])
    return flow
  }

  /**
   * Delta feed: returns flows whose latest state-changing event is at the cursor or later.
   * "Latest state-changing event" = parent creation event for active flows, or the
   * resolution event for resolved flows. Each flow appears at most once with the
   * current status.
   */
  async flowsSince(
    sinceTimestamp: number, limit = 200,
    filter?: { fasset?: FAsset, agentVault?: string, sinceBlock?: number }
  ): Promise<VT.FlowsFeed> {
    const em = this.orm.em.fork()
    const cap = Math.min(limit, 500)
    const fassetEnum = filter?.fasset != null ? FAssetType[filter.fasset] : undefined
    const baseWhere: Record<string, unknown> = {}
    if (fassetEnum != null) baseWhere.fasset = fassetEnum
    const tsWhere = this.evmSinceWhere(sinceTimestamp, filter?.sinceBlock)
    const order = { evmLog: { block: { timestamp: 'asc' as const, index: 'asc' as const } } }
    const limitOpt = { orderBy: order, limit: cap }

    // Parents touched in window (covers active flows starting in window).
    const [
      reservations, redemptions, transfers, returns, directMints, directMintsToSmartAccount,
      mintingExecuted, mintingDefault, mintingDeleted,
      redemptionPerformed, redemptionDefault, redemptionRejected,
      redemptionPaymentBlocked, redemptionPaymentFailed,
      transferSuccess, transferDefault,
      returnConfirmed, returnCancelled
    ] = await Promise.all([
      em.find(Entities.CollateralReserved, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address', 'minter', 'paymentAddress'], ...limitOpt
      }),
      em.find(Entities.RedemptionRequested, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address', 'redeemer', 'paymentAddress'], ...limitOpt
      }),
      em.find(Entities.TransferToCoreVaultStarted, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address'], ...limitOpt
      }),
      em.find(Entities.ReturnFromCoreVaultRequested, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'agentVault.address'], ...limitOpt
      }),
      em.find(Entities.DirectMintingExecuted, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'targetAddress'], ...limitOpt
      }),
      em.find(Entities.DirectMintingExecutedToSmartAccount, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'sourceAddress'], ...limitOpt
      }),
      // Resolution events touched in window — populate parent so we can re-emit the parent flow.
      em.find(Entities.MintingExecuted, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'collateralReserved.evmLog.block', 'collateralReserved.evmLog.transaction', 'collateralReserved.agentVault.address', 'collateralReserved.minter', 'collateralReserved.paymentAddress'], ...limitOpt
      }),
      em.find(Entities.MintingPaymentDefault, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'collateralReserved.evmLog.block', 'collateralReserved.evmLog.transaction', 'collateralReserved.agentVault.address', 'collateralReserved.minter', 'collateralReserved.paymentAddress'], ...limitOpt
      }),
      em.find(Entities.CollateralReservationDeleted, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'collateralReserved.evmLog.block', 'collateralReserved.evmLog.transaction', 'collateralReserved.agentVault.address', 'collateralReserved.minter', 'collateralReserved.paymentAddress'], ...limitOpt
      }),
      em.find(Entities.RedemptionPerformed, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'redemptionRequested.evmLog.block', 'redemptionRequested.evmLog.transaction', 'redemptionRequested.agentVault.address', 'redemptionRequested.redeemer', 'redemptionRequested.paymentAddress'], ...limitOpt
      }),
      em.find(Entities.RedemptionDefault, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'redemptionRequested.evmLog.block', 'redemptionRequested.evmLog.transaction', 'redemptionRequested.agentVault.address', 'redemptionRequested.redeemer', 'redemptionRequested.paymentAddress'], ...limitOpt
      }),
      em.find(Entities.RedemptionRejected, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'redemptionRequested.evmLog.block', 'redemptionRequested.evmLog.transaction', 'redemptionRequested.agentVault.address', 'redemptionRequested.redeemer', 'redemptionRequested.paymentAddress'], ...limitOpt
      }),
      em.find(Entities.RedemptionPaymentBlocked, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'redemptionRequested.evmLog.block', 'redemptionRequested.evmLog.transaction', 'redemptionRequested.agentVault.address', 'redemptionRequested.redeemer', 'redemptionRequested.paymentAddress'], ...limitOpt
      }),
      em.find(Entities.RedemptionPaymentFailed, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'redemptionRequested.evmLog.block', 'redemptionRequested.evmLog.transaction', 'redemptionRequested.agentVault.address', 'redemptionRequested.redeemer', 'redemptionRequested.paymentAddress'], ...limitOpt
      }),
      em.find(Entities.TransferToCoreVaultSuccessful, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'transferToCoreVaultStarted.evmLog.block', 'transferToCoreVaultStarted.evmLog.transaction', 'transferToCoreVaultStarted.agentVault.address'], ...limitOpt
      }),
      em.find(Entities.TransferToCoreVaultDefaulted, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'transferToCoreVaultStarted.evmLog.block', 'transferToCoreVaultStarted.evmLog.transaction', 'transferToCoreVaultStarted.agentVault.address'], ...limitOpt
      }),
      em.find(Entities.ReturnFromCoreVaultConfirmed, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'returnFromCoreVaultRequested.evmLog.block', 'returnFromCoreVaultRequested.evmLog.transaction', 'returnFromCoreVaultRequested.agentVault.address'], ...limitOpt
      }),
      em.find(Entities.ReturnFromCoreVaultCancelled, { ...baseWhere, ...tsWhere }, {
        populate: ['evmLog.block', 'evmLog.transaction', 'returnFromCoreVaultRequested.evmLog.block', 'returnFromCoreVaultRequested.evmLog.transaction', 'returnFromCoreVaultRequested.agentVault.address'], ...limitOpt
      })
    ])

    type Snapshot = { flow: VT.Flow, latest: { timestamp: number, blockIndex: number } }
    const byId = new Map<string, Snapshot>()
    const upsert = (flow: VT.Flow, eventTs: number, eventBlockIndex: number) => {
      const existing = byId.get(flow.flowId)
      if (existing == null || eventTs > existing.latest.timestamp
        || (eventTs === existing.latest.timestamp && eventBlockIndex > existing.latest.blockIndex)) {
        byId.set(flow.flowId, { flow, latest: { timestamp: eventTs, blockIndex: eventBlockIndex } })
      }
    }
    for (const r of reservations) upsert(this.mintFlowFromReservation(r, this.mintStatus(r.resolution)), r.evmLog.block.timestamp, r.evmLog.block.index)
    for (const r of redemptions) upsert(this.redemptionFlowFromRequest(r, this.redemptionStatus(r.resolution)), r.evmLog.block.timestamp, r.evmLog.block.index)
    for (const r of transfers) upsert(this.transferFlowFromStarted(r, this.transferStatus(r.resolution)), r.evmLog.block.timestamp, r.evmLog.block.index)
    for (const r of returns) upsert(this.returnFlowFromRequested(r, this.returnStatus(r.resolution)), r.evmLog.block.timestamp, r.evmLog.block.index)
    for (const e of directMints) upsert(this.directMintFlow(e), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of directMintsToSmartAccount) upsert(this.directMintToSmartAccountFlow(e), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of mintingExecuted) upsert(this.mintFlowFromReservation(e.collateralReserved, 'completed', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of mintingDefault) upsert(this.mintFlowFromReservation(e.collateralReserved, 'defaulted', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of mintingDeleted) upsert(this.mintFlowFromReservation(e.collateralReserved, 'cancelled', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of redemptionPerformed) upsert(this.redemptionFlowFromRequest(e.redemptionRequested, 'completed', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of redemptionDefault) upsert(this.redemptionFlowFromRequest(e.redemptionRequested, 'defaulted', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of redemptionRejected) upsert(this.redemptionFlowFromRequest(e.redemptionRequested, 'cancelled', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of redemptionPaymentBlocked) upsert(this.redemptionFlowFromRequest(e.redemptionRequested, 'failed', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of redemptionPaymentFailed) upsert(this.redemptionFlowFromRequest(e.redemptionRequested, 'failed', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of transferSuccess) upsert(this.transferFlowFromStarted(e.transferToCoreVaultStarted, 'completed', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of transferDefault) upsert(this.transferFlowFromStarted(e.transferToCoreVaultStarted, 'defaulted', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of returnConfirmed) upsert(this.returnFlowFromRequested(e.returnFromCoreVaultRequested, 'completed', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)
    for (const e of returnCancelled) upsert(this.returnFlowFromRequested(e.returnFromCoreVaultRequested, 'cancelled', e.evmLog.block.timestamp, e.evmLog.transaction.hash), e.evmLog.block.timestamp, e.evmLog.block.index)

    let snapshots = Array.from(byId.values())
    if (filter?.agentVault != null) {
      const target = filter.agentVault.toLowerCase()
      snapshots = snapshots.filter(s => s.flow.agentVault?.toLowerCase() === target)
    }
    snapshots.sort((a, b) => a.latest.timestamp - b.latest.timestamp || a.latest.blockIndex - b.latest.blockIndex)
    const truncated = snapshots.slice(0, cap)

    await this.attachUnderlyingPayments(em, truncated.map(s => s.flow))

    const last = truncated[truncated.length - 1]
    const cursor = last != null ? { timestamp: last.latest.timestamp, blockIndex: last.latest.blockIndex } : null
    return { flows: truncated.map(s => s.flow), cursor, hasMore: snapshots.length > cap }
  }

  ////////////////////////////////////////////////////////////////////////
  // flow helpers

  private mintFlowId(fasset: FAssetType, id: number): string {
    return `mint:${FAssetType[fasset]}:${id}`
  }
  private redemptionFlowId(fasset: FAssetType, id: number): string {
    return `redemption:${FAssetType[fasset]}:${id}`
  }
  private transferFlowId(fasset: FAssetType, id: number): string {
    return `transferToCoreVault:${FAssetType[fasset]}:${id}`
  }
  private returnFlowId(fasset: FAssetType, id: number): string {
    return `returnFromCoreVault:${FAssetType[fasset]}:${id}`
  }
  private directMintFlowId(fasset: FAssetType, transactionId: string): string {
    return `directMint:${FAssetType[fasset]}:${transactionId}`
  }

  private parseFlowId(flowId: string): { kind: VT.FlowKind, fasset: FAsset, id: number | string } | null {
    const parts = flowId.split(':')
    if (parts.length < 3) return null
    const [kind, fasset, ...rest] = parts
    const id = rest.join(':')
    if (!['mint', 'redemption', 'transferToCoreVault', 'returnFromCoreVault', 'directMint'].includes(kind)) return null
    if (kind === 'directMint') return { kind: kind as VT.FlowKind, fasset: fasset as FAsset, id }
    const numId = Number(id)
    if (!Number.isFinite(numId)) return null
    return { kind: kind as VT.FlowKind, fasset: fasset as FAsset, id: numId }
  }

  private mintStatus(r: CollateralReservationResolution): VT.FlowStatus {
    switch (r) {
      case CollateralReservationResolution.EXECUTED: return 'completed'
      case CollateralReservationResolution.DEFAULTED: return 'defaulted'
      case CollateralReservationResolution.DELETED: return 'cancelled'
      default: return 'active'
    }
  }
  private redemptionStatus(r: RedemptionResolution): VT.FlowStatus {
    switch (r) {
      case RedemptionResolution.PERFORMED: return 'completed'
      case RedemptionResolution.DEFAULTED: return 'defaulted'
      case RedemptionResolution.REJECTED: return 'cancelled'
      case RedemptionResolution.BLOCKED:
      case RedemptionResolution.FAILED: return 'failed'
      default: return 'active'
    }
  }
  private transferStatus(r: TransferToCoreVaultResolution): VT.FlowStatus {
    switch (r) {
      case TransferToCoreVaultResolution.SUCCESSFUL: return 'completed'
      case TransferToCoreVaultResolution.DEFAULTED: return 'defaulted'
      default: return 'active'
    }
  }
  private returnStatus(r: ReturnFromCoreVaultResolution): VT.FlowStatus {
    switch (r) {
      case ReturnFromCoreVaultResolution.CONFIRMED: return 'completed'
      case ReturnFromCoreVaultResolution.CANCELLED: return 'cancelled'
      default: return 'active'
    }
  }

  private mintFlowFromReservation(
    r: Entities.CollateralReserved, status: VT.FlowStatus,
    resolvedAtTimestamp?: number, resolvedTxHash?: string
  ): VT.Flow {
    return {
      flowId: this.mintFlowId(r.fasset, r.collateralReservationId),
      kind: 'mint',
      fasset: FAssetType[r.fasset] as FAsset,
      status,
      agentVault: r.agentVault.address.hex,
      user: r.minter.hex,
      paymentAddress: r.paymentAddress.text,
      paymentReference: r.paymentReference,
      valueUBA: r.valueUBA,
      feeUBA: r.feeUBA,
      startedAtTimestamp: r.evmLog.block.timestamp,
      startedTxHash: r.evmLog.transaction.hash,
      resolvedAtTimestamp,
      resolvedTxHash,
      paymentDeadlineTimestamp: r.lastUnderlyingTimestamp,
      underlyingPayment: null
    }
  }

  private redemptionFlowFromRequest(
    r: Entities.RedemptionRequested, status: VT.FlowStatus,
    resolvedAtTimestamp?: number, resolvedTxHash?: string
  ): VT.Flow {
    return {
      flowId: this.redemptionFlowId(r.fasset, r.requestId),
      kind: 'redemption',
      fasset: FAssetType[r.fasset] as FAsset,
      status,
      agentVault: r.agentVault.address.hex,
      user: r.redeemer.hex,
      paymentAddress: r.paymentAddress.text,
      paymentReference: r.paymentReference,
      valueUBA: r.valueUBA,
      feeUBA: r.feeUBA,
      startedAtTimestamp: r.evmLog.block.timestamp,
      startedTxHash: r.evmLog.transaction.hash,
      resolvedAtTimestamp,
      resolvedTxHash,
      paymentDeadlineTimestamp: r.lastUnderlyingTimestamp,
      underlyingPayment: null
    }
  }

  private transferFlowFromStarted(
    r: Entities.TransferToCoreVaultStarted, status: VT.FlowStatus,
    resolvedAtTimestamp?: number, resolvedTxHash?: string
  ): VT.Flow {
    return {
      flowId: this.transferFlowId(r.fasset, r.transferRedemptionRequestId),
      kind: 'transferToCoreVault',
      fasset: FAssetType[r.fasset] as FAsset,
      status,
      agentVault: r.agentVault.address.hex,
      paymentReference: PaymentReference.redemption(r.transferRedemptionRequestId),
      valueUBA: r.valueUBA,
      startedAtTimestamp: r.evmLog.block.timestamp,
      startedTxHash: r.evmLog.transaction.hash,
      resolvedAtTimestamp,
      resolvedTxHash,
      underlyingPayment: null
    }
  }

  private returnFlowFromRequested(
    r: Entities.ReturnFromCoreVaultRequested, status: VT.FlowStatus,
    resolvedAtTimestamp?: number, resolvedTxHash?: string
  ): VT.Flow {
    return {
      flowId: this.returnFlowId(r.fasset, r.requestId),
      kind: 'returnFromCoreVault',
      fasset: FAssetType[r.fasset] as FAsset,
      status,
      agentVault: r.agentVault.address.hex,
      paymentReference: r.paymentReference,
      valueUBA: r.valueUBA,
      startedAtTimestamp: r.evmLog.block.timestamp,
      startedTxHash: r.evmLog.transaction.hash,
      resolvedAtTimestamp,
      resolvedTxHash,
      underlyingPayment: null
    }
  }

  private directMintFlow(r: Entities.DirectMintingExecuted): VT.Flow {
    return {
      flowId: this.directMintFlowId(r.fasset, r.transactionId),
      kind: 'directMint',
      fasset: FAssetType[r.fasset] as FAsset,
      status: 'completed',
      user: r.targetAddress.hex,
      valueUBA: r.mintedAmountUBA,
      feeUBA: r.mintingFeeUBA,
      startedAtTimestamp: r.evmLog.block.timestamp,
      startedTxHash: r.evmLog.transaction.hash,
      resolvedAtTimestamp: r.evmLog.block.timestamp,
      resolvedTxHash: r.evmLog.transaction.hash,
      underlyingPayment: null
    }
  }

  private directMintToSmartAccountFlow(r: Entities.DirectMintingExecutedToSmartAccount): VT.Flow {
    return {
      flowId: this.directMintFlowId(r.fasset, r.transactionId),
      kind: 'directMint',
      fasset: FAssetType[r.fasset] as FAsset,
      status: 'completed',
      paymentAddress: r.sourceAddress.text,
      valueUBA: r.mintedAmountUBA,
      feeUBA: r.mintingFeeUBA,
      startedAtTimestamp: r.evmLog.block.timestamp,
      startedTxHash: r.evmLog.transaction.hash,
      resolvedAtTimestamp: r.evmLog.block.timestamp,
      resolvedTxHash: r.evmLog.transaction.hash,
      underlyingPayment: null
    }
  }

  /**
   * Batch-loads underlying payments for the given flows (mutates `flow.underlyingPayment`).
   * Joins UnderlyingReference by (fasset, paymentReference) for mint/redemption/transfer/return,
   * and UnderlyingTransaction by hash for direct mints.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async attachUnderlyingPayments(em: any, flows: VT.Flow[]): Promise<void> {
    if (flows.length === 0) return
    const referenceKeys: { fasset: FAssetType, reference: string }[] = []
    const directTxHashes: string[] = []
    for (const f of flows) {
      if (f.kind === 'directMint') {
        const flowIdParts = f.flowId.split(':')
        const txId = flowIdParts.slice(2).join(':')
        directTxHashes.push(this.normalizeUnderlyingHash(txId))
      } else if (f.paymentReference != null) {
        referenceKeys.push({ fasset: FAssetType[f.fasset], reference: f.paymentReference })
      }
    }

    const referenceMap = new Map<string, VT.UnderlyingPayment>()
    if (referenceKeys.length > 0) {
      const refs = await em.find(Entities.UnderlyingReference,
        { $or: referenceKeys },
        { populate: ['transaction.block'] })
      for (const ref of refs) {
        const key = `${ref.fasset}:${ref.reference}`
        referenceMap.set(key, {
          txId: ref.transaction.hash,
          blockHeight: ref.transaction.block.height,
          blockTimestamp: ref.transaction.block.timestamp,
          amountUBA: ref.transaction.value
        })
      }
    }

    const directMap = new Map<string, VT.UnderlyingPayment>()
    if (directTxHashes.length > 0) {
      const txs = await em.find(Entities.UnderlyingTransaction,
        { hash: { $in: directTxHashes } },
        { populate: ['block'] })
      for (const tx of txs) {
        directMap.set(tx.hash, {
          txId: tx.hash,
          blockHeight: tx.block.height,
          blockTimestamp: tx.block.timestamp,
          amountUBA: tx.value
        })
      }
    }

    for (const f of flows) {
      if (f.kind === 'directMint') {
        const flowIdParts = f.flowId.split(':')
        const txId = flowIdParts.slice(2).join(':')
        f.underlyingPayment = directMap.get(this.normalizeUnderlyingHash(txId)) ?? null
      } else if (f.paymentReference != null) {
        const key = `${FAssetType[f.fasset]}:${f.paymentReference}`
        f.underlyingPayment = referenceMap.get(key) ?? null
      }
    }
  }

  /** Strips the 0x prefix and uppercases — matches the format stored by the XRP indexer. */
  private normalizeUnderlyingHash(hash: string): string {
    const stripped = hash.startsWith('0x') ? hash.slice(2) : hash
    return stripped.toUpperCase()
  }

  /**
   * Strictly-after cursor filter on (evmLog.block.timestamp, evmLog.block.index).
   * Without sinceBlock, falls back to inclusive timestamp filter for backwards-compat.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private evmSinceWhere(sinceTimestamp: number, sinceBlock?: number): any {
    if (sinceBlock == null) {
      return { evmLog: { block: { timestamp: { $gte: sinceTimestamp } } } }
    }
    return {
      $or: [
        { evmLog: { block: { timestamp: { $gt: sinceTimestamp } } } },
        { evmLog: { block: { timestamp: sinceTimestamp, index: { $gt: sinceBlock } } } }
      ]
    }
  }

  /** Same as evmSinceWhere but for entities whose block field is direct (e.g. UnderlyingReference). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private underlyingSinceWhere(sinceTimestamp: number, sinceBlock?: number): any {
    if (sinceBlock == null) {
      return { block: { timestamp: { $gte: sinceTimestamp } } }
    }
    return {
      $or: [
        { block: { timestamp: { $gt: sinceTimestamp } } },
        { block: { timestamp: sinceTimestamp, height: { $gt: sinceBlock } } }
      ]
    }
  }

  /**
   * Synthesises UnderlyingPaymentObserved events from indexed underlying-tx references
   * at or after the cursor. Decodes the payment reference to resolve flowId, then
   * batch-loads the parent flow entity per kind to attach `agentVault`. Redemption-typed
   * references are disambiguated against TransferToCoreVaultStarted (which reuses the
   * redemption id space).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchUnderlyingPaymentObserved(em: any, sinceTimestamp: number, cap: number, sinceBlock?: number): Promise<VT.VisualiserEvent[]> {
    const refs = await em.find(Entities.UnderlyingReference,
      this.underlyingSinceWhere(sinceTimestamp, sinceBlock),
      { populate: ['block', 'transaction.block'], orderBy: { block: { timestamp: 'asc' } }, limit: cap }
    ) as Entities.UnderlyingReference[]
    if (refs.length === 0) return []

    // Decode references to flow info; collect per-kind id lists for agentVault batch lookup.
    type Decoded = { ref: Entities.UnderlyingReference, flowInfo: { flowId: string, flowKind: VT.FlowKind }, id: number }
    const redemptionIds: { fasset: FAssetType, id: number }[] = []
    for (const r of refs) {
      if (PaymentReference.isRedeem(r.reference)) {
        redemptionIds.push({ fasset: r.fasset, id: Number(PaymentReference.decodeId(r.reference)) })
      }
    }
    const transferIds = new Set<string>() // `${fasset}:${id}`
    if (redemptionIds.length > 0) {
      const transfers = await em.find(Entities.TransferToCoreVaultStarted,
        { $or: redemptionIds.map(k => ({ fasset: k.fasset, transferRedemptionRequestId: k.id })) }
      ) as Entities.TransferToCoreVaultStarted[]
      for (const t of transfers) transferIds.add(`${t.fasset}:${t.transferRedemptionRequestId}`)
    }

    const decoded: Decoded[] = []
    const mintLookups: { fasset: FAssetType, collateralReservationId: number }[] = []
    const redemptionLookups: { fasset: FAssetType, requestId: number }[] = []
    const transferLookups: { fasset: FAssetType, transferRedemptionRequestId: number }[] = []
    const returnLookups: { fasset: FAssetType, requestId: number }[] = []
    for (const r of refs) {
      const flowInfo = this.flowFromReference(r.fasset, r.reference, transferIds)
      if (flowInfo == null) continue
      const id = Number(PaymentReference.decodeId(r.reference))
      decoded.push({ ref: r, flowInfo, id })
      if (flowInfo.flowKind === 'mint') mintLookups.push({ fasset: r.fasset, collateralReservationId: id })
      else if (flowInfo.flowKind === 'redemption') redemptionLookups.push({ fasset: r.fasset, requestId: id })
      else if (flowInfo.flowKind === 'transferToCoreVault') transferLookups.push({ fasset: r.fasset, transferRedemptionRequestId: id })
      else if (flowInfo.flowKind === 'returnFromCoreVault') returnLookups.push({ fasset: r.fasset, requestId: id })
    }

    // Batch-load parent flow entities to recover agentVault per flowId.
    const agentByFlow = new Map<string, string>()
    const populate = ['agentVault.address']
    const fetches: Promise<void>[] = []
    if (mintLookups.length > 0) fetches.push((async () => {
      const ents = await em.find(Entities.CollateralReserved, { $or: mintLookups }, { populate }) as Entities.CollateralReserved[]
      for (const e of ents) agentByFlow.set(this.mintFlowId(e.fasset, e.collateralReservationId), e.agentVault.address.hex)
    })())
    if (redemptionLookups.length > 0) fetches.push((async () => {
      const ents = await em.find(Entities.RedemptionRequested, { $or: redemptionLookups }, { populate }) as Entities.RedemptionRequested[]
      for (const e of ents) agentByFlow.set(this.redemptionFlowId(e.fasset, e.requestId), e.agentVault.address.hex)
    })())
    if (transferLookups.length > 0) fetches.push((async () => {
      const ents = await em.find(Entities.TransferToCoreVaultStarted, { $or: transferLookups }, { populate }) as Entities.TransferToCoreVaultStarted[]
      for (const e of ents) agentByFlow.set(this.transferFlowId(e.fasset, e.transferRedemptionRequestId), e.agentVault.address.hex)
    })())
    if (returnLookups.length > 0) fetches.push((async () => {
      const ents = await em.find(Entities.ReturnFromCoreVaultRequested, { $or: returnLookups }, { populate }) as Entities.ReturnFromCoreVaultRequested[]
      for (const e of ents) agentByFlow.set(this.returnFlowId(e.fasset, e.requestId), e.agentVault.address.hex)
    })())
    await Promise.all(fetches)

    const events: VT.VisualiserEvent[] = []
    for (const { ref: r, flowInfo } of decoded) {
      events.push({
        kind: 'UnderlyingPaymentObserved',
        fasset: FAssetType[r.fasset] as FAsset,
        agentVault: agentByFlow.get(flowInfo.flowId),
        valueUBA: r.transaction.value,
        timestamp: r.block.timestamp,
        blockIndex: r.transaction.block.height,
        txHash: r.transaction.hash,
        flowId: flowInfo.flowId,
        flowKind: flowInfo.flowKind
      })
    }
    return events
  }

  private flowFromReference(
    fasset: FAssetType, reference: string, transferIds: Set<string>
  ): { flowId: string, flowKind: VT.FlowKind } | null {
    if (PaymentReference.isMint(reference)) {
      const id = Number(PaymentReference.decodeId(reference))
      return { flowId: this.mintFlowId(fasset, id), flowKind: 'mint' }
    }
    if (PaymentReference.isRedeem(reference)) {
      const id = Number(PaymentReference.decodeId(reference))
      if (transferIds.has(`${fasset}:${id}`)) {
        return { flowId: this.transferFlowId(fasset, id), flowKind: 'transferToCoreVault' }
      }
      return { flowId: this.redemptionFlowId(fasset, id), flowKind: 'redemption' }
    }
    if (PaymentReference.isReturnFromCoreVault(reference)) {
      const id = Number(PaymentReference.decodeId(reference))
      return { flowId: this.returnFlowId(fasset, id), flowKind: 'returnFromCoreVault' }
    }
    return null
  }

  ////////////////////////////////////////////////////////////////////////
  // delta event feed

  /**
   * Returns events at or after the cursor (sinceTimestamp, sinceBlock), ordered ascending.
   * Bridge polls with the cursor returned by the previous call.
   */
  async eventsSince(
    sinceTimestamp: number,
    limit = 200,
    filter?: { kinds?: VT.VisualiserEventKind[], agentVault?: string, fasset?: FAsset, sinceBlock?: number }
  ): Promise<VT.VisualiserEventFeed> {
    const em = this.orm.em.fork()
    const cap = Math.min(limit, 500)
    const populateBound = ['evmLog.block', 'evmLog.transaction', 'agentVault.address'] as const
    const populateFasset = ['evmLog.block', 'evmLog.transaction'] as const
    const where = this.evmSinceWhere(sinceTimestamp, filter?.sinceBlock)
    const order = { evmLog: { block: { timestamp: 'asc' as const, index: 'asc' as const } } }

    const wantedKinds = filter?.kinds && filter.kinds.length > 0 ? new Set(filter.kinds) : null
    const wants = (k: VT.VisualiserEventKind): boolean => wantedKinds == null || wantedKinds.has(k)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetch = async <T extends object>(kind: VT.VisualiserEventKind, ent: new () => T, populate: readonly string[]): Promise<T[]> => {
      if (!wants(kind)) return []
      return em.find(ent, where as any, { populate: populate as any, orderBy: order as any, limit: cap })
    }

    const [
      collateralReserved, directMint, directMintToSmartAccount, selfMint,
      redemptionRequested,
      liquidationStarted, liquidationPerformed, liquidationEnded, fullLiquidationStarted,
      illegal, duplicate, balanceLow,
      vaultCreated, vaultDestroyed,
      transferStarted, returnRequested
    ] = await Promise.all([
      fetch('CollateralReserved', Entities.CollateralReserved, populateBound),
      fetch('DirectMintingExecuted', Entities.DirectMintingExecuted, populateFasset),
      // DirectMintingExecutedToSmartAccount surfaces under the same DirectMintingExecuted event kind:
      // both represent a completed directMint flow; they only differ in target shape (EVM target
      // vs underlying source + memo). The flowId namespace is shared (transactionId is disjoint).
      fetch('DirectMintingExecuted', Entities.DirectMintingExecutedToSmartAccount, populateFasset),
      fetch('SelfMint', Entities.SelfMint, populateBound),
      fetch('RedemptionRequested', Entities.RedemptionRequested, [...populateBound, 'redeemer', 'paymentReference']),
      fetch('LiquidationStarted', Entities.LiquidationStarted, populateBound),
      fetch('LiquidationPerformed', Entities.LiquidationPerformed, [...populateBound, 'liquidator']),
      fetch('LiquidationEnded', Entities.LiquidationEnded, populateBound),
      fetch('FullLiquidationStarted', Entities.FullLiquidationStarted, populateBound),
      fetch('IllegalPaymentConfirmed', Entities.IllegalPaymentConfirmed, populateBound),
      fetch('DuplicatePaymentConfirmed', Entities.DuplicatePaymentConfirmed, populateBound),
      fetch('UnderlyingBalanceTooLow', Entities.UnderlyingBalanceTooLow, populateBound),
      fetch('AgentVaultCreated', Entities.AgentVaultCreated, populateBound),
      fetch('AgentVaultDestroyed', Entities.AgentVaultDestroyed, populateBound),
      fetch('TransferToCoreVaultStarted', Entities.TransferToCoreVaultStarted, populateBound),
      fetch('ReturnFromCoreVaultRequested', Entities.ReturnFromCoreVaultRequested, populateBound)
    ])

    const evs: VT.VisualiserEvent[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushEvent = (kind: VT.VisualiserEventKind, e: any, opts: { agentVault?: string, valueUBA?: bigint, user?: string, fasset?: FAsset, flowId?: string, flowKind?: VT.FlowKind, txHash?: string }) => {
      evs.push({
        kind,
        fasset: opts.fasset ?? (e.fasset != null ? (FAssetType[e.fasset] as FAsset) : undefined),
        agentVault: opts.agentVault,
        user: opts.user,
        valueUBA: opts.valueUBA,
        timestamp: e.evmLog.block.timestamp,
        blockIndex: e.evmLog.block.index,
        txHash: opts.txHash ?? e.evmLog.transaction.hash,
        flowId: opts.flowId,
        flowKind: opts.flowKind
      })
    }

    for (const e of collateralReserved) {
      if (wants('CollateralReserved')) pushEvent('CollateralReserved', e, {
        agentVault: e.agentVault?.address?.hex, valueUBA: e.valueUBA, user: e.minter?.hex,
        flowId: this.mintFlowId(e.fasset, e.collateralReservationId), flowKind: 'mint'
      })
    }
    for (const e of directMint) {
      if (wants('DirectMintingExecuted')) pushEvent('DirectMintingExecuted', e, {
        valueUBA: e.mintedAmountUBA,
        flowId: this.directMintFlowId(e.fasset, e.transactionId), flowKind: 'directMint'
      })
    }
    for (const e of directMintToSmartAccount) {
      if (wants('DirectMintingExecuted')) pushEvent('DirectMintingExecuted', e, {
        valueUBA: e.mintedAmountUBA,
        flowId: this.directMintFlowId(e.fasset, e.transactionId), flowKind: 'directMint'
      })
    }
    for (const e of selfMint) {
      if (wants('SelfMint')) pushEvent('SelfMint', e, {
        agentVault: e.agentVault?.address?.hex, valueUBA: e.mintedUBA
      })
    }
    for (const e of redemptionRequested) {
      if (wants('RedemptionRequested')) pushEvent('RedemptionRequested', e, {
        agentVault: e.agentVault?.address?.hex, valueUBA: e.valueUBA, user: e.redeemer?.hex,
        flowId: this.redemptionFlowId(e.fasset, e.requestId), flowKind: 'redemption'
      })
    }
    for (const e of liquidationStarted) {
      if (wants('LiquidationStarted')) pushEvent('LiquidationStarted', e, { agentVault: e.agentVault?.address?.hex })
    }
    for (const e of liquidationPerformed) {
      if (wants('LiquidationPerformed')) pushEvent('LiquidationPerformed', e, {
        agentVault: e.agentVault?.address?.hex, valueUBA: e.valueUBA, user: e.liquidator?.hex
      })
    }
    for (const e of liquidationEnded) {
      if (wants('LiquidationEnded')) pushEvent('LiquidationEnded', e, { agentVault: e.agentVault?.address?.hex })
    }
    for (const e of fullLiquidationStarted) {
      if (wants('FullLiquidationStarted')) pushEvent('FullLiquidationStarted', e, { agentVault: e.agentVault?.address?.hex })
    }
    for (const e of illegal) {
      if (wants('IllegalPaymentConfirmed')) pushEvent('IllegalPaymentConfirmed', e, { agentVault: e.agentVault?.address?.hex })
    }
    for (const e of duplicate) {
      if (wants('DuplicatePaymentConfirmed')) pushEvent('DuplicatePaymentConfirmed', e, { agentVault: e.agentVault?.address?.hex })
    }
    for (const e of balanceLow) {
      if (wants('UnderlyingBalanceTooLow')) pushEvent('UnderlyingBalanceTooLow', e, { agentVault: e.agentVault?.address?.hex })
    }
    for (const e of vaultCreated) {
      if (wants('AgentVaultCreated')) pushEvent('AgentVaultCreated', e, { agentVault: e.agentVault?.address?.hex })
    }
    for (const e of vaultDestroyed) {
      if (wants('AgentVaultDestroyed')) pushEvent('AgentVaultDestroyed', e, { agentVault: e.agentVault?.address?.hex })
    }
    for (const e of transferStarted) {
      if (wants('TransferToCoreVaultStarted')) pushEvent('TransferToCoreVaultStarted', e, {
        agentVault: e.agentVault?.address?.hex, valueUBA: e.valueUBA,
        flowId: this.transferFlowId(e.fasset, e.transferRedemptionRequestId), flowKind: 'transferToCoreVault'
      })
    }
    for (const e of returnRequested) {
      if (wants('ReturnFromCoreVaultRequested')) pushEvent('ReturnFromCoreVaultRequested', e, {
        agentVault: e.agentVault?.address?.hex, valueUBA: e.valueUBA,
        flowId: this.returnFlowId(e.fasset, e.requestId), flowKind: 'returnFromCoreVault'
      })
    }

    if (wants('UnderlyingPaymentObserved')) {
      const observed = await this.fetchUnderlyingPaymentObserved(em, sinceTimestamp, cap, filter?.sinceBlock)
      evs.push(...observed)
    }

    let filtered = evs
    if (filter?.agentVault != null) {
      const target = filter.agentVault.toLowerCase()
      filtered = filtered.filter(e => e.agentVault != null && e.agentVault.toLowerCase() === target)
    }
    if (filter?.fasset != null) {
      filtered = filtered.filter(e => e.fasset === filter.fasset)
    }
    filtered.sort((a, b) => a.timestamp - b.timestamp || a.blockIndex - b.blockIndex)
    const truncated = filtered.slice(0, cap)
    const last = truncated[truncated.length - 1]
    const cursor = last != null ? { timestamp: last.timestamp, blockIndex: last.blockIndex } : null
    return { events: truncated, cursor, hasMore: filtered.length > cap }
  }
}
