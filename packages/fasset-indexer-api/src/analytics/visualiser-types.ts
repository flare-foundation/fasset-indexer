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
  ownerAddress: string
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

// emergency pause status — derived from EmergencyPauseTriggered/Cancelled events

export interface EmergencyPauseStatus {
  fasset: FAsset
  paused: boolean
  externalLevel?: number
  externalPausedUntil?: number
  governanceLevel?: number
  governancePausedUntil?: number
  triggeredAtTimestamp?: number
  triggeredTxHash?: string
}

// system settings — polled snapshot of on-chain configuration parameters

export interface SystemSettingsEntry {
  fasset: FAsset
  updatedAt: number
  // minting / collateral
  lotSizeAMG: bigint
  mintingCapAMG: bigint
  mintingPoolHoldingsRequiredBIPS: bigint
  collateralReservationFeeBIPS: bigint
  underlyingBlocksForPayment: bigint
  underlyingSecondsForPayment: bigint
  // redemption
  redemptionFeeBIPS: bigint
  redemptionDefaultFactorVaultCollateralBIPS: bigint
  confirmationByOthersAfterSeconds: bigint
  confirmationByOthersRewardUSD5: bigint
  maxRedeemedTickets: bigint
  // challenge
  paymentChallengeRewardBIPS: bigint
  paymentChallengeRewardUSD5: bigint
  // collateral / pricing
  withdrawalWaitMinSeconds: bigint
  maxTrustedPriceAgeSeconds: bigint
  vaultCollateralBuyForFlareFactorBIPS: bigint
  // attestation
  attestationWindowSeconds: bigint
  minUpdateRepeatTimeSeconds: bigint
  // timelocks
  agentExitAvailableTimelockSeconds: bigint
  agentFeeChangeTimelockSeconds: bigint
  agentMintingCRChangeTimelockSeconds: bigint
  poolExitCRChangeTimelockSeconds: bigint
  agentTimelockedOperationWindowSeconds: bigint
  collateralPoolTokenTimelockSeconds: bigint
  // liquidation
  liquidationStepSeconds: bigint
  liquidationCollateralFactorBIPS: bigint[]
  liquidationFactorVaultCollateralBIPS: bigint[]
  // diamond / emergency pause
  diamondCutMinTimelockSeconds: bigint
  maxEmergencyPauseDurationSeconds: bigint
  emergencyPauseDurationResetAfterSeconds: bigint
  // redemption (extra single-value getters)
  redemptionPaymentExtensionSeconds: bigint
  minimumRedeemAmountUBA: bigint
  redeemWithTagSupported: boolean
  // wiring addresses
  mintingTagManager: string
  smartAccountManager: string
  wNat: string
  // direct minting
  directMintingDailyLimitUBA: bigint
  directMintingHourlyLimitUBA: bigint
  directMintingLargeMintingThresholdUBA: bigint
  directMintingLargeMintingDelaySeconds: bigint
  directMintingFeeBIPS: bigint
  directMintingMinimumFeeUBA: bigint
  directMintingExecutorFeeUBA: bigint
  directMintingFeeReceiver: string
  directMintingOthersCanExecuteAfterSeconds: bigint
  directMintingsUnblockUntilTimestamp: bigint
  directMintingPaymentAddress: string
  // core vault (null when no core vault is wired up for this fasset)
  coreVaultManager?: string
  coreVaultNativeAddress?: string
  coreVaultMinimumAmountLeftBIPS?: bigint
  coreVaultMinimumRedeemLots?: bigint
  coreVaultRedemptionFeeBIPS?: bigint
  coreVaultTransferDefaultPenaltyBIPS?: bigint
  coreVaultTransferTimeExtensionSeconds?: bigint
  coreVaultDonationTag?: bigint
  coreVaultEscrowAmount?: bigint
  coreVaultMinimalAmount?: bigint
  coreVaultEscrowEndTimeSeconds?: number
  coreVaultChainPaymentFee?: bigint
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
