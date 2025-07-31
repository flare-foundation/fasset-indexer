import * as Entities from '../../orm/entities'
import { findOrCreateEntity } from "../../orm/utils"
import { isUntrackedAgentVault } from "../utils"
import { ContractLookup } from "../../context/lookup"
import { CollateralPoolEventMigration } from "./migrations/collateral-pool-migrations"
import { AssetManagerEventMigration } from "./migrations/asset-manager-migration"
import { EVENTS } from '../../config/constants'
import type { EntityManager } from "@mikro-orm/knex"
import type { ORM } from "../../orm/interface"
import type { Event } from "./event-scraper"
import type * as AssetManager from "../../../chain/typechain/IAssetManager"
import type * as CollateralPool from "../../../chain/typechain/ICollateralPool"
import type * as CollateralPoolPreUpgrade  from "../../../chain/typechain/ICollateralPoolPreUpgrade"
import type * as CoreVaultManager from "../../../chain/typechain/ICoreVaultManager"
import type * as ERC20 from "../../../chain/typechain/IERC20"
import type * as PriceChangeEmitter from "../../../chain/typechain/IPriceChangeEmitter"


export class EventStorer {
  oldCollateralTypeAddedTopic: string
  oldAgentVaultCreatedTopic: string

  constructor(readonly orm: ORM, public readonly lookup: ContractLookup) {
    const oldIface = this.lookup.interfaces.assetManagerInterface[0]
    this.oldCollateralTypeAddedTopic = this.lookup.getEventTopic(EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED, [oldIface])
    this.oldAgentVaultCreatedTopic = this.lookup.getEventTopic(EVENTS.ASSET_MANAGER.AGENT_VAULT_CREATED, [oldIface])
  }

  async processEvent(log: Event): Promise<void> {
    await this.orm.em.fork().transactional(async (em) => {
      await this.processEventUnsafe(em, log)
    })
  }

  async processEventUnsafe(em: EntityManager, log: Event): Promise<void> {
    if (!await this.logExists(em, log)) {
      const evmLog = await this.createLogEntity(em, log)
      const processed = await this._processEvent(em, log, evmLog)
      if (processed) em.persist(evmLog)
    }
  }

