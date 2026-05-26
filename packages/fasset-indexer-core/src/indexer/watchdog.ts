import { sleep } from "../utils/general"
import { CollateralTypeAdded } from "../orm/entities/events/token"
import { AgentVault } from "../orm/entities/agent"
import { FtsoPrice } from "../orm/entities/state/price"
import { SystemSettings } from "../orm/entities/state/system-settings"
import { isUntrackedAgentVault, updateAgentVaultInfo } from "./utils"
import { Context } from "../context/context"
import { logger } from "../logger"
import { FASSETS, FAssetType } from "../shared"
import type { EntityManager } from "@mikro-orm/knex"


const SYSTEM_SETTINGS_POLL_INTERVAL_MS = 5 * 60 * 1000

export class EvmStateWatchdog {

  private lastSystemSettingsPollMs = 0

  constructor(public readonly context: Context) {}

  async run(): Promise<void> {
    while (true) {
      try {
        await this.context.orm.em.fork().transactional(async em => {
          await this.watchAgentInfo(em)
          await this.watchFtsoPrices(em)
          try {
            await this.watchSystemSettings(em)
          } catch (e) {
            logger.error(`error while updating system settings: ${e}`)
          }
        })
      } catch (e: any) {
        logger.error(`error in top-level Flare watchdog: ${e}`)
      }
      await sleep(this.context.config.stateFetchCycleSleepMs)
    }
  }

  async watchAgentInfo(em: EntityManager): Promise<void> {
    const agents = await em.find(AgentVault, { destroyed: false }, { populate: ['address'] })
    for (const agent of agents) {
      const agentUntracked = await isUntrackedAgentVault(em, agent.address.hex)
      if (agentUntracked) continue
      try {
        logger.info(`updating agent ${agent.address.hex} info for agent vault`)
        const assetManager = this.context.fAssetTypeToAssetManagerAddress(agent.fasset)
        await updateAgentVaultInfo(this.context, em, assetManager, agent.address.hex)
      } catch (e: any) {
        logger.error(`error updating agent ${agent.address} info: ${e}`)
      }
    }
  }

  async watchFtsoPrices(em: EntityManager): Promise<void> {
    const collateralTypes = await em.findAll(CollateralTypeAdded)
    const collateralSymbols = new Map<string, FAssetType>()
    for (const collateralType of collateralTypes) {
      collateralSymbols.set(collateralType.tokenFtsoSymbol, collateralType.fasset)
      collateralSymbols.set(collateralType.assetFtsoSymbol, collateralType.fasset)
    }
    for (const [symbol] of collateralSymbols) {
      try {
        logger.info(`updating ${symbol} price`)
        const { _price, _priceDecimals, _timestamp } = await this.context.contracts.priceReader.getPrice(symbol)
        em.upsert(FtsoPrice, {
          symbol: symbol,
          price: _price,
          decimals: Number(_priceDecimals),
          timestamp: Number(_timestamp)
        })
      } catch (err: any) {
        logger.error(`error updating ${symbol} price: ${err}`)
      }
    }
  }

  async watchSystemSettings(em: EntityManager): Promise<void> {
    const now = Date.now()
    if (now - this.lastSystemSettingsPollMs < SYSTEM_SETTINGS_POLL_INTERVAL_MS) return
    this.lastSystemSettingsPollMs = now
    const updatedAt = Math.floor(now / 1000)
    for (const _fasset of FASSETS) {
      const fasset = FAssetType[_fasset]
      if (!this.context.supportsFAsset(fasset)) continue
      try {
        logger.info(`updating system settings for ${_fasset}`)
        const row = await this.fetchSystemSettings(fasset, updatedAt)
        em.upsert(SystemSettings, row)
      } catch (e) {
        logger.error(`error updating system settings for ${_fasset}: ${e}`)
      }
    }
  }

