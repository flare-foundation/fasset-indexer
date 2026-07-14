import { Entity, Enum, Property } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"
import { FAssetType } from "../../../shared"


/**
 * Snapshot of live system parameters fetched from on-chain. Refreshed periodically
 * by the watchdog. One row per FAsset. Stored separately from AssetManagerSettings /
 * CoreVaultManagerSettings (which mirror specific event-driven slices) because this
 * row is meant to be a holistic, watchdog-polled view for the visualiser.
 */
@Entity()
export class SystemSettings {

  @Enum({ type: () => FAssetType, primary: true })
  fasset!: FAssetType

  @Property({ type: 'integer' })
  updatedAt!: number

  // === asset manager — minting / collateral ===

  @Property({ type: new uint256() })
  lotSizeAMG!: bigint

  @Property({ type: new uint256() })
  mintingCapAMG!: bigint

  @Property({ type: new uint256() })
  mintingPoolHoldingsRequiredBIPS!: bigint

  @Property({ type: new uint256() })
  collateralReservationFeeBIPS!: bigint

  @Property({ type: new uint256() })
  underlyingBlocksForPayment!: bigint

  @Property({ type: new uint256() })
  underlyingSecondsForPayment!: bigint

  // === asset manager — redemption ===

  @Property({ type: new uint256() })
  redemptionFeeBIPS!: bigint

  @Property({ type: new uint256() })
  redemptionDefaultFactorVaultCollateralBIPS!: bigint

  @Property({ type: new uint256() })
  confirmationByOthersAfterSeconds!: bigint

  @Property({ type: new uint256() })
  confirmationByOthersRewardUSD5!: bigint

  @Property({ type: new uint256() })
  maxRedeemedTickets!: bigint

  // === asset manager — challenge ===

  @Property({ type: new uint256() })
  paymentChallengeRewardBIPS!: bigint

  @Property({ type: new uint256() })
  paymentChallengeRewardUSD5!: bigint

  // === asset manager — collateral / pricing ===

  @Property({ type: new uint256() })
  withdrawalWaitMinSeconds!: bigint

  @Property({ type: new uint256() })
  maxTrustedPriceAgeSeconds!: bigint

  @Property({ type: new uint256() })
  vaultCollateralBuyForFlareFactorBIPS!: bigint

  // === asset manager — attestation ===

  @Property({ type: new uint256() })
  attestationWindowSeconds!: bigint

  @Property({ type: new uint256() })
  minUpdateRepeatTimeSeconds!: bigint

  // === asset manager — timelocks ===

  @Property({ type: new uint256() })
  agentExitAvailableTimelockSeconds!: bigint

  @Property({ type: new uint256() })
  agentFeeChangeTimelockSeconds!: bigint

  @Property({ type: new uint256() })
  agentMintingCRChangeTimelockSeconds!: bigint

  @Property({ type: new uint256() })
  poolExitCRChangeTimelockSeconds!: bigint

  @Property({ type: new uint256() })
  agentTimelockedOperationWindowSeconds!: bigint

  @Property({ type: new uint256() })
  collateralPoolTokenTimelockSeconds!: bigint

  // === asset manager — liquidation ===

  @Property({ type: new uint256() })
  liquidationStepSeconds!: bigint

  // Stored as comma-separated decimal strings — variable-length BIPS arrays.
  @Property({ type: 'text' })
  liquidationCollateralFactorBIPS!: string

  @Property({ type: 'text' })
  liquidationFactorVaultCollateralBIPS!: string

  // === asset manager — diamond / emergency pause ===

  @Property({ type: new uint256() })
  diamondCutMinTimelockSeconds!: bigint

  @Property({ type: new uint256() })
  maxEmergencyPauseDurationSeconds!: bigint

  @Property({ type: new uint256() })
  emergencyPauseDurationResetAfterSeconds!: bigint

  // === asset manager — redemption (extra single-value getters) ===

  @Property({ type: new uint256() })
  redemptionPaymentExtensionSeconds!: bigint

  @Property({ type: new uint256() })
  minimumRedeemAmountUBA!: bigint

  @Property({ type: 'boolean' })
  redeemWithTagSupported!: boolean

  // === asset manager — wiring addresses ===

  @Property({ type: 'text' })
  mintingTagManager!: string

  @Property({ type: 'text' })
  smartAccountManager!: string

  @Property({ type: 'text' })
  wNat!: string

  // === asset manager — direct minting ===

  @Property({ type: new uint256() })
  directMintingDailyLimitUBA!: bigint

  @Property({ type: new uint256() })
  directMintingHourlyLimitUBA!: bigint

  @Property({ type: new uint256() })
  directMintingLargeMintingThresholdUBA!: bigint

  @Property({ type: new uint256() })
  directMintingLargeMintingDelaySeconds!: bigint

  @Property({ type: new uint256() })
  directMintingFeeBIPS!: bigint

  @Property({ type: new uint256() })
  directMintingMinimumFeeUBA!: bigint

  @Property({ type: new uint256() })
  directMintingExecutorFeeUBA!: bigint

  @Property({ type: 'text' })
  directMintingFeeReceiver!: string

  @Property({ type: new uint256() })
  directMintingOthersCanExecuteAfterSeconds!: bigint

  @Property({ type: new uint256() })
  directMintingsUnblockUntilTimestamp!: bigint

  @Property({ type: 'text' })
  directMintingPaymentAddress!: string

  // === asset manager — direct minting rolling-window limiter state ===
  // Live per-window consumption from get*LimiterState(). Null when the asset
  // manager predates these getters (older ABI reverts — see watchdog try/catch).

  @Property({ type: new uint256(), nullable: true })
  directMintingHourlyMintedUBA?: bigint

  @Property({ type: 'integer', nullable: true })
  directMintingHourlyWindowStart?: number

  @Property({ type: new uint256(), nullable: true })
  directMintingDailyMintedUBA?: bigint

  @Property({ type: 'integer', nullable: true })
  directMintingDailyWindowStart?: number

  // === asset manager — core vault parameters (null when no core vault configured) ===

  @Property({ type: 'text', nullable: true })
  coreVaultManager?: string

  @Property({ type: 'text', nullable: true })
  coreVaultNativeAddress?: string

  @Property({ type: new uint256(), nullable: true })
  coreVaultMinimumAmountLeftBIPS?: bigint

  @Property({ type: new uint256(), nullable: true })
  coreVaultMinimumRedeemLots?: bigint

  @Property({ type: new uint256(), nullable: true })
  coreVaultRedemptionFeeBIPS?: bigint

  @Property({ type: new uint256(), nullable: true })
  coreVaultTransferDefaultPenaltyBIPS?: bigint

  @Property({ type: new uint256(), nullable: true })
  coreVaultTransferTimeExtensionSeconds?: bigint

  @Property({ type: new uint256(), nullable: true })
  coreVaultDonationTag?: bigint

  // === core vault manager — getSettings() (null when no core vault configured) ===

  @Property({ type: new uint256(), nullable: true })
  coreVaultEscrowAmount?: bigint

  @Property({ type: new uint256(), nullable: true })
  coreVaultMinimalAmount?: bigint

  @Property({ type: 'integer', nullable: true })
  coreVaultEscrowEndTimeSeconds?: number

  @Property({ type: new uint256(), nullable: true })
  coreVaultChainPaymentFee?: bigint
}