  protected async _processEvent(em: EntityManager, log: Event, evmLog: Entities.EvmLog): Promise<boolean> {
    switch (log.name) {
      case EVENTS.ASSET_MANAGER.CONTRACT_CHANGED: {
        await this.onAssetManagerContractChanged(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.SETTING_CHANGED: {
        await this.onAssetManagerSettingChanged(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.COLLATERAL_RATIOS_CHANGED: {
        await this.onCollateralRatiosChanged(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED: {
        if (log.topic == this.oldCollateralTypeAddedTopic) {
          log.args = AssetManagerEventMigration.migrateCollateralTypeAdded(log.args)
        }
        await this.onCollateralTypeAdded(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_VAULT_CREATED: {
        if (log.topic === this.oldAgentVaultCreatedTopic) {
          log.args = AssetManagerEventMigration.migrateAgentVaultCreated(log.args)
        }
        await this.onAgentVaultCreated(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_VAULT_DESTROYED: {
        await this.onAgentVaultDestroyed(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_SETTING_CHANGED: {
        await this.onAgentSettingChanged(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_DESTROYED: {
        await this.onAgentDestroyed(em, log.args as AssetManager.AgentDestroyedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.VAULT_COLLATERAL_WITHDRAWAL_ANNOUNCED: {
        await this.onVaultCollateralWithdrawalAnnounced(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.POOL_TOKEN_REDEMPTION_ANNOUNCED: {
        await this.onPoolTokenRedemptionAnnounced(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_WITHDRAWAL_ANNOUNCED: {
        await this.onUnderlyingWithdrawalAnnounced(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_WITHDRAWAL_CONFIRMED: {
        await this.onUnderlyingWithdrawalConfirmed(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_WITHDRAWAL_CANCELLED: {
        await this.onUnderlyingWithdrawalCancelled(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_BALANCE_TOPPED_UP: {
        await this.onUnderlyingBalanceToppedUp(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_BALANCE_CHANGED: {
        await this.onUnderlyingBalanceChanged(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.DUST_CHANGED: {
        await this.onDustChanged(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.SELF_CLOSE: {
        await this.onSelfClose(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED: {
        await this.onCollateralReserved(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.MINTING_EXECUTED: {
        await this.onMintingExecuted(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.SELF_MINT: {
        await this.onSelfMint(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.MINTING_PAYMENT_DEFAULT: {
        await this.onMintingPaymentDefault(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.COLLATERAL_RESERVATION_DELETED: {
        await this.onCollateralReservationDeleted(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED: {
        await this.onRedemptionRequested(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PERFORMED: {
        await this.onRedemptionPerformed(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_DEFAULT: {
        await this.onRedemptionDefault(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_BLOCKED: {
        await this.onRedemptionPaymentBlocked(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_FAILED: {
        await this.onRedemptionPaymentFailed(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REJECTED: {
        await this.onRedemptionRejected(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_CREATED: {
        await this.onRedemptionTicketCreated(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_UPDATED: {
        await this.onRedemptionTicketUpdated(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_DELETED: {
        await this.onRedemptionTicketDeleted(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEEMED_IN_COLLATERAL: {
        await this.onRedeemedInCollateral(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REQUEST_INCOMPLETE: {
        await this.onRedemptionPaymentIncomplete(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_POOL_FEE_MINTED: {
        await this.onRedemptionPoolFeeMinted(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_STARTED: {
        await this.onLiquidationStarted(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_PERFORMED: {
        await this.onLiquidationPerformed(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.FULL_LIQUIDATION_STARTED: {
        await this.onFullLiquidationStarted(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_ENDED: {
        await this.onLiquidationEnded(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.ILLEGAL_PAYMENT_CONFIRMED: {
        await this.onIllegalPaymentConfirmed(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.DUPLICATE_PAYMENT_CONFIRMED: {
        await this.onDuplicatePaymentConfirmed(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_BALANCE_TOO_LOW: {
        await this.onUnderlyingBalanceTooLow(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.AVAILABLE_AGENT_EXITED: {
        await this.onAvailableAgentExited(em, log.args)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_ENTERED_AVAILABLE: {
        await this.onAgentEnteredAvailable(em, log.args)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_PING: {
        await this.onAgentPing(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_PING_RESPONSE: {
        await this.onAgentPingResponse(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.CURRENT_UNDERLYING_BLOCK_UPDATED: {
        await this.onCurrentUnderlyingBlockUpdated(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_STARTED: {
        await this.onTransferToCoreVaultStarted(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_SUCCESSFUL: {
        await this.onTransferToCoreVaultSuccessful(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_DEFAULTED: {
        await this.onTransferToCoreVaultDefaulted(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_REQUESTED: {
        await this.onReturnFromCoreVaultRequested(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CONFIRMED: {
        await this.onReturnFromCoreVaultConfirmed(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CANCELLED: {
        await this.onReturnFromCoreVaultCancelled(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.CORE_VAULT_REDEMPTION_REQUESTED: {
        await this.onCoreVaultRedemptionRequested(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.EMERGENCY_PAUSE_TRIGGERED: {
        await this.onEmergencyPauseTriggered(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.EMERGENCY_PAUSE_CANCELLED: {
        await this.onEmergencyPauseCancelled(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.EMERGENCY_PAUSE_TRANSFERS_TRIGGERED: {
        await this.onEmergencyPauseTransfersTriggered(em, evmLog, log.args)
        break
      } case EVENTS.ASSET_MANAGER.EMERGENCY_PAUSE_TRANSFERS_CANCELLED: {
        await this.onEmergencyPauseTransfersCancelled(em, evmLog, log.args)
        break
      } case EVENTS.COLLATERAL_POOL.ENTER: {
        const oldEnt = await this.onCollateralPoolEntered(em, evmLog, log.args)
        CollateralPoolEventMigration.migrateCollateralPoolEntered(em, oldEnt)
        break
      } case EVENTS.COLLATERAL_POOL.EXIT: {
        const oldEnt = await this.onCollateralPoolExited(em, evmLog, log.args)
        CollateralPoolEventMigration.migrateCollateralPoolExited(em, oldEnt)
        break
      } case EVENTS.COLLATERAL_POOL.PAID_OUT: {
        const oldEnt = await this.onCollateralPoolPaidOut(em, evmLog, log.args)
        CollateralPoolEventMigration.migrateCollateralPoolPaidOut(em, oldEnt)
        break
      } case EVENTS.COLLATERAL_POOL.CLAIMED_REWARD: {
        const oldEnt = await this.onCollateralPoolClaimedReward(em, evmLog, log.args)
        CollateralPoolEventMigration.migrateCollateralPoolClaimedReward(em, oldEnt)
        break
      } case EVENTS.COLLATERAL_POOL.CP_CLAIMED_REWARD: {
        await this.onCpClaimedReward(em, evmLog, log.args)
        break
      } case EVENTS.COLLATERAL_POOL.CP_ENTERED: {
        await this.onCpEntered(em, evmLog, log.args)
        break
      } case EVENTS.COLLATERAL_POOL.CP_EXITED: {
        await this.onCpExited(em, evmLog, log.args)
        break
      } case EVENTS.COLLATERAL_POOL.CP_FEES_WITHDRAWN: {
        await this.onCpFeesWithdrawn(em, evmLog, log.args)
        break
      } case EVENTS.COLLATERAL_POOL.CP_FEE_DEBT_CHANGED: {
        await this.onCpFeeDebtChanged(em, evmLog, log.args)
        break
      } case EVENTS.COLLATERAL_POOL.CP_FEE_DEBT_PAID: {
        await this.onCpFeeDebtPaid(em, evmLog, log.args)
        break
      } case EVENTS.COLLATERAL_POOL.CP_PAID_OUT: {
        await this.onCpPaidOut(em, evmLog, log.args)
        break
      } case EVENTS.COLLATERAL_POOL.CP_SELF_CLOSE_EXITED: {
        await this.onCpSelfCloseExited(em, evmLog, log.args)
        break
      } case EVENTS.ERC20.TRANSFER: {
        await this.onERC20Transfer(em, evmLog, log.args)
        break
      } case EVENTS.PRICE_READER.PRICES_PUBLISHED: {
        await this.onPublishedPrices(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.CUSTODIAN_ADDRESS_UPDATED: {
        await this.onCustodianAddressUpdated(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.ESCROW_FINISHED: {
        await this.onEscrowFinished(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.ESCROW_INSTRUCTIONS: {
        await this.onEscrowInstructions(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.NOT_ALL_ESCROWS_PROCESSED: {
        await this.onNotAllEscrowsProcessed(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.PAYMENT_CONFIRMED: {
        await this.onPaymentConfirmed(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.PAYMENT_INSTRUCTIONS: {
        await this.onPaymentInstructions(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.TRANSFER_REQUESTED: {
        await this.onTransferRequested(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.TRANSFER_REQUEST_CANCELED: {
        await this.onTransferRequestCanceled(em, evmLog, log.args)
        break
      } case EVENTS.CORE_VAULT_MANAGER.SETTINGS_UPDATED: {
        await this.onCoreVaultManagerSettingsUpdated(em, evmLog, log.args)
        break
      } default: {
        return false
      }
    }
    return true
  }

  protected async logExists(em: EntityManager, log: Event): Promise<boolean> {
    const { blockNumber, logIndex } = log
    const evmLog = await em.findOne(Entities.EvmLog, { index: logIndex, block: { index: blockNumber }})
    return evmLog !== null
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // settings

  protected async onAssetManagerContractChanged(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.ContractChangedEvent.OutputTuple
  ): Promise<Entities.ContractChanged> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ name, value ] = logArgs
    const _value = await findOrCreateEntity(em, Entities.EvmAddress, { hex: value })
    return em.create(Entities.ContractChanged, { evmLog, fasset, name, value: _value })
  }

  protected async onAssetManagerSettingChanged(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.SettingChangedEvent.OutputTuple
  ): Promise<Entities.AssetManagerSettings> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const settings = await em.findOneOrFail(Entities.AssetManagerSettings, { fasset })
    const [ name, value ] = logArgs
    switch (name) {
      case 'lotSizeAMG': {
        settings.lotSizeAmg = value
        break
      } default: {
        break
      }
    }
    return settings
  }

  protected async onCollateralRatiosChanged(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.CollateralRatiosChangedEvent.OutputTuple
  ): Promise<Entities.CollateralRatiosChanged> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ collateralClass, collateralToken, minCollateralRatioBIPS, safetyMinCollateralRatioBIPS ] = logArgs
    const address = await findOrCreateEntity(em, Entities.EvmAddress, { hex: collateralToken })
    const collateralType = await em.findOneOrFail(Entities.CollateralTypeAdded, { address, fasset })
    return em.create(Entities.CollateralRatiosChanged, {
      evmLog, fasset, collateralToken: collateralType, minCollateralRatioBIPS, safetyMinCollateralRatioBIPS
    })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // collateral types

  protected async onCollateralTypeAdded(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.CollateralTypeAddedEvent.OutputTuple
  ): Promise<Entities.CollateralTypeAdded> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ collateralClass, token, decimals, directPricePair, assetFtsoSymbol, tokenFtsoSymbol, ] = logArgs
    const address = await findOrCreateEntity(em, Entities.EvmAddress, { hex: token })
    return em.create(Entities.CollateralTypeAdded, {
      evmLog, fasset, collateralClass: Number(collateralClass), address, decimals: Number(decimals),
      directPricePair, assetFtsoSymbol, tokenFtsoSymbol
    })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // agent

  protected async onAgentVaultCreated(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.AgentVaultCreatedEvent.OutputTuple
  ): Promise<[ Entities.AgentVault, Entities.AgentVaultSettings, Entities.AgentVaultCreated]> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const { 0: owner, 1: agentVault } = logArgs
    const [ collateralPool, collateralPoolToken, underlyingAddress, vaultCollateralToken, poolWNatToken,
      feeBIPS, poolFeeShareBIPS, mintingVaultCollateralRatioBIPS, mintingPoolCollateralRatioBIPS,
      buyFAssetByAgentFactorBIPS, poolExitCollateralRatioBIPS, redemptionPoolFeeShareBIPS
    ] = (logArgs as any).creationData
    // addresses
    const _owner = await em.findOneOrFail(Entities.AgentOwner, { manager: { address: { hex: owner }}})
    const _address = await findOrCreateEntity(em, Entities.EvmAddress, { hex: agentVault })
    const _agentVaultUnderlying = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: underlyingAddress })
    const _collateralPool = await findOrCreateEntity(em, Entities.EvmAddress, { hex: collateralPool })
    const _collateralPoolToken = await findOrCreateEntity(em, Entities.EvmAddress, { hex: collateralPoolToken! })
    // create agent vault
    const _agentVault = em.create(Entities.AgentVault, {
      fasset, address: _address, underlyingAddress: _agentVaultUnderlying,
      collateralPool: _collateralPool, collateralPoolToken: _collateralPoolToken,
      owner: _owner, destroyed: false
    })
    const _collateralToken = await em.findOneOrFail(Entities.CollateralTypeAdded, { address: { hex: vaultCollateralToken }, fasset })
    const agentVaultSettings = em.create(Entities.AgentVaultSettings, {
      agentVault: _agentVault, collateralToken: _collateralToken, feeBIPS, poolFeeShareBIPS, mintingPoolCollateralRatioBIPS,
      mintingVaultCollateralRatioBIPS, buyFAssetByAgentFactorBIPS, poolExitCollateralRatioBIPS, redemptionPoolFeeShareBIPS
    })
    const agentVaultCreated = em.create(Entities.AgentVaultCreated, { evmLog, fasset, agentVault: _agentVault })
    return [_agentVault, agentVaultSettings, agentVaultCreated]
  }

  protected async onAgentVaultDestroyed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.AgentDestroyedEvent.OutputTuple
  ): Promise<Entities.AgentVaultDestroyed> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault } })
    return em.create(Entities.AgentVaultDestroyed, { evmLog, fasset, agentVault: _agentVault })
  }

  protected async onAgentSettingChanged(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.AgentSettingChangeAnnouncedEvent.OutputTuple
  ): Promise<[Entities.AgentVaultSettings, Entities.AgentSettingChanged]> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, name, value ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    const agentSettingChanged = em.create(Entities.AgentSettingChanged, { evmLog, fasset, agentVault: _agentVault, name, value })
    const agentSettings = await em.findOneOrFail(Entities.AgentVaultSettings, { agentVault: _agentVault })
    this.applyAgentSettingChange(agentSettings, name, value)
    return [agentSettings, agentSettingChanged]
  }

  protected async onAvailableAgentExited(
    em: EntityManager,
    logArgs: AssetManager.AvailableAgentExitAnnouncedEvent.OutputTuple
  ): Promise<void> {
    const [ agentVault ] = logArgs
    const isUntracked = await isUntrackedAgentVault(em, agentVault)
    if (isUntracked) return // untracked agents don't have agent vault info property
    const agentVaultEntity = await em.findOneOrFail(Entities.AgentVaultInfo, { agentVault: { address: { hex: agentVault }}})
    agentVaultEntity.publiclyAvailable = false
  }

  protected async onAgentEnteredAvailable(
    em: EntityManager,
    logArgs: AssetManager.AgentAvailableEvent.OutputTuple
  ): Promise<void> {
    const [ agentVault, ] = logArgs
    const isUntracked = await isUntrackedAgentVault(em, agentVault)
    if (isUntracked) return // untracked agents don't have agent vault info property
    const agentVaultEntity = await em.findOneOrFail(Entities.AgentVaultInfo, { agentVault: { address: { hex: agentVault }}})
    agentVaultEntity.publiclyAvailable = true
  }

  protected async onAgentDestroyed(
    em: EntityManager,
    logArgs: AssetManager.AgentDestroyedEvent.OutputTuple
  ): Promise<void> {
    const [ agentVault ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    const agentVaultInfo = await em.findOne(Entities.AgentVaultInfo, { agentVault: agentVaultEntity })
    if (agentVaultInfo) {
      em.remove(agentVaultInfo)
    }
    agentVaultEntity.destroyed = true
  }

  protected async onSelfClose(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.SelfCloseEvent.OutputTuple
  ): Promise<Entities.SelfClose> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, valueUBA ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.SelfClose, { evmLog, fasset, agentVault: _agentVault, valueUBA })
  }

  private applyAgentSettingChange(
    agentSettings: Entities.AgentVaultSettings,
    name: string,
    value: bigint
  ): void {
    switch (name) {
      case "feeBIPS": {
        agentSettings.feeBIPS = BigInt(value)
        break
      } case "poolFeeShareBIPS": {
        agentSettings.poolFeeShareBIPS = BigInt(value)
        break
      } case "mintingVaultCollateralRatioBIPS": {
        agentSettings.mintingVaultCollateralRatioBIPS = BigInt(value)
        break
      } case "mintingPoolCollateralRatioBIPS": {
        agentSettings.mintingPoolCollateralRatioBIPS = BigInt(value)
        break
      } case "buyFAssetByAgentFactorBIPS": {
        agentSettings.buyFAssetByAgentFactorBIPS = BigInt(value)
        break
      } case "poolExitCollateralRatioBIPS": {
        agentSettings.poolExitCollateralRatioBIPS = BigInt(value)
        break
      } case "redemptionPoolFeeShareBIPS": {
        agentSettings.redemptionPoolFeeShareBIPS = BigInt(value)
        break
      } default: {
        throw new Error(`agent has no setting ${name}`)
      }
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // mintings

  protected async onCollateralReserved(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.CollateralReservedEvent.OutputTuple
  ):
    Promise<Entities.CollateralReserved>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [
      agentVault, minter, collateralReservationId, valueUBA, feeUBA,
      firstUnderlyingBlock, lastUnderlyingBlock, lastUnderlyingTimestamp,
      paymentAddress, paymentReference, executor, executorFeeNatWei
    ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    const _minter = await findOrCreateEntity(em, Entities.EvmAddress, { hex: minter })
    const _paymentAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: paymentAddress })
    const _executor = await findOrCreateEntity(em, Entities.EvmAddress, { hex: executor })
    return em.create(Entities.CollateralReserved, {
      evmLog, fasset, collateralReservationId: Number(collateralReservationId), agentVault: _agentVault,
      minter: _minter, valueUBA, feeUBA,
      firstUnderlyingBlock: Number(firstUnderlyingBlock), lastUnderlyingBlock: Number(lastUnderlyingBlock),
      lastUnderlyingTimestamp: Number(lastUnderlyingTimestamp),  paymentAddress: _paymentAddress, paymentReference,
      executor: _executor, executorFeeNatWei
    })
  }

  protected async onMintingExecuted(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.MintingExecutedEvent.OutputTuple
  ): Promise<Entities.MintingExecuted> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ , collateralReservationId,,, poolFeeUBA ] = logArgs
    const collateralReserved = await em.findOneOrFail(Entities.CollateralReserved,
      { collateralReservationId: Number(collateralReservationId), fasset })
    return em.create(Entities.MintingExecuted, { evmLog, fasset, collateralReserved, poolFeeUBA })
  }

  protected async onMintingPaymentDefault(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.MintingPaymentDefaultEvent.OutputTuple
  ): Promise<Entities.MintingPaymentDefault> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, collateralReservationId, ] = logArgs
    const collateralReserved = await em.findOneOrFail(Entities.CollateralReserved,
      { collateralReservationId: Number(collateralReservationId), fasset })
    return em.create(Entities.MintingPaymentDefault, { evmLog, fasset, collateralReserved })
  }

  protected async onCollateralReservationDeleted(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.CollateralReservationDeletedEvent.OutputTuple
  ): Promise<Entities.CollateralReservationDeleted> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, collateralReservationId, ] = logArgs
    const collateralReserved = await em.findOneOrFail(Entities.CollateralReserved,
      { collateralReservationId: Number(collateralReservationId), fasset })
    return em.create(Entities.CollateralReservationDeleted, { evmLog, fasset, collateralReserved })
  }

  protected async onSelfMint(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.SelfMintEvent.OutputTuple
  ): Promise<Entities.SelfMint> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, mintFromFreeUnderlying, mintedAmountUBA, depositedAmountUBA, poolFeeUBA ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.SelfMint, {
      evmLog, fasset, agentVault: _agentVault, mintFromFreeUnderlying,
       mintedUBA: mintedAmountUBA, depositedUBA: depositedAmountUBA, poolFeeUBA
    })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // redemptions

  protected async onRedemptionRequested(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionRequestedEvent.OutputTuple
  ): Promise<Entities.RedemptionRequested> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [
      agentVault, redeemer, requestId, paymentAddress, valueUBA, feeUBA,
      firstUnderlyingBlock, lastUnderlyingBlock, lastUnderlyingTimestamp,
      paymentReference, executor, executorFeeNatWei
    ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    const _redeemer = await findOrCreateEntity(em, Entities.EvmAddress, { hex: redeemer })
    const _paymentAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: paymentAddress })
    const _executor = await findOrCreateEntity(em, Entities.EvmAddress, { hex: executor })
    return em.create(Entities.RedemptionRequested, {
      evmLog, fasset, agentVault: _agentVault, redeemer: _redeemer, requestId: Number(requestId),
      paymentAddress: _paymentAddress, valueUBA, feeUBA,
      firstUnderlyingBlock: Number(firstUnderlyingBlock), lastUnderlyingBlock: Number(lastUnderlyingBlock),
      lastUnderlyingTimestamp: Number(lastUnderlyingTimestamp), paymentReference, executor: _executor, executorFeeNatWei
    })
  }

  protected async onRedemptionPerformed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionPerformedEvent.OutputTuple
  ): Promise<Entities.RedemptionPerformed> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId, transactionHash,, spentUnderlyingUBA ] = logArgs
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested, { requestId: Number(requestId), fasset })
    return em.create(Entities.RedemptionPerformed, { evmLog, fasset, redemptionRequested, transactionHash, spentUnderlyingUBA })
  }

  protected async onRedemptionDefault(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionDefaultEvent.OutputTuple
  ): Promise<Entities.RedemptionDefault> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId,, redeemedVaultCollateralWei, redeemedPoolCollateralWei ] = logArgs
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested,
      { requestId: Number(requestId), fasset })
    return em.create(Entities.RedemptionDefault, {
      evmLog, fasset, redemptionRequested, redeemedVaultCollateralWei, redeemedPoolCollateralWei
    })
  }

  protected async onRedemptionPaymentBlocked(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionPaymentBlockedEvent.OutputTuple
  ):
    Promise<Entities.RedemptionPaymentBlocked>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId, transactionHash,, spentUnderlyingUBA ] = logArgs
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested,
      { requestId: Number(requestId), fasset })
    return em.create(Entities.RedemptionPaymentBlocked, {
      evmLog, fasset, redemptionRequested, transactionHash, spentUnderlyingUBA
    })
  }

  protected async onRedemptionPaymentFailed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionPaymentFailedEvent.OutputTuple
  ): Promise<Entities.RedemptionPaymentFailed> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId, transactionHash, spentUnderlyingUBA, failureReason ] = logArgs
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested,
      { requestId: Number(requestId), fasset })
    return em.create(Entities.RedemptionPaymentFailed, {
      evmLog, fasset, redemptionRequested, transactionHash, spentUnderlyingUBA, failureReason
    })
  }

  protected async onRedemptionRejected(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionRejectedEvent.OutputTuple
  ): Promise<Entities.RedemptionRejected> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId, ] = logArgs
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested,
      { requestId: Number(requestId), fasset })
    return em.create(Entities.RedemptionRejected, { evmLog, fasset, redemptionRequested })
  }

  protected async onRedeemedInCollateral(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedeemedInCollateralEvent.OutputTuple
  ): Promise<Entities.RedeemedInCollateral> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, redeemer, redemptionAmountUBA, paidVaultCollateralWei ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    const _redeemer = await findOrCreateEntity(em, Entities.EvmAddress, { hex: redeemer })
    return em.create(Entities.RedeemedInCollateral, {
      evmLog, fasset, agentVault: _agentVault, redeemer: _redeemer, redemptionAmountUBA, paidVaultCollateralWei
    })
  }

  protected async onRedemptionTicketCreated(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionTicketCreatedEvent.OutputTuple
  ): Promise<[Entities.RedemptionTicketCreated, Entities.RedemptionTicket]> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, redemptionTicketId, ticketValueUBA ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    const redemptionTicketCreated = em.create(Entities.RedemptionTicketCreated, {
      evmLog, fasset, agentVault: _agentVault, redemptionTicketId, ticketValueUBA
    })
    const redemptionTicket = em.create(Entities.RedemptionTicket,
      { redemptionTicketCreated, ticketValueUBA, destroyed: false })
    return [redemptionTicketCreated, redemptionTicket]
  }

  protected async onRedemptionTicketUpdated(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionTicketCreatedEvent.OutputTuple
  ): Promise<[Entities.RedemptionTicketUpdated, Entities.RedemptionTicket]> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ , redemptionTicketId, ticketValueUBA ] = logArgs
    const redemptionTicketCreated = await em.findOneOrFail(Entities.RedemptionTicketCreated, { redemptionTicketId, fasset })
    const redemptionTicketUpdated = em.create(Entities.RedemptionTicketUpdated, { evmLog, fasset, redemptionTicketCreated, ticketValueUBA })
    const redemptionTicket = await em.findOneOrFail(Entities.RedemptionTicket, { redemptionTicketCreated })
    redemptionTicket.ticketValueUBA = ticketValueUBA
    return [redemptionTicketUpdated, redemptionTicket]
  }

  protected async onRedemptionTicketDeleted(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionTicketDeletedEvent.OutputTuple
  ): Promise<[Entities.RedemptionTicketDeleted, Entities.RedemptionTicket]> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ , redemptionTicketId ] = logArgs
    const redemptionTicketCreated = await em.findOneOrFail(Entities.RedemptionTicketCreated, { redemptionTicketId, fasset })
    const redemptionTicketDeleted = em.create(Entities.RedemptionTicketDeleted, { evmLog, fasset, redemptionTicketCreated })
    const redemptionTicket = await em.findOneOrFail(Entities.RedemptionTicket, { redemptionTicketCreated })
    redemptionTicket.ticketValueUBA = BigInt(0)
    redemptionTicket.destroyed = true
    return [redemptionTicketDeleted, redemptionTicket]
  }

  protected async onRedemptionPaymentIncomplete(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionRequestIncompleteEvent.OutputTuple
  ): Promise<Entities.RedemptionRequestIncomplete>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ redeemer, remainingLots ] = logArgs
    const _redeemer = await findOrCreateEntity(em, Entities.EvmAddress, { hex: redeemer })
    return em.create(Entities.RedemptionRequestIncomplete, { evmLog, fasset, redeemer: _redeemer, remainingLots })
  }

  protected async onRedemptionPoolFeeMinted(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.RedemptionPoolFeeMintedEvent.OutputTuple
  ): Promise<Entities.RedemptionPoolFeeMintedEvent>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, requestId, poolFeeUBA ] = logArgs
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested, { fasset, requestId: Number(requestId) })
    return em.create(Entities.RedemptionPoolFeeMintedEvent, { evmLog, fasset, redemptionRequested, poolFeeUBA })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // liquidations

  protected async onLiquidationStarted(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.LiquidationStartedEvent.OutputTuple
  ): Promise<Entities.LiquidationStarted> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, timestamp ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.LiquidationStarted, {
      evmLog, fasset, agentVault: _agentVault, timestamp: Number(timestamp)
    })
  }

  protected async onFullLiquidationStarted(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.FullLiquidationStartedEvent.OutputTuple
  ): Promise<Entities.FullLiquidationStarted> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, timestamp ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.FullLiquidationStarted,
      { evmLog, fasset, agentVault: _agentVault, timestamp: Number(timestamp) })
  }

  protected async onLiquidationPerformed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.LiquidationPerformedEvent.OutputTuple
  ): Promise<Entities.LiquidationPerformed> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, liquidator, valueUBA, paidVaultCollateralWei, paidPoolCollateralWei ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    const _liquidator = await findOrCreateEntity(em, Entities.EvmAddress, { hex: liquidator })
    return em.create(Entities.LiquidationPerformed, {
      evmLog, fasset, agentVault: _agentVault, liquidator: _liquidator,
      valueUBA, paidVaultCollateralWei, paidPoolCollateralWei
    })
  }

  protected async onLiquidationEnded(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.LiquidationEndedEvent.OutputTuple
  ): Promise<Entities.LiquidationEnded> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.LiquidationEnded, { evmLog, fasset, agentVault: _agentVault })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // challenges

  protected async onIllegalPaymentConfirmed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.IllegalPaymentConfirmedEvent.OutputTuple
  ): Promise<Entities.IllegalPaymentConfirmed> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transactionHash ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.IllegalPaymentConfirmed, {
      evmLog, fasset, agentVault: _agentVault, transactionHash
    })
  }

  protected async onDuplicatePaymentConfirmed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.DuplicatePaymentConfirmedEvent.OutputTuple
  ): Promise<Entities.DuplicatePaymentConfirmed> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transactionHash1, transactionHash2 ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.DuplicatePaymentConfirmed, {
      evmLog, fasset, agentVault: _agentVault, transactionHash1, transactionHash2
    })
  }

  protected async onUnderlyingBalanceTooLow(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.UnderlyingBalanceTooLowEvent.OutputTuple
  ): Promise<Entities.UnderlyingBalanceTooLow> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, balance, requiredBalance ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.UnderlyingBalanceTooLow, {
      evmLog, fasset, agentVault: _agentVault, balance, requiredBalance
    })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // (DEPRECTED) collateral pool

  protected async onCollateralPoolEntered(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPoolPreUpgrade.EnteredEvent.OutputTuple
  ): Promise<Entities.CollateralPoolEntered> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, amountNatWei, receivedTokensWei, addedFAssetFeeUBA, newFAssetFeeDebt, timelockExpiresAt ] = logArgs
    const _holder = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenHolder })
    return em.create(Entities.CollateralPoolEntered, {
      evmLog, fasset: agentVault.fasset, tokenHolder: _holder, amountNatWei, receivedTokensWei,
      addedFAssetFeeUBA, newFAssetFeeDebt, timelockExpiresAt: Number(timelockExpiresAt)
    }, { persist: false })
  }

  protected async onCollateralPoolExited(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPoolPreUpgrade.ExitedEvent.OutputTuple
  ): Promise<Entities.CollateralPoolExited> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, burnedTokensWei, receivedNatWei, receivedFAssetFeesUBA, closedFAssetsUBA, newFAssetFeeDebt ] = logArgs
    const _holder = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenHolder })
    return em.create(Entities.CollateralPoolExited, {
      evmLog, fasset: agentVault.fasset, tokenHolder: _holder, burnedTokensWei, receivedNatWei,
      receivedFAssetFeesUBA, closedFAssetsUBA, newFAssetFeeDebt
    }, { persist: false })
  }

  protected async onCollateralPoolPaidOut(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPoolPreUpgrade.PaidOutEvent.OutputTuple
  ): Promise<Entities.CollateralPoolPaidOut> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ recipient, paidNatWei, burnedTokensWei ] = logArgs
    const _recipient = await findOrCreateEntity(em, Entities.EvmAddress, { hex: recipient })
    return em.create(Entities.CollateralPoolPaidOut, {
      evmLog, fasset: agentVault.fasset, recipient: _recipient, paidNatWei, burnedTokensWei
    }, { persist: false })
  }

  protected async onCollateralPoolClaimedReward(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPoolPreUpgrade.ClaimedRewardEvent.OutputTuple
  ): Promise<Entities.CollateralPoolClaimedReward> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ amountNatWei, rewardType ] = logArgs
    return em.create(Entities.CollateralPoolClaimedReward, {
      evmLog, fasset: agentVault.fasset, amountNatWei,rewardType: Number(rewardType)
    }, { persist: false })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // (DEPRECTED) collateral pool

  protected async onCpClaimedReward(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPool.CPClaimedRewardEvent.OutputTuple
  ):
    Promise<Entities.CPClaimedReward>
  {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ amountNatWei, rewardType ] = logArgs
    return em.create(Entities.CPClaimedReward, {
      evmLog, fasset: agentVault.fasset, amountNatWei, rewardType: Number(rewardType)
    })
  }

  protected async onCpEntered(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPool.CPEnteredEvent.OutputTuple
  ): Promise<Entities.CPEntered> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, amountNatWei, receivedTokensWei, timelockExpiresAt ] = logArgs
    const _holder = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenHolder })
    return em.create(Entities.CPEntered, {
      evmLog, fasset: agentVault.fasset, tokenHolder: _holder, amountNatWei, receivedTokensWei, timelockExpiresAt
    })
  }

  protected async onCpExited(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPool.CPExitedEvent.OutputTuple
  ): Promise<Entities.CPExited> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, burnedTokensWei, receivedNatWei ] = logArgs
    const _holder = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenHolder })
    return em.create(Entities.CPExited, {
      evmLog, fasset: agentVault.fasset, tokenHolder: _holder, burnedTokensWei, receivedNatWei
    })
  }

  protected async onCpFeesWithdrawn(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPool.CPFeesWithdrawnEvent.OutputTuple
  ): Promise<Entities.CPFeesWithdrawn> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, withdrawnFeesUBA ] = logArgs
    const _holder = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenHolder })
    return em.create(Entities.CPFeesWithdrawn, {
      evmLog, fasset: agentVault.fasset, tokenHolder: _holder, withdrawnFeesUBA
    })
  }

  protected async onCpFeeDebtChanged(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPool.CPFeeDebtChangedEvent.OutputTuple
  ):  Promise<Entities.CPFeeDebtChanged> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, newFeeDebtUBA ] = logArgs
    const _holder = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenHolder })
    return em.create(Entities.CPFeeDebtChanged, {
      evmLog, fasset: agentVault.fasset, tokenHolder: _holder, newFeeDebtUBA
    })
  }

  protected async onCpFeeDebtPaid(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPool.CPFeeDebtPaidEvent.OutputTuple
  ):
    Promise<Entities.CPFeeDebtPaid>
  {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, paidFeesUBA ] = logArgs
    const _holder = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenHolder })
    return em.create(Entities.CPFeeDebtPaid, { evmLog, fasset: agentVault.fasset, tokenHolder: _holder, paidFeesUBA })
  }

  protected async onCpPaidOut(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPool.CPPaidOutEvent.OutputTuple
  ): Promise<Entities.CPPaidOut> {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ recipient, paidNatWei, burnedTokensWei ] = logArgs
    const _recipient = await findOrCreateEntity(em, Entities.EvmAddress, { hex: recipient })
    return em.create(Entities.CPPaidOut, {
      evmLog, fasset: agentVault.fasset, recipient: _recipient, paidNatWei, burnedTokensWei
    })
  }

  protected async onCpSelfCloseExited(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CollateralPool.CPSelfCloseExitedEvent.OutputTuple
  ): Promise<Entities.CPSelfCloseExited>
  {
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, burnedTokensWei, receivedNatWei, closedFAssetsUBA ] = logArgs
    const _holder = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenHolder })
    return em.create(Entities.CPSelfCloseExited, {
      evmLog, fasset: agentVault.fasset, tokenHolder: _holder, burnedTokensWei, receivedNatWei, closedFAssetsUBA
    })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // erc20 (fasset, collateral, wnat tokens)

  protected async onERC20Transfer(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: ERC20.TransferEvent.OutputTuple
  ): Promise<Entities.ERC20Transfer> {
    const [ from, to, value ] = logArgs
    const _from = await findOrCreateEntity(em, Entities.EvmAddress, { hex: from })
    const _to = await findOrCreateEntity(em, Entities.EvmAddress, { hex: to })
    await this.increaseTokenBalance(em, evmLog.address, _to, value)
    await this.increaseTokenBalance(em, evmLog.address, _from, -value)
    return em.create(Entities.ERC20Transfer, { evmLog, from: _from, to: _to, value })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // agent announcements

  protected async onVaultCollateralWithdrawalAnnounced(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.VaultCollateralWithdrawalAnnouncedEvent.OutputTuple
  ): Promise<Entities.VaultCollateralWithdrawalAnnounced> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, amountWei, withdrawalAllowedAt ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.VaultCollateralWithdrawalAnnounced, {
      evmLog, fasset, agentVault: _agentVault, amountWei, allowedAt: withdrawalAllowedAt
    })
  }

  protected async onPoolTokenRedemptionAnnounced(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.PoolTokenRedemptionAnnouncedEvent.OutputTuple
  ): Promise<Entities.PoolTokenRedemptionAnnounced> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, amountWei, withdrawalAllowedAt ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.PoolTokenRedemptionAnnounced, {
      evmLog, fasset, agentVault: _agentVault, amountWei, allowedAt: withdrawalAllowedAt })
  }

  protected async onUnderlyingWithdrawalAnnounced(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.UnderlyingWithdrawalAnnouncedEvent.OutputTuple
  ): Promise<Entities.UnderlyingWithdrawalAnnounced> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, announcementId, paymentReference ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.UnderlyingWithdrawalAnnounced, {
      evmLog, fasset,agentVault: _agentVault, announcementId, paymentReference
    })
  }

  protected async onUnderlyingWithdrawalConfirmed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.UnderlyingWithdrawalConfirmedEvent.OutputTuple
  ): Promise<Entities.UnderlyingWithdrawalConfirmed> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ , announcementId, spentUBA, transactionHash ] = logArgs
    const underlyingWithdrawalAnnounced = await em.findOneOrFail(Entities.UnderlyingWithdrawalAnnounced,
      { announcementId , fasset })
    return em.create(Entities.UnderlyingWithdrawalConfirmed, {
      evmLog, fasset, underlyingWithdrawalAnnounced, spendUBA: spentUBA, transactionHash
    })
  }

  protected async onUnderlyingWithdrawalCancelled(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.UnderlyingWithdrawalCancelledEvent.OutputTuple
  ): Promise<Entities.UnderlyingWithdrawalCancelled> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, announcementId ] = logArgs
    const underlyingWithdrawalAnnounced = await em.findOneOrFail(Entities.UnderlyingWithdrawalAnnounced,
      { announcementId , fasset })
    return em.create(Entities.UnderlyingWithdrawalCancelled, { evmLog, fasset, underlyingWithdrawalAnnounced })
  }

  protected async onUnderlyingBalanceToppedUp(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.UnderlyingBalanceToppedUpEvent.OutputTuple
  ): Promise<Entities.UnderlyingBalanceToppedUp> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transactionHash, depositedUBA ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault } })
    return em.create(Entities.UnderlyingBalanceToppedUp, {
      evmLog, fasset, agentVault: _agentVault, transactionHash, depositedUBA
    })
  }

  protected async onUnderlyingBalanceChanged(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.UnderlyingBalanceChangedEvent.OutputTuple
  ): Promise<Entities.UnderlyingBalanceChanged> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, underlyingBalanceUBA ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault } })
    return em.create(Entities.UnderlyingBalanceChanged, {
      evmLog, fasset, agentVault: _agentVault, balanceUBA: underlyingBalanceUBA
    })
  }

  protected async onDustChanged(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.DustChangedEvent.OutputTuple
  ): Promise<Entities.DustChanged> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, dustUBA ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault } })
    return em.create(Entities.DustChanged, { evmLog, fasset, agentVault: _agentVault, dustUBA })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // agent ping

  protected async onAgentPing(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.AgentPingEvent.OutputTuple
  ): Promise<Entities.AgentPing> {
    const [ agentVault, sender, query ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    const _sender = await findOrCreateEntity(em, Entities.EvmAddress, { hex: sender })
    return em.create(Entities.AgentPing, {
      evmLog, fasset: _agentVault.fasset, agentVault: _agentVault, sender: _sender, query
    })
  }

  protected async onAgentPingResponse(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.AgentPingResponseEvent.OutputTuple
  ): Promise<Entities.AgentPingResponse> {
    const [ agentVault,, query, response ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.AgentPingResponse, {
      evmLog, fasset: _agentVault.fasset, agentVault: _agentVault, query, response
    })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // system

  protected async onCurrentUnderlyingBlockUpdated(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.CurrentUnderlyingBlockUpdatedEvent.OutputTuple
  ): Promise<Entities.CurrentUnderlyingBlockUpdated>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ underlyingBlockNumber, underlyingBlockTimestamp, updatedAt ] = logArgs
    return em.create(Entities.CurrentUnderlyingBlockUpdated, {
      evmLog, fasset, underlyingBlockNumber: Number(underlyingBlockNumber),
      underlyingBlockTimestamp: Number(underlyingBlockTimestamp), updatedAt: Number(updatedAt)
    })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // core vault

  protected async onTransferToCoreVaultStarted(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.TransferToCoreVaultStartedEvent.OutputTuple
  ): Promise<Entities.TransferToCoreVaultStarted> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transferRedemptionRequestId, valueUBA ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.TransferToCoreVaultStarted, {
      evmLog, fasset, agentVault: _agentVault, transferRedemptionRequestId: Number(transferRedemptionRequestId), valueUBA
    })
  }

  protected async onTransferToCoreVaultSuccessful(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.TransferToCoreVaultSuccessfulEvent.OutputTuple
  ): Promise<Entities.TransferToCoreVaultSuccessful> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transferRedemptionRequestId, valueUBA ] = logArgs
    const transferToCoreVaultStarted = await em.findOneOrFail(Entities.TransferToCoreVaultStarted,
      { transferRedemptionRequestId: Number(transferRedemptionRequestId), fasset })
    return em.create(Entities.TransferToCoreVaultSuccessful, { evmLog, fasset, transferToCoreVaultStarted, valueUBA })
  }

  protected async onTransferToCoreVaultDefaulted(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.TransferToCoreVaultDefaultedEvent.OutputTuple
  ): Promise<Entities.TransferToCoreVaultDefaulted> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transferRedemptionRequestId, remintedUBA ] = logArgs
    const transferToCoreVaultStarted = await em.findOneOrFail(Entities.TransferToCoreVaultStarted,
      { transferRedemptionRequestId: Number(transferRedemptionRequestId), fasset })
    return em.create(Entities.TransferToCoreVaultDefaulted, { evmLog, fasset, transferToCoreVaultStarted, remintedUBA })
  }