  private async fetchSystemSettings(fasset: FAssetType, updatedAt: number): Promise<Record<string, unknown>> {
    const assetManagerAddress = this.context.fAssetTypeToAssetManagerAddress(fasset)
    const assetManager = this.context.getAssetManagerContract(assetManagerAddress)
    const [
      s,
      redemptionPaymentExtensionSeconds, minimumRedeemAmountUBA, redeemWithTagSupported,
      mintingTagManager, smartAccountManager, wNat,
      directMintingDailyLimitUBA, directMintingHourlyLimitUBA,
      directMintingLargeMintingThresholdUBA, directMintingLargeMintingDelaySeconds,
      directMintingFeeBIPS, directMintingMinimumFeeUBA, directMintingExecutorFeeUBA,
      directMintingFeeReceiver, directMintingOthersCanExecuteAfterSeconds,
      directMintingsUnblockUntilTimestamp, directMintingPaymentAddress
    ] = await Promise.all([
      assetManager.getSettings(),
      assetManager.redemptionPaymentExtensionSeconds(),
      assetManager.minimumRedeemAmountUBA(),
      assetManager.redeemWithTagSupported(),
      assetManager.getMintingTagManager(),
      assetManager.getSmartAccountManager(),
      assetManager.getWNat(),
      assetManager.getDirectMintingDailyLimitUBA(),
      assetManager.getDirectMintingHourlyLimitUBA(),
      assetManager.getDirectMintingLargeMintingThresholdUBA(),
      assetManager.getDirectMintingLargeMintingDelaySeconds(),
      assetManager.getDirectMintingFeeBIPS(),
      assetManager.getDirectMintingMinimumFeeUBA(),
      assetManager.getDirectMintingExecutorFeeUBA(),
      assetManager.getDirectMintingFeeReceiver(),
      assetManager.getDirectMintingOthersCanExecuteAfterSeconds(),
      assetManager.getDirectMintingsUnblockUntilTimestamp(),
      assetManager.directMintingPaymentAddress()
    ])
    const row: Record<string, unknown> = {
      fasset,
      updatedAt,
      lotSizeAMG: s.lotSizeAMG,
      mintingCapAMG: s.mintingCapAMG,
      mintingPoolHoldingsRequiredBIPS: s.mintingPoolHoldingsRequiredBIPS,
      collateralReservationFeeBIPS: s.collateralReservationFeeBIPS,
      underlyingBlocksForPayment: s.underlyingBlocksForPayment,
      underlyingSecondsForPayment: s.underlyingSecondsForPayment,
      redemptionFeeBIPS: s.redemptionFeeBIPS,
      redemptionDefaultFactorVaultCollateralBIPS: s.redemptionDefaultFactorVaultCollateralBIPS,
      confirmationByOthersAfterSeconds: s.confirmationByOthersAfterSeconds,
      confirmationByOthersRewardUSD5: s.confirmationByOthersRewardUSD5,
      maxRedeemedTickets: s.maxRedeemedTickets,
      paymentChallengeRewardBIPS: s.paymentChallengeRewardBIPS,
      paymentChallengeRewardUSD5: s.paymentChallengeRewardUSD5,
      withdrawalWaitMinSeconds: s.withdrawalWaitMinSeconds,
      maxTrustedPriceAgeSeconds: s.maxTrustedPriceAgeSeconds,
      vaultCollateralBuyForFlareFactorBIPS: s.vaultCollateralBuyForFlareFactorBIPS,
      attestationWindowSeconds: s.attestationWindowSeconds,
      minUpdateRepeatTimeSeconds: s.minUpdateRepeatTimeSeconds,
      agentExitAvailableTimelockSeconds: s.agentExitAvailableTimelockSeconds,
      agentFeeChangeTimelockSeconds: s.agentFeeChangeTimelockSeconds,
      agentMintingCRChangeTimelockSeconds: s.agentMintingCRChangeTimelockSeconds,
      poolExitCRChangeTimelockSeconds: s.poolExitCRChangeTimelockSeconds,
      agentTimelockedOperationWindowSeconds: s.agentTimelockedOperationWindowSeconds,
      collateralPoolTokenTimelockSeconds: s.collateralPoolTokenTimelockSeconds,
      liquidationStepSeconds: s.liquidationStepSeconds,
      liquidationCollateralFactorBIPS: s.liquidationCollateralFactorBIPS.map(String).join(','),
      liquidationFactorVaultCollateralBIPS: s.liquidationFactorVaultCollateralBIPS.map(String).join(','),
      diamondCutMinTimelockSeconds: s.diamondCutMinTimelockSeconds,
      maxEmergencyPauseDurationSeconds: s.maxEmergencyPauseDurationSeconds,
      emergencyPauseDurationResetAfterSeconds: s.emergencyPauseDurationResetAfterSeconds,
      redemptionPaymentExtensionSeconds,
      minimumRedeemAmountUBA,
      redeemWithTagSupported,
      mintingTagManager,
      smartAccountManager,
      wNat,
      directMintingDailyLimitUBA,
      directMintingHourlyLimitUBA,
      directMintingLargeMintingThresholdUBA,
      directMintingLargeMintingDelaySeconds,
      directMintingFeeBIPS,
      directMintingMinimumFeeUBA,
      directMintingExecutorFeeUBA,
      directMintingFeeReceiver,
      directMintingOthersCanExecuteAfterSeconds,
      directMintingsUnblockUntilTimestamp,
      directMintingPaymentAddress
    }
    // Core-vault parameters live on the asset manager too — pull them when the
    // asset manager has a core vault wired up. getCoreVaultManager() returns the
    // zero address when no core vault is configured.
    try {
      const coreVaultManagerAddr = await assetManager.getCoreVaultManager()
      if (coreVaultManagerAddr !== '0x0000000000000000000000000000000000000000') {
        const [nativeAddr, minLeftBIPS, minRedeemLots, redemptionFeeBIPS, transferDefaultPenaltyBIPS, transferTimeExtensionSeconds, donationTag] = await Promise.all([
          assetManager.getCoreVaultNativeAddress(),
          assetManager.getCoreVaultMinimumAmountLeftBIPS(),
          assetManager.getCoreVaultMinimumRedeemLots(),
          assetManager.getCoreVaultRedemptionFeeBIPS(),
          assetManager.getCoreVaultTransferDefaultPenaltyBIPS(),
          assetManager.getCoreVaultTransferTimeExtensionSeconds(),
          assetManager.getCoreVaultDonationTag()
        ])
        row.coreVaultManager = coreVaultManagerAddr
        row.coreVaultNativeAddress = nativeAddr
        row.coreVaultMinimumAmountLeftBIPS = minLeftBIPS
        row.coreVaultMinimumRedeemLots = minRedeemLots
        row.coreVaultRedemptionFeeBIPS = redemptionFeeBIPS
        row.coreVaultTransferDefaultPenaltyBIPS = transferDefaultPenaltyBIPS
        row.coreVaultTransferTimeExtensionSeconds = transferTimeExtensionSeconds
        row.coreVaultDonationTag = donationTag
        const coreVaultManager = this.context.getCoreVaultManagerContract(coreVaultManagerAddr)
        const cvSettings = await coreVaultManager.getSettings()
        row.coreVaultEscrowAmount = cvSettings._escrowAmount
        row.coreVaultMinimalAmount = cvSettings._minimalAmount
        row.coreVaultEscrowEndTimeSeconds = Number(cvSettings._escrowEndTimeSeconds)
        row.coreVaultChainPaymentFee = cvSettings._fee
      }
    } catch (e) {
      logger.error(`error fetching core vault settings for ${FAssetType[fasset]}: ${e}`)
    }
    return row
  }

}
