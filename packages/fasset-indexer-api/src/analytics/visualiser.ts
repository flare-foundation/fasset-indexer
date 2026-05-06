import { FAsset, FAssetType, CollateralReservationResolution, RedemptionResolution } from "fasset-indexer-core"
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
    const [latestBlock, lots, supplyTs, backingResult, prices, agentCount] = await Promise.all([
      em.findOne(Entities.EvmBlock, {}, { orderBy: { index: 'desc' } }),
      this.lotSizeUBA(),
      this.fAssetSupplyTimespan([now]),
      this.trackedAgentUnderlyingBacking(),
      this.prices(),
      this.agentCounts()
    ])
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
  // delta event feed

  /**
   * Returns events emitted at block timestamp >= sinceTimestamp, ordered ascending.
   * Bridge polls with the cursor returned by the previous call.
   */
  async eventsSince(sinceTimestamp: number, limit = 200): Promise<VT.VisualiserEventFeed> {
    const em = this.orm.em.fork()
    const cap = Math.min(limit, 500)
    const populateBound = ['evmLog.block', 'evmLog.transaction', 'agentVault.address'] as const
    const populateFasset = ['evmLog.block', 'evmLog.transaction'] as const
    const where = { evmLog: { block: { timestamp: { $gte: sinceTimestamp } } } }
    const order = { evmLog: { block: { timestamp: 'asc' as const, index: 'asc' as const } } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetch = async <T extends object>(ent: new () => T, populate: readonly string[]): Promise<T[]> =>
      em.find(ent, where as any, { populate: populate as any, orderBy: order as any, limit: cap })

    const [
      collateralReserved, mintingExecuted, mintingDefault, mintingDeleted, directMint, selfMint,
      redemptionRequested, redemptionPerformed, redemptionDefault, redemptionRejected,
      redemptionPaymentBlocked, redemptionPaymentFailed,
      liquidationStarted, liquidationPerformed, liquidationEnded, fullLiquidationStarted,
      illegal, duplicate, balanceLow,
      vaultCreated, vaultDestroyed,
      transferStarted, transferSuccess, transferDefault
    ] = await Promise.all([
      fetch(Entities.CollateralReserved, populateBound),
      fetch(Entities.MintingExecuted, [...populateFasset, 'collateralReserved.agentVault.address']),
      fetch(Entities.MintingPaymentDefault, [...populateFasset, 'collateralReserved.agentVault.address']),
      fetch(Entities.CollateralReservationDeleted, [...populateFasset, 'collateralReserved.agentVault.address']),
      fetch(Entities.DirectMintingExecuted, populateFasset),
      fetch(Entities.SelfMint, populateBound),
      fetch(Entities.RedemptionRequested, [...populateBound, 'redeemer']),
      fetch(Entities.RedemptionPerformed, [...populateFasset, 'redemptionRequested.agentVault.address']),
      fetch(Entities.RedemptionDefault, [...populateFasset, 'redemptionRequested.agentVault.address']),
      fetch(Entities.RedemptionRejected, [...populateFasset, 'redemptionRequested.agentVault.address']),
      fetch(Entities.RedemptionPaymentBlocked, [...populateFasset, 'redemptionRequested.agentVault.address']),
      fetch(Entities.RedemptionPaymentFailed, [...populateFasset, 'redemptionRequested.agentVault.address']),
      fetch(Entities.LiquidationStarted, populateBound),
      fetch(Entities.LiquidationPerformed, [...populateBound, 'liquidator']),
      fetch(Entities.LiquidationEnded, populateBound),
      fetch(Entities.FullLiquidationStarted, populateBound),
      fetch(Entities.IllegalPaymentConfirmed, populateBound),
      fetch(Entities.DuplicatePaymentConfirmed, populateBound),
      fetch(Entities.UnderlyingBalanceTooLow, populateBound),
      fetch(Entities.AgentVaultCreated, populateBound),
      fetch(Entities.AgentVaultDestroyed, populateBound),
      fetch(Entities.TransferToCoreVaultStarted, populateBound),
      fetch(Entities.TransferToCoreVaultSuccessful, [...populateFasset, 'transferToCoreVaultStarted.agentVault.address']),
      fetch(Entities.TransferToCoreVaultDefaulted, [...populateFasset, 'transferToCoreVaultStarted.agentVault.address'])
    ])

    const evs: VT.VisualiserEvent[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushBound = (kind: VT.VisualiserEventKind, e: any, valueUBA?: bigint, user?: string) => {
      evs.push({
        kind,
        fasset: e.fasset != null ? (FAssetType[e.fasset] as FAsset) : undefined,
        agentVault: e.agentVault?.address?.hex,
        user,
        valueUBA,
        timestamp: e.evmLog.block.timestamp,
        blockIndex: e.evmLog.block.index,
        txHash: e.evmLog.transaction.hash
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushVia = (kind: VT.VisualiserEventKind, e: any, parent: any, valueUBA?: bigint) => {
      evs.push({
        kind,
        fasset: e.fasset != null ? (FAssetType[e.fasset] as FAsset) : undefined,
        agentVault: parent?.agentVault?.address?.hex,
        valueUBA,
        timestamp: e.evmLog.block.timestamp,
        blockIndex: e.evmLog.block.index,
        txHash: e.evmLog.transaction.hash
      })
    }

    for (const e of collateralReserved) pushBound('CollateralReserved', e, e.valueUBA, e.minter?.hex)
    for (const e of mintingExecuted) pushVia('MintingExecuted', e, e.collateralReserved, e.collateralReserved.valueUBA)
    for (const e of mintingDefault) pushVia('MintingPaymentDefault', e, e.collateralReserved, e.collateralReserved.valueUBA)
    for (const e of mintingDeleted) pushVia('CollateralReservationDeleted', e, e.collateralReserved, e.collateralReserved.valueUBA)
    for (const e of directMint) {
      evs.push({
        kind: 'DirectMintingExecuted',
        fasset: FAssetType[e.fasset] as FAsset,
        valueUBA: e.mintedAmountUBA,
        timestamp: e.evmLog.block.timestamp,
        blockIndex: e.evmLog.block.index,
        txHash: e.evmLog.transaction.hash
      })
    }
    for (const e of selfMint) pushBound('SelfMint', e, e.mintedUBA)
    for (const e of redemptionRequested) pushBound('RedemptionRequested', e, e.valueUBA, e.redeemer?.hex)
    for (const e of redemptionPerformed) pushVia('RedemptionPerformed', e, e.redemptionRequested, e.redemptionRequested.valueUBA)
    for (const e of redemptionDefault) pushVia('RedemptionDefault', e, e.redemptionRequested, e.redemptionRequested.valueUBA)
    for (const e of redemptionRejected) pushVia('RedemptionRejected', e, e.redemptionRequested, e.redemptionRequested.valueUBA)
    for (const e of redemptionPaymentBlocked) pushVia('RedemptionPaymentBlocked', e, e.redemptionRequested, e.redemptionRequested.valueUBA)
    for (const e of redemptionPaymentFailed) pushVia('RedemptionPaymentFailed', e, e.redemptionRequested, e.redemptionRequested.valueUBA)
    for (const e of liquidationStarted) pushBound('LiquidationStarted', e)
    for (const e of liquidationPerformed) pushBound('LiquidationPerformed', e, e.valueUBA, e.liquidator?.hex)
    for (const e of liquidationEnded) pushBound('LiquidationEnded', e)
    for (const e of fullLiquidationStarted) pushBound('FullLiquidationStarted', e)
    for (const e of illegal) pushBound('IllegalPaymentConfirmed', e)
    for (const e of duplicate) pushBound('DuplicatePaymentConfirmed', e)
    for (const e of balanceLow) pushBound('UnderlyingBalanceTooLow', e)
    for (const e of vaultCreated) pushBound('AgentVaultCreated', e)
    for (const e of vaultDestroyed) pushBound('AgentVaultDestroyed', e)
    for (const e of transferStarted) pushBound('TransferToCoreVaultStarted', e, e.valueUBA)
    for (const e of transferSuccess) pushVia('TransferToCoreVaultSuccessful', e, e.transferToCoreVaultStarted, e.transferToCoreVaultStarted.valueUBA)
    for (const e of transferDefault) pushVia('TransferToCoreVaultDefaulted', e, e.transferToCoreVaultStarted, e.transferToCoreVaultStarted.valueUBA)

    evs.sort((a, b) => a.timestamp - b.timestamp || a.blockIndex - b.blockIndex)
    const truncated = evs.slice(0, cap)
    const last = truncated[truncated.length - 1]
    const cursor = last != null ? { timestamp: last.timestamp, blockIndex: last.blockIndex } : null
    return { events: truncated, cursor, hasMore: evs.length > cap }
  }
}