  protected async onReturnFromCoreVaultRequested(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.ReturnFromCoreVaultRequestedEvent.OutputTuple
  ): Promise<Entities.ReturnFromCoreVaultRequested> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, requestId, paymentReference, valueUBA ] = logArgs
    const _agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVault }})
    return em.create(Entities.ReturnFromCoreVaultRequested, {
      evmLog, fasset, agentVault: _agentVault, requestId: Number(requestId), paymentReference, valueUBA
    })
  }

  protected async onReturnFromCoreVaultConfirmed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.ReturnFromCoreVaultConfirmedEvent.OutputTuple
  ): Promise<Entities.ReturnFromCoreVaultConfirmed> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, requestId, receivedUnderlyingUBA, remintedUBA ] = logArgs
    const returnFromCoreVaultRequested = await em.findOneOrFail(Entities.ReturnFromCoreVaultRequested,
      { requestId: Number(requestId), fasset })
    return em.create(Entities.ReturnFromCoreVaultConfirmed, {
      evmLog, fasset, returnFromCoreVaultRequested, receivedUnderlyingUBA, remintedUBA
    })
  }

  protected async onReturnFromCoreVaultCancelled(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.ReturnFromCoreVaultCancelledEvent.OutputTuple
  ): Promise<Entities.ReturnFromCoreVaultCancelled> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, requestId ] = logArgs
    const returnFromCoreVaultRequested = await em.findOneOrFail(Entities.ReturnFromCoreVaultRequested,
      { requestId: Number(requestId), fasset })
    return em.create(Entities.ReturnFromCoreVaultCancelled, {
      evmLog, fasset, returnFromCoreVaultRequested
    })
  }

  protected async onCoreVaultRedemptionRequested(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.CoreVaultRedemptionRequestedEvent.OutputTuple
  ): Promise<Entities.CoreVaultRedemptionRequested> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ redeemer, paymentAddress, paymentReference, valueUBA, feeUBA ] = logArgs
    const _redeemer = await findOrCreateEntity(em, Entities.EvmAddress, { hex: redeemer })
    const _paymentAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: paymentAddress })
    return em.create(Entities.CoreVaultRedemptionRequested, {
      evmLog, fasset, redeemer: _redeemer, paymentAddress: _paymentAddress,
      paymentReference, valueUBA, feeUBA
    })
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  // emergency pause

  protected async onEmergencyPauseTriggered(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.EmergencyPauseTriggeredEvent.OutputTuple
  ): Promise<Entities.EmergencyPauseTriggered> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ pausedUntil ] = logArgs
    return em.create(Entities.EmergencyPauseTriggered, { evmLog, fasset, pausedUntil })
  }

  protected async onEmergencyPauseCancelled(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.EmergencyPauseCanceledEvent.OutputTuple
  ): Promise<Entities.EmergencyPauseCancelled> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    return em.create(Entities.EmergencyPauseCancelled, { evmLog, fasset })
  }

  protected async onEmergencyPauseTransfersTriggered(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.EmergencyPauseTransfersTriggeredEvent.OutputTuple
  ): Promise<Entities.EmergencyPauseTransfersTriggered> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ pausedUntil ] = logArgs
    return em.create(Entities.EmergencyPauseTransfersTriggered, { evmLog, fasset, pausedUntil })
  }

  protected async onEmergencyPauseTransfersCancelled(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: AssetManager.EmergencyPauseTransfersCanceledEvent.OutputTuple
  ): Promise<Entities.EmergencyPauseTransfersCancelled> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    return em.create(Entities.EmergencyPauseTransfersCancelled, { evmLog, fasset })
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  // core vault manager

  protected async onCoreVaultManagerSettingsUpdated(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.SettingsUpdatedEvent.OutputTuple
  ): Promise<[Entities.CoreVaultManagerSettings, Entities.CoreVaultManagerSettingsUpdated]> {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ escrowEndTimeSeconds, escrowAmount, minimalAmount, fee ] = logArgs
    const settings = await em.findOneOrFail(Entities.CoreVaultManagerSettings, { fasset })
    this.updateCoreVaultManagerSettings(settings, logArgs)
    const settingsUpdated = em.create(Entities.CoreVaultManagerSettingsUpdated, {
      evmLog, fasset, escrowEndTimeSeconds: Number(escrowEndTimeSeconds),
      escrowAmount, minimalAmount, fee
    })
    return [settings, settingsUpdated]
  }

  protected async onCustodianAddressUpdated(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.CustodianAddressUpdatedEvent.OutputTuple
  ): Promise<Entities.CoreVaultManagerCustodianAddressUpdated> {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ custodian ] = logArgs
    const custodianAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: custodian })
    return em.create(Entities.CoreVaultManagerCustodianAddressUpdated, {
      evmLog, fasset, custodian: custodianAddress
    })
  }

  protected async onEscrowFinished(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.EscrowFinishedEvent.OutputTuple
  ): Promise<Entities.EscrowFinished> {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ preimageHash, amount ] = logArgs
    return em.create(Entities.EscrowFinished, { evmLog, fasset, preimageHash, amount })
  }

  protected async onEscrowInstructions(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.EscrowInstructionsEvent.OutputTuple
  ): Promise<Entities.CoreVaultManagerEscrowInstructions> {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ sequence, preimageHash, account, destination, amount, fee, cancelAfterTs ] = logArgs
    const accountAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: account })
    const destinationAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: destination })
    return em.create(Entities.CoreVaultManagerEscrowInstructions, {
      evmLog, fasset, sequence, preimageHash, account: accountAddress,
      destination: destinationAddress, amount, fee, cancelAfterTs
    })
  }

  protected async onNotAllEscrowsProcessed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.NotAllEscrowsProcessedEvent.OutputTuple
  ): Promise<Entities.CoreVaultManagerNotAllEscrowsProcessed> {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    return em.create(Entities.CoreVaultManagerNotAllEscrowsProcessed, { evmLog, fasset })
  }

  protected async onPaymentConfirmed(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.PaymentConfirmedEvent.OutputTuple
  ): Promise<Entities.CoreVaultManagerPaymentConfirmed> {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ transactionId, paymentReference, amount ] = logArgs
    return em.create(Entities.CoreVaultManagerPaymentConfirmed, { evmLog, fasset, transactionId, paymentReference, amount })
  }

  protected async onPaymentInstructions(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.PaymentInstructionsEvent.OutputTuple
  ): Promise<Entities.CoreVaultManagerPaymentInstructions>
  {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ sequence, account, destination, amount, fee, paymentReference ] = logArgs
    const accountAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: account })
    const destinationAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: destination })
    return em.create(Entities.CoreVaultManagerPaymentInstructions, {
      evmLog, fasset, sequence, account: accountAddress,
      destination: destinationAddress, amount, fee, paymentReference
    })
  }

  protected async onTransferRequested(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.TransferRequestedEvent.OutputTuple
  ): Promise<Entities.CoreVaultManagerTransferRequested> {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ destination, paymentReference, amount, cancelable ] = logArgs
    const destinationAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: destination })
    return em.create(Entities.CoreVaultManagerTransferRequested, {
      evmLog, fasset, destination: destinationAddress, paymentReference, amount, cancelable
    } )
  }

  protected async onTransferRequestCanceled(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: CoreVaultManager.TransferRequestCanceledEvent.OutputTuple
  ): Promise<Entities.CoreVaultManagerTransferRequestCanceled> {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ destination, paymentReference, amount ] = logArgs
    const destinationAddress = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: destination })
    return em.create(Entities.CoreVaultManagerTransferRequestCanceled, {
      evmLog, fasset, paymentReference, destination: destinationAddress, amount
    })
  }

  protected updateCoreVaultManagerSettings(
    settings: Entities.CoreVaultManagerSettings,
    logArgs: CoreVaultManager.SettingsUpdatedEvent.OutputTuple
  ): Entities.CoreVaultManagerSettings {
    const [ escrowEndTimeSeconds, escrowAmount, minimalAmount, fee ] = logArgs
    settings.escrowEndTimeSeconds = Number(escrowEndTimeSeconds)
    settings.escrowAmount = escrowAmount
    settings.minimalAmount = minimalAmount
    settings.chainPaymentFee = fee
    return settings
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // price publisher

  protected async onPublishedPrices(
    em: EntityManager,
    evmLog: Entities.EvmLog,
    logArgs: PriceChangeEmitter.PricesPublishedEvent.OutputTuple
  ): Promise<Entities.PricesPublished> {
    const [ votingRoundId ] = logArgs
    return em.create(Entities.PricesPublished, { evmLog, votingRoundId: Number(votingRoundId) })
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // helpers

  private async createLogEntity(em: EntityManager, log: Event): Promise<Entities.EvmLog> {
    // do not persist anything here, only persist if the log was processed to not store unecessary data
    const transactionSource = await findOrCreateEntity(em, Entities.EvmAddress,
      { hex: log.transactionSource }, { persist: false })
    const transactionTarget = log.transactionTarget === null ? undefined
      : await findOrCreateEntity(em, Entities.EvmAddress, { hex: log.transactionTarget }, { persist: false })
    const block = await findOrCreateEntity(em, Entities.EvmBlock,
      { index: log.blockNumber }, { persist: false }, { timestamp: log.blockTimestamp })
    const transaction = await findOrCreateEntity(em, Entities.EvmTransaction,
      { hash: log.transactionHash }, { persist: false },
      { block, index: log.transactionIndex, source: transactionSource, target: transactionTarget }
    )
    const eventSource = await findOrCreateEntity(em, Entities.EvmAddress, { hex: log.source }, { persist: false })
    return em.create(Entities.EvmLog, { index: log.logIndex, name: log.name, address: eventSource, transaction, block },
      { persist: false })
  }

  private async increaseTokenBalance(
    em: EntityManager,
    token: Entities.EvmAddress,
    holder: Entities.EvmAddress,
    amount: bigint
  ): Promise<void> {
    const balance = await findOrCreateEntity(em, Entities.TokenBalance, { token, holder }, {}, { token, holder, amount })
    balance.amount = amount
  }
}