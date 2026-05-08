import type { FAsset } from "fasset-indexer-core"


// scene snapshot

export interface SystemOverview {
  chain: string
  fassets: FAsset[]
  latestBlock: { index: number | null, timestamp: number | null }
  lotSizesUBA: Partial<Record<FAsset, bigint>>
  fAssetSupplyUBA: Partial<Record<FAsset, bigint>>
  trackedAgentBackingUBA: Partial<Record<FAsset, bigint>>
  prices: PriceTick[]
  agentCount: { total: number, available: number, liquidating: number, fullLiquidation: number }
}

// agents

export interface AgentOverview {
  vault: string
  underlyingAddress: string
  collateralPool: string
  collateralPoolToken?: string
  fasset: FAsset
  ownerManager: string
  ownerName?: string
  ownerIconUrl?: string
  publiclyAvailable: boolean
  destroyed: boolean
  status: AgentStatus
  // collateral
  vaultCollateralRatioBIPS: bigint
  poolCollateralRatioBIPS: bigint
  totalVaultCollateralWei: bigint
  freeVaultCollateralWei: bigint
  totalPoolCollateralNATWei: bigint
  freePoolCollateralNATWei: bigint
  freeCollateralLots: bigint
  // amounts
  mintedUBA: bigint
  reservedUBA: bigint
  redeemingUBA: bigint
  poolRedeemingUBA: bigint
  dustUBA: bigint
  underlyingBalanceUBA: bigint
  freeUnderlyingBalanceUBA: bigint
  requiredUnderlyingBalanceUBA: bigint
  // liquidation
  ccbStartTimestamp?: number
  liquidationStartTimestamp: number
  maxLiquidationAmountUBA: bigint
  liquidationPaymentFactorVaultBIPS: bigint
  liquidationPaymentFactorPoolBIPS: bigint
  // settings
  feeBIPS?: bigint
  poolFeeShareBIPS?: bigint
  mintingVaultCollateralRatioBIPS?: bigint
  mintingPoolCollateralRatioBIPS?: bigint
}

export enum AgentStatus {
  Normal = 0,
  CCB = 1,
  Liquidation = 2,
  FullLiquidation = 3,
  Destroying = 4
}

// live state

export interface PriceTick {
  symbol: string
  price: bigint
  decimals: number
  timestamp: number
}

export interface ActiveRedemptionTicket {
  ticketId: string
  fasset: FAsset
  agentVault: string
  ticketValueUBA: bigint
  createdAtTimestamp: number
}

export interface ActiveMinting {
  collateralReservationId: number
  fasset: FAsset
  agentVault: string
  minter: string
  paymentAddress: string
  valueUBA: bigint
  feeUBA: bigint
  reservedAtTimestamp: number
  paymentDeadlineTimestamp: number
}

export interface ActiveRedemption {
  requestId: number
  fasset: FAsset
  agentVault: string
  redeemer: string
  paymentAddress: string
  valueUBA: bigint
  feeUBA: bigint
  requestedAtTimestamp: number
  paymentDeadlineTimestamp: number
}

export interface ActiveLiquidation {
  agentVault: string
  fasset: FAsset
  status: AgentStatus
  ccbStartTimestamp?: number
  liquidationStartTimestamp: number
  maxLiquidationAmountUBA: bigint
  liquidationPaymentFactorVaultBIPS: bigint
  liquidationPaymentFactorPoolBIPS: bigint
  vaultCollateralRatioBIPS: bigint
  poolCollateralRatioBIPS: bigint
  mintedUBA: bigint
}

export interface ChallengeEvent {
  kind: 'IllegalPayment' | 'DuplicatePayment' | 'UnderlyingBalanceTooLow'
  timestamp: number
  blockIndex: number
  txHash: string
  fasset: FAsset
  agentVault: string
  details: Record<string, string | number | bigint>
}

// flows

export type FlowKind = 'mint' | 'redemption' | 'transferToCoreVault' | 'returnFromCoreVault' | 'directMint'

export type FlowStatus = 'active' | 'completed' | 'defaulted' | 'cancelled' | 'failed'

export interface UnderlyingPayment {
  txId: string
  blockHeight: number
  blockTimestamp: number
  amountUBA: bigint
}

export interface Flow {
  flowId: string
  kind: FlowKind
  fasset: FAsset
  status: FlowStatus
  agentVault?: string
  user?: string
  paymentAddress?: string
  paymentReference?: string
  valueUBA: bigint
  feeUBA?: bigint
  startedAtTimestamp: number
  startedTxHash: string
  resolvedAtTimestamp?: number
  resolvedTxHash?: string
  paymentDeadlineTimestamp?: number
  underlyingPayment: UnderlyingPayment | null
}

export interface FlowsFeed {
  flows: Flow[]
  cursor: { timestamp: number, blockIndex: number } | null
  hasMore: boolean
}

// underlying-chain delta — own coordinate space (block timestamp + block height)

export interface UnderlyingPaymentEntry {
  txId: string
  blockHeight: number
  blockTimestamp: number
  amountUBA: bigint
  fasset: FAsset
  paymentReference: string
}

export interface UnderlyingPaymentsFeed {
  payments: UnderlyingPaymentEntry[]
  cursor: { timestamp: number, blockHeight: number } | null
  hasMore: boolean
}

// delta event feed

/**
 * Flow-level resolution events (MintingExecuted, RedemptionPerformed, …Defaulted, …Cancelled, etc.)
 * are intentionally absent — their state is reflected in `Flow.status` on the corresponding
 * Flow record, fetched via /flows/:flowId, /flows/active, or the /flows delta feed. The events
 * feed only carries flow-start signals plus agent-state and challenge events.
 */
export type VisualiserEventKind =
  | 'CollateralReserved'
  | 'DirectMintingExecuted'
  | 'SelfMint'
  | 'RedemptionRequested'
  | 'TransferToCoreVaultStarted'
  | 'ReturnFromCoreVaultRequested'
  | 'LiquidationStarted'
  | 'LiquidationPerformed'
  | 'LiquidationEnded'
  | 'FullLiquidationStarted'
  | 'IllegalPaymentConfirmed'
  | 'DuplicatePaymentConfirmed'
  | 'UnderlyingBalanceTooLow'
  | 'AgentVaultCreated'
  | 'AgentVaultDestroyed'

export interface VisualiserEvent {
  kind: VisualiserEventKind
  fasset?: FAsset
  agentVault?: string
  user?: string
  valueUBA?: bigint
  timestamp: number
  blockIndex: number
  txHash: string
  flowId?: string
  flowKind?: FlowKind
}

export interface VisualiserEventFeed {
  events: VisualiserEvent[]
  cursor: { timestamp: number, blockIndex: number } | null
  hasMore: boolean
}

// bundled snapshots

export interface SceneSnapshot extends SystemOverview {
  agents: AgentOverview[]
}

export interface AgentState {
  agent: AgentOverview
  activeMintings: ActiveMinting[]
  activeRedemptions: ActiveRedemption[]
  activeTickets: ActiveRedemptionTicket[]
  liquidation?: ActiveLiquidation
}
