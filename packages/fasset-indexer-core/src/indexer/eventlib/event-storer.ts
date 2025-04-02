import { AddressType } from "../../orm/interface"
import { findOrCreateUnderlyingAddress } from "../../orm/utils"
import {
  isUntrackedAgentVault, findOrCreateEvmAddress,
  findOrCreateEvmBlock, findOrCreateEvmTransaction
} from "../utils"
import { EvmLog } from "../../orm/entities/evm/log"
import { CollateralTypeAdded, ERC20Transfer } from "../../orm/entities/events/token"
import { TokenBalance } from "../../orm/entities/state/balance"
import { RedemptionTicket } from "../../orm/entities/state/redemption-ticket"
import { EvmAddress } from "../../orm/entities/address"
import { AgentOwner, AgentVault } from "../../orm/entities/agent"
import {
  AgentVaultCreated,
  AgentSettingChanged,
  SelfClose,
  VaultCollateralWithdrawalAnnounced,
  PoolTokenRedemptionAnnounced,
  UnderlyingWithdrawalAnnounced,
  UnderlyingWithdrawalConfirmed
} from "../../orm/entities/events/agent"
import { AgentVaultInfo, AgentVaultSettings } from "../../orm/entities/state/agent"
import {
  CollateralReservationDeleted,
  CollateralReserved,
  MintingExecuted,
  MintingPaymentDefault,
  SelfMint
} from "../../orm/entities/events/minting"
import {
  RedemptionRequested,
  RedemptionPerformed,
  RedemptionDefault,
  RedemptionPaymentFailed,
  RedemptionPaymentBlocked,
  RedemptionRejected,
  RedemptionRequestIncomplete,
  RedeemedInCollateral
} from "../../orm/entities/events/redemption"
import {
  RedemptionTicketCreated,
  RedemptionTicketDeleted,
  RedemptionTicketUpdated
} from "../../orm/entities/events/redemption-ticket"
import {
  AgentInCCB,
  FullLiquidationStarted,
  LiquidationEnded,
  LiquidationPerformed,
  LiquidationStarted
} from "../../orm/entities/events/liquidation"
import {
  DuplicatePaymentConfirmed,
  IllegalPaymentConfirmed,
  UnderlyingBalanceTooLow
} from "../../orm/entities/events/challenge"
import {
  CoreVaultRedemptionRequested,
  ReturnFromCoreVaultCancelled,
  ReturnFromCoreVaultConfirmed,
  ReturnFromCoreVaultRequested,
  TransferToCoreVaultCancelled,
  TransferToCoreVaultStarted,
  TransferToCoreVaultSuccessful
} from "../../orm/entities/events/core-vault"
import {
  CollateralPoolClaimedReward,
  CollateralPoolDonated,
  CollateralPoolEntered,
  CollateralPoolExited,
  CollateralPoolPaidOut
} from "../../orm/entities/events/collateral-pool"
import { AgentPing, AgentPingResponse } from "../../orm/entities/events/ping"
import { CurrentUnderlyingBlockUpdated } from "../../orm/entities/events/system"
import { CoreVaultManagerSettingsUpdated } from "../../orm/entities/events/core-vault-manager"
import { PricesPublished } from "../../orm/entities/events/price"
import { ContractLookup } from "../../context/lookup"
import { EVENTS } from '../../config/constants'
import type { EntityManager } from "@mikro-orm/knex"
import type { Event } from "./event-scraper"
import type {
  AgentAvailableEvent,
  AgentDestroyedEvent,
  AgentSettingChangeAnnouncedEvent,
  AgentVaultCreatedEvent,
  AvailableAgentExitAnnouncedEvent,
  CollateralReservationDeletedEvent,
  CollateralReservedEvent,
  CollateralTypeAddedEvent,
  MintingExecutedEvent,
  MintingPaymentDefaultEvent,
  RedemptionDefaultEvent,
  RedemptionPaymentBlockedEvent,
  RedemptionPaymentFailedEvent,
  RedemptionPerformedEvent,
  RedemptionRejectedEvent,
  RedemptionRequestIncompleteEvent,
  RedemptionRequestedEvent,
  FullLiquidationStartedEvent,
  LiquidationEndedEvent,
  LiquidationPerformedEvent,
  LiquidationStartedEvent,
  SelfCloseEvent,
  AgentPingEvent,
  AgentPingResponseEvent,
  IllegalPaymentConfirmedEvent,
  DuplicatePaymentConfirmedEvent,
  UnderlyingBalanceTooLowEvent,
  AgentInCCBEvent,
  SelfMintEvent,
  RedemptionTicketCreatedEvent,
  RedemptionTicketUpdatedEvent,
  RedemptionTicketDeletedEvent,
  VaultCollateralWithdrawalAnnouncedEvent,
  PoolTokenRedemptionAnnouncedEvent,
  UnderlyingWithdrawalAnnouncedEvent,
  UnderlyingWithdrawalConfirmedEvent,
  CoreVaultRedemptionRequestedEvent,
  ReturnFromCoreVaultCancelledEvent,
  ReturnFromCoreVaultConfirmedEvent,
  ReturnFromCoreVaultRequestedEvent,
  TransferToCoreVaultStartedEvent,
  TransferToCoreVaultSuccessfulEvent
} from "../../../chain/typechain/IAssetManager"
import type {
  ClaimedRewardEvent,
  DonatedEvent,
  EnteredEvent,
  ExitedEvent,
  PaidOutEvent
} from "../../../chain/typechain/ICollateralPool"
import type { SettingsUpdatedEvent } from "../../../chain/typechain/ICoreVaultManager"
import type { TransferEvent } from "../../../chain/typechain/IERC20"
import type { CurrentUnderlyingBlockUpdatedEvent, RedeemedInCollateralEvent } from "../../../chain/typechain/IAssetManager"
import type { PricesPublishedEvent } from "../../../chain/typechain/IPriceChangeEmitter"
import type { ORM } from "../../orm/interface"


export class EventStorer {
  constructor(readonly orm: ORM, public readonly lookup: ContractLookup) { }

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

  protected async _processEvent(em: EntityManager, log: Event, evmLog: EvmLog): Promise<boolean> {
    let ent: any = null
    switch (log.name) {
      case EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED: {
        ent = await this.onCollateralTypeAdded(em, evmLog, log.args as CollateralTypeAddedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_VAULT_CREATED: {
        ent = await this.onAgentVaultCreated(em, evmLog, log.args as AgentVaultCreatedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_SETTING_CHANGED: {
        ent = await this.onAgentSettingChanged(em, evmLog, log.args as AgentSettingChangeAnnouncedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_DESTROYED: {
        ent = await this.onAgentDestroyed(em, log.args as AgentDestroyedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.VAULT_COLLATERAL_WITHDRAWAL_ANNOUNCED: {
        ent = await this.onVaultCollateralWithdrawalAnnounced(em, evmLog, log.args as VaultCollateralWithdrawalAnnouncedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.POOL_TOKEN_REDEMPTION_ANNOUNCED: {
        ent = await this.onPoolTokenRedemptionAnnounced(em, evmLog, log.args as PoolTokenRedemptionAnnouncedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_WITHDRAWAL_ANNOUNCED: {
        ent = await this.onUnderlyingWithdrawalAnnounced(em, evmLog, log.args as UnderlyingWithdrawalAnnouncedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_WITHDRAWAL_CONFIRMED: {
        ent = await this.onUnderlyingWithdrawalConfirmed(em, evmLog, log.args as UnderlyingWithdrawalConfirmedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.SELF_CLOSE: {
        ent = await this.onSelfClose(em, evmLog, log.args as SelfCloseEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED: {
        ent = await this.onCollateralReserved(em, evmLog, log.args as CollateralReservedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.MINTING_EXECUTED: {
        ent = await this.onMintingExecuted(em, evmLog, log.args as MintingExecutedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.SELF_MINT: {
        ent = await this.onSelfMint(em, evmLog, log.args as SelfMintEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.MINTING_PAYMENT_DEFAULT: {
        ent = await this.onMintingPaymentDefault(em, evmLog, log.args as MintingPaymentDefaultEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.COLLATERAL_RESERVATION_DELETED: {
        ent = await this.onCollateralReservationDeleted(em, evmLog, log.args as CollateralReservationDeletedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED: {
        ent = await this.onRedemptionRequested(em, evmLog, log.args as RedemptionRequestedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PERFORMED: {
        ent = await this.onRedemptionPerformed(em, evmLog, log.args as RedemptionPerformedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_DEFAULT: {
        ent = await this.onRedemptionDefault(em, evmLog, log.args as RedemptionDefaultEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_BLOCKED: {
        ent = await this.onRedemptionPaymentBlocked(em, evmLog, log.args as RedemptionPaymentBlockedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_FAILED: {
        ent = await this.onRedemptionPaymentFailed(em, evmLog, log.args as RedemptionPaymentFailedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REJECTED: {
        ent = await this.onRedemptionRejected(em, evmLog, log.args as RedemptionRejectedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_CREATED: {
        ent = await this.onRedemptionTicketCreated(em, evmLog, log.args as RedemptionTicketCreatedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_UPDATED: {
        ent = await this.onRedemptionTicketUpdated(em, evmLog, log.args as RedemptionTicketUpdatedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_DELETED: {
        ent = await this.onRedemptionTicketDeleted(em, evmLog, log.args as RedemptionTicketDeletedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEEMED_IN_COLLATERAL: {
        ent = await this.onRedeemedInCollateral(em, evmLog, log.args as RedeemedInCollateralEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REQUEST_INCOMPLETE: {
        ent = await this.onRedemptionPaymentIncomplete(em, evmLog, log.args as RedemptionRequestIncompleteEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_IN_CCB: {
        ent = await this.onAgentInCCB(em, evmLog, log.args as AgentInCCBEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_STARTED: {
        ent = await this.onLiquidationStarted(em, evmLog, log.args as LiquidationStartedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_PERFORMED: {
        ent = await this.onLiquidationPerformed(em, evmLog, log.args as LiquidationPerformedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.FULL_LIQUIDATION_STARTED: {
        ent = await this.onFullLiquidationStarted(em, evmLog, log.args as FullLiquidationStartedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_ENDED: {
        ent = await this.onLiquidationEnded(em, evmLog, log.args as LiquidationEndedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.ILLEGAL_PAYMENT_CONFIRMED: {
        ent = await this.onIllegalPaymentConfirmed(em, evmLog, log.args as IllegalPaymentConfirmedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.DUPLICATE_PAYMENT_CONFIRMED: {
        ent = await this.onDuplicatePaymentConfirmed(em, evmLog, log.args as DuplicatePaymentConfirmedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.UNDERLYING_BALANCE_TOO_LOW: {
        ent = await this.onUnderlyingBalanceTooLow(em, evmLog, log.args as UnderlyingBalanceTooLowEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.AVAILABLE_AGENT_EXITED: {
        ent = await this.onAvailableAgentExited(em, log.args as AvailableAgentExitAnnouncedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_ENTERED_AVAILABLE: {
        ent = await this.onAgentEnteredAvailable(em, log.args as AgentAvailableEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_PING: {
        ent = await this.onAgentPing(em, evmLog, log.args as AgentPingEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.AGENT_PING_RESPONSE: {
        ent = await this.onAgentPingResponse(em, evmLog, log.args as AgentPingResponseEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.CURRENT_UNDERLYING_BLOCK_UPDATED: {
        ent = await this.onCurrentUnderlyingBlockUpdated(em, evmLog, log.args as CurrentUnderlyingBlockUpdatedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_STARTED: {
        ent = await this.onTransferToCoreVaultStarted(em, evmLog, log.args as TransferToCoreVaultStartedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_SUCCESSFUL: {
        ent = await this.onTransferToCoreVaultSuccessful(em, evmLog, log.args as TransferToCoreVaultSuccessfulEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_REQUESTED: {
        ent = await this.onReturnFromCoreVaultRequested(em, evmLog, log.args as ReturnFromCoreVaultRequestedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CONFIRMED: {
        ent = await this.onReturnFromCoreVaultConfirmed(em, evmLog, log.args as ReturnFromCoreVaultConfirmedEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CANCELLED: {
        ent = await this.onReturnFromCoreVaultCancelled(em, evmLog, log.args as ReturnFromCoreVaultCancelledEvent.OutputTuple)
        break
      } case EVENTS.ASSET_MANAGER.CORE_VAULT_REDEMPTION_REQUESTED: {
        ent = await this.onCoreVaultRedemptionRequested(em, evmLog, log.args as CoreVaultRedemptionRequestedEvent.OutputTuple)
        break
      } case EVENTS.COLLATERAL_POOL.ENTER: {
        ent = await this.onCollateralPoolEntered(em, evmLog, log.args as EnteredEvent.OutputTuple)
        break
      } case EVENTS.COLLATERAL_POOL.EXIT: {
        ent = await this.onCollateralPoolExited(em, evmLog, log.args as ExitedEvent.OutputTuple)
        break
      } case EVENTS.COLLATERAL_POOL.PAID_OUT: {
        ent = await this.onCollateralPoolPaidOut(em, evmLog, log.args as PaidOutEvent.OutputTuple)
        break
      } case EVENTS.COLLATERAL_POOL.DONATED: {
        ent = await this.onCollateralPoolDonated(em, evmLog, log.args as DonatedEvent.OutputTuple)
        break
      } case EVENTS.COLLATERAL_POOL.CLAIMED_REWARD: {
        ent = await this.onCollateralPoolClaimedReward(em, evmLog, log.args as ClaimedRewardEvent.OutputTuple)
        break
      } case EVENTS.ERC20.TRANSFER: {
        ent = await this.onERC20Transfer(em, evmLog, log.args as TransferEvent.OutputTuple)
        break
      } case EVENTS.PRICE_READER.PRICES_PUBLISHED: {
        ent = await this.onPublishedPrices(em, evmLog, log.args as PricesPublishedEvent.OutputTuple)
        break
      } case EVENTS.CORE_VAULT_MANAGER.SETTINGS_UPDATED: {
        ent = await this.onCoreVaultManagerSettingsUpdated(em, evmLog, log.args as SettingsUpdatedEvent.OutputTuple)
        break
      }
       default: {
        return false
      }
    }
    if (ent != null) {
      em.persist(ent)
    }
    return true
  }

  protected async logExists(em: EntityManager, log: Event): Promise<boolean> {
    const { blockNumber, logIndex } = log
    const evmLog = await em.findOne(EvmLog, { index: logIndex, block: { index: blockNumber }})
    return evmLog !== null
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // collateral types

  protected async onCollateralTypeAdded(em: EntityManager, evmLog: EvmLog, logArgs: CollateralTypeAddedEvent.OutputTuple):
    Promise<CollateralTypeAdded>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ collateralClass, token, decimals, directPricePair, assetFtsoSymbol, tokenFtsoSymbol, ] = logArgs
    const tokenEvmAddress = await findOrCreateEvmAddress(em, token, AddressType.SYSTEM)
    const collateralTypeAdded = new CollateralTypeAdded(evmLog, fasset,
      Number(collateralClass), tokenEvmAddress, Number(decimals),
      directPricePair, assetFtsoSymbol, tokenFtsoSymbol
    )
    em.persist(collateralTypeAdded)
    return collateralTypeAdded
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // agent

  protected async onAgentVaultCreated(em: EntityManager, evmLog: EvmLog, logArgs: AgentVaultCreatedEvent.OutputTuple): Promise<[
    AgentVault, AgentVaultSettings, AgentVaultCreated
  ]> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const { 0: owner, 1: agentVault } = logArgs
    const [ collateralPool, collateralPoolToken, underlyingAddress, vaultCollateralToken, poolWNatToken,
      feeBIPS, poolFeeShareBIPS, mintingVaultCollateralRatioBIPS, mintingPoolCollateralRatioBIPS,
      buyFAssetByAgentFactorBIPS, poolExitCollateralRatioBIPS, poolTopupCollateralRatioBIPS, poolTopupTokenPriceFactorBIPS
    ] = (logArgs as any).creationData
    const agentOwnerEntity = await em.findOneOrFail(AgentOwner, { manager: { address: { hex: owner }}})
    // addresses
    const agentEvmAddress = await findOrCreateEvmAddress(em, agentVault, AddressType.AGENT)
    const agentUnderlyingAddress = await findOrCreateUnderlyingAddress(em, underlyingAddress, AddressType.AGENT)
    const collateralPoolEvmAddress = await findOrCreateEvmAddress(em, collateralPool, AddressType.AGENT)
    const collateralPoolTokenEvmAddress = await findOrCreateEvmAddress(em, collateralPoolToken!, AddressType.AGENT)
    // create agent vault
    const agentVaultEntity = new AgentVault(
      fasset,
      agentEvmAddress,
      agentUnderlyingAddress,
      collateralPoolEvmAddress,
      collateralPoolTokenEvmAddress,
      agentOwnerEntity,
      false
    )
    const vaultCollateralTokenEntity = await em.findOneOrFail(CollateralTypeAdded, { address: { hex: vaultCollateralToken }, fasset })
    const agentVaultSettings = new AgentVaultSettings(
      agentVaultEntity, vaultCollateralTokenEntity, feeBIPS, poolFeeShareBIPS, mintingVaultCollateralRatioBIPS,
      mintingPoolCollateralRatioBIPS, buyFAssetByAgentFactorBIPS, poolExitCollateralRatioBIPS,
      poolTopupCollateralRatioBIPS, poolTopupTokenPriceFactorBIPS
    )
    const agentVaultCreated = new AgentVaultCreated(evmLog, fasset, agentVaultEntity)
    return [agentVaultEntity, agentVaultSettings, agentVaultCreated]
  }

  protected async onAgentSettingChanged(em: EntityManager, evmLog: EvmLog, logArgs: AgentSettingChangeAnnouncedEvent.OutputTuple): Promise<[
    AgentVaultSettings, AgentSettingChanged
  ]> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, name, value ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    const agentSettingChanged = new AgentSettingChanged(evmLog, fasset, agentVaultEntity, name, value)
    const agentSettings = await em.findOneOrFail(AgentVaultSettings, { agentVault: agentVaultEntity })
    this.applyAgentSettingChange(agentSettings, name, value)
    return [agentSettings, agentSettingChanged]
  }

  protected async onAvailableAgentExited(em: EntityManager, logArgs: AvailableAgentExitAnnouncedEvent.OutputTuple): Promise<void> {
    const [ agentVault ] = logArgs
    const isUntracked = await isUntrackedAgentVault(em, agentVault)
    if (isUntracked) return // untracked agents don't have agent vault info property
    const agentVaultEntity = await em.findOneOrFail(AgentVaultInfo, { agentVault: { address: { hex: agentVault }}})
    agentVaultEntity.publiclyAvailable = false
    em.persist(agentVaultEntity)
  }

  protected async onAgentEnteredAvailable(em: EntityManager, logArgs: AgentAvailableEvent.OutputTuple): Promise<void> {
    const [ agentVault, ] = logArgs
    const isUntracked = await isUntrackedAgentVault(em, agentVault)
    if (isUntracked) return // untracked agents don't have agent vault info property
    const agentVaultEntity = await em.findOneOrFail(AgentVaultInfo, { agentVault: { address: { hex: agentVault }}})
    agentVaultEntity.publiclyAvailable = true
    em.persist(agentVaultEntity)
  }

  protected async onAgentDestroyed(em: EntityManager, logArgs: AgentDestroyedEvent.OutputTuple): Promise<void> {
    const [ agentVault ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    const agentVaultInfo = await em.findOne(AgentVaultInfo, { agentVault: agentVaultEntity })
    if (agentVaultInfo) {
      em.remove(agentVaultInfo)
    }
    agentVaultEntity.destroyed = true
    em.persist(agentVaultEntity)
  }

  protected async onSelfClose(em: EntityManager, evmLog: EvmLog, logArgs: SelfCloseEvent.OutputTuple): Promise<SelfClose> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, valueUBA ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new SelfClose(evmLog, fasset, agentVaultEntity, valueUBA)
  }

  private applyAgentSettingChange(agentSettings: AgentVaultSettings, name: string, value: bigint): void {
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
      } case "poolTopupCollateralRatioBIPS": {
        agentSettings.poolTopupCollateralRatioBIPS = BigInt(value)
        break
      } case "poolTopupTokenPriceFactorBIPS": {
        agentSettings.poolTopupTokenPriceFactorBIPS = BigInt(value)
        break
      } default: {
        break
      }
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // mintings

  protected async onCollateralReserved(em: EntityManager, evmLog: EvmLog, logArgs: CollateralReservedEvent.OutputTuple):
    Promise<CollateralReserved>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [
      agentVault, minter, collateralReservationId, valueUBA, feeUBA,
      firstUnderlyingBlock, lastUnderlyingBlock, lastUnderlyingTimestamp,
      paymentAddress, paymentReference, executor, executorFeeNatWei
    ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    const minterEvmAddress = await findOrCreateEvmAddress(em, minter, AddressType.USER)
    const paymentUnderlyingAddress = await findOrCreateUnderlyingAddress(em, paymentAddress, AddressType.AGENT)
    const executorEvmAddress = await findOrCreateEvmAddress(em, executor, AddressType.SERVICE)
    return new CollateralReserved(evmLog, fasset,
      Number(collateralReservationId), agentVaultEntity, minterEvmAddress, valueUBA, feeUBA,
      Number(firstUnderlyingBlock), Number(lastUnderlyingBlock), Number(lastUnderlyingTimestamp),
      paymentUnderlyingAddress, paymentReference, executorEvmAddress, executorFeeNatWei
    )
  }

  protected async onMintingExecuted(em: EntityManager, evmLog: EvmLog, logArgs: MintingExecutedEvent.OutputTuple): Promise<MintingExecuted> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ , collateralReservationId,,, poolFeeUBA ] = logArgs
    const collateralReserved = await em.findOneOrFail(CollateralReserved, { collateralReservationId: Number(collateralReservationId), fasset })
    return new MintingExecuted(evmLog, fasset, collateralReserved, poolFeeUBA)
  }

  protected async onMintingPaymentDefault(em: EntityManager, evmLog: EvmLog, logArgs: MintingPaymentDefaultEvent.OutputTuple):
    Promise<MintingPaymentDefault>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, collateralReservationId, ] = logArgs
    const collateralReserved = await em.findOneOrFail(CollateralReserved, { collateralReservationId: Number(collateralReservationId), fasset })
    return new MintingPaymentDefault(evmLog, fasset, collateralReserved)
  }

  protected async onCollateralReservationDeleted(em: EntityManager, evmLog: EvmLog, logArgs: CollateralReservationDeletedEvent.OutputTuple):
    Promise<CollateralReservationDeleted>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, collateralReservationId, ] = logArgs
    const collateralReserved = await em.findOneOrFail(CollateralReserved, { collateralReservationId: Number(collateralReservationId), fasset })
    return new CollateralReservationDeleted(evmLog, fasset, collateralReserved)
  }

  protected async onSelfMint(em: EntityManager, evmLog: EvmLog, logArgs: SelfMintEvent.OutputTuple): Promise<SelfMint> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, mintFromFreeUnderlying, mintedAmountUBA, depositedAmountUBA, poolFeeUBA ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new SelfMint(evmLog, fasset, agentVaultEntity, mintFromFreeUnderlying, mintedAmountUBA, depositedAmountUBA, poolFeeUBA)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // redemptions

  protected async onRedemptionRequested(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionRequestedEvent.OutputTuple):
    Promise<RedemptionRequested>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [
      agentVault, redeemer, requestId, paymentAddress, valueUBA, feeUBA,
      firstUnderlyingBlock, lastUnderlyingBlock, lastUnderlyingTimestamp,
      paymentReference, executor, executorFeeNatWei
    ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    const redeemerEvmAddress = await findOrCreateEvmAddress(em, redeemer, AddressType.USER)
    const paymentUnderlyingAddress = await findOrCreateUnderlyingAddress(em, paymentAddress, AddressType.USER)
    const executorEvmAddress = await findOrCreateEvmAddress(em, executor, AddressType.SERVICE)
    return new RedemptionRequested(evmLog, fasset,
      agentVaultEntity, redeemerEvmAddress, Number(requestId), paymentUnderlyingAddress, valueUBA, feeUBA,
      Number(firstUnderlyingBlock), Number(lastUnderlyingBlock), Number(lastUnderlyingTimestamp),
      paymentReference, executorEvmAddress, executorFeeNatWei
    )
  }

  protected async onRedemptionPerformed(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionPerformedEvent.OutputTuple):
    Promise<RedemptionPerformed>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId, transactionHash,, spentUnderlyingUBA ] = logArgs
    const redemptionRequested = await em.findOneOrFail(RedemptionRequested, { requestId: Number(requestId), fasset })
    return new RedemptionPerformed(evmLog, fasset, redemptionRequested, transactionHash, spentUnderlyingUBA)
  }

  protected async onRedemptionDefault(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionDefaultEvent.OutputTuple):
    Promise<RedemptionDefault>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId,, redeemedVaultCollateralWei, redeemedPoolCollateralWei ] = logArgs
    const redemptionRequested = await em.findOneOrFail(RedemptionRequested, { requestId: Number(requestId), fasset })
    return new RedemptionDefault(evmLog, fasset, redemptionRequested, redeemedVaultCollateralWei, redeemedPoolCollateralWei)
  }

  protected async onRedemptionPaymentBlocked(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionPaymentBlockedEvent.OutputTuple):
    Promise<RedemptionPaymentBlocked>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId, transactionHash,, spentUnderlyingUBA ] = logArgs
    const redemptionRequested = await em.findOneOrFail(RedemptionRequested, { requestId: Number(requestId), fasset })
    return new RedemptionPaymentBlocked(evmLog, fasset, redemptionRequested, transactionHash, spentUnderlyingUBA)
  }

  protected async onRedemptionPaymentFailed(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionPaymentFailedEvent.OutputTuple):
    Promise<RedemptionPaymentFailed>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId, transactionHash, spentUnderlyingUBA, failureReason ] = logArgs
    const redemptionRequested = await em.findOneOrFail(RedemptionRequested, { requestId: Number(requestId), fasset })
    return new RedemptionPaymentFailed(evmLog, fasset, redemptionRequested, transactionHash, spentUnderlyingUBA, failureReason)
  }

  protected async onRedemptionRejected(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionRejectedEvent.OutputTuple):
    Promise<RedemptionRejected>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ ,, requestId, ] = logArgs
    const redemptionRequested = await em.findOneOrFail(RedemptionRequested, { requestId: Number(requestId), fasset })
    return new RedemptionRejected(evmLog, fasset, redemptionRequested)
  }

  protected async onRedeemedInCollateral(em: EntityManager, evmLog: EvmLog, logArgs: RedeemedInCollateralEvent.OutputTuple):
    Promise<RedeemedInCollateral>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, redeemer, redemptionAmountUBA, paidVaultCollateralWei ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    const redeemerEvmAddress = await findOrCreateEvmAddress(em, redeemer, AddressType.USER)
    return new RedeemedInCollateral(
      evmLog, fasset, agentVaultEntity, redeemerEvmAddress,
      redemptionAmountUBA, paidVaultCollateralWei
    )
  }

  protected async onRedemptionTicketCreated(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionTicketCreatedEvent.OutputTuple):
    Promise<[RedemptionTicketCreated, RedemptionTicket]>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, redemptionTicketId, ticketValueUBA ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    const redemptionTicketCreated = new RedemptionTicketCreated(evmLog, fasset, agentVaultEntity, redemptionTicketId, ticketValueUBA)
    const redemptionTicket = new RedemptionTicket(redemptionTicketCreated, ticketValueUBA)
    return [redemptionTicketCreated, redemptionTicket]
  }

  protected async onRedemptionTicketUpdated(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionTicketCreatedEvent.OutputTuple):
    Promise<[RedemptionTicketUpdated, RedemptionTicket]>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ , redemptionTicketId, ticketValueUBA ] = logArgs
    const redemptionTicketCreated = await em.findOneOrFail(RedemptionTicketCreated, { redemptionTicketId, fasset })
    const redemptionTicketUpdated = new RedemptionTicketUpdated(evmLog, fasset, redemptionTicketCreated, ticketValueUBA)
    const redemptionTicket = await em.findOneOrFail(RedemptionTicket, { redemptionTicketCreated })
    redemptionTicket.ticketValueUBA = ticketValueUBA
    return [redemptionTicketUpdated, redemptionTicket]
  }

  protected async onRedemptionTicketDeleted(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionTicketDeletedEvent.OutputTuple):
    Promise<[RedemptionTicketDeleted, RedemptionTicket]>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ , redemptionTicketId ] = logArgs
    const redemptionTicketCreated = await em.findOneOrFail(RedemptionTicketCreated, { redemptionTicketId, fasset })
    const redemptionTicketDeleted = new RedemptionTicketDeleted(evmLog, fasset, redemptionTicketCreated)
    const redemptionTicket = await em.findOneOrFail(RedemptionTicket, { redemptionTicketCreated })
    redemptionTicket.ticketValueUBA = BigInt(0)
    redemptionTicket.destroyed = true
    return [redemptionTicketDeleted, redemptionTicket]
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // liquidations

  protected async onAgentInCCB(em: EntityManager, evmLog: EvmLog, logArgs: AgentInCCBEvent.OutputTuple): Promise<AgentInCCB> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, timestamp ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new AgentInCCB(evmLog, fasset, agentVaultEntity, Number(timestamp))
  }

  protected async onLiquidationStarted(em: EntityManager, evmLog: EvmLog, logArgs: LiquidationStartedEvent.OutputTuple):
    Promise<LiquidationStarted>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, timestamp ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new LiquidationStarted(evmLog, fasset, agentVaultEntity, Number(timestamp))
  }

  protected async onFullLiquidationStarted(em: EntityManager, evmLog: EvmLog, logArgs: FullLiquidationStartedEvent.OutputTuple):
    Promise<FullLiquidationStarted>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, timestamp ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new FullLiquidationStarted(evmLog, fasset, agentVaultEntity, Number(timestamp))
  }

  protected async onLiquidationPerformed(em: EntityManager, evmLog: EvmLog, logArgs: LiquidationPerformedEvent.OutputTuple):
    Promise<LiquidationPerformed>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, liquidator, valueUBA, paidVaultCollateralWei, paidPoolCollateralWei ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    const liquidatorEvmAddress = await findOrCreateEvmAddress(em, liquidator, AddressType.USER)
    return new LiquidationPerformed(evmLog, fasset,
      agentVaultEntity, liquidatorEvmAddress, valueUBA, paidVaultCollateralWei, paidPoolCollateralWei)
  }

  protected async onLiquidationEnded(em: EntityManager, evmLog: EvmLog, logArgs: LiquidationEndedEvent.OutputTuple): Promise<LiquidationEnded> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new LiquidationEnded(evmLog, fasset, agentVaultEntity)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // challenges

  protected async onIllegalPaymentConfirmed(em: EntityManager, evmLog: EvmLog, logArgs: IllegalPaymentConfirmedEvent.OutputTuple):
    Promise<IllegalPaymentConfirmed>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transactionHash ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new IllegalPaymentConfirmed(evmLog, fasset, agentVaultEntity, transactionHash)
  }

  protected async onDuplicatePaymentConfirmed(em: EntityManager, evmLog: EvmLog, logArgs: DuplicatePaymentConfirmedEvent.OutputTuple):
    Promise<DuplicatePaymentConfirmed>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transactionHash1, transactionHash2 ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new DuplicatePaymentConfirmed(evmLog, fasset, agentVaultEntity, transactionHash1, transactionHash2)
  }

  protected async onUnderlyingBalanceTooLow(em: EntityManager, evmLog: EvmLog, logArgs: UnderlyingBalanceTooLowEvent.OutputTuple):
    Promise<UnderlyingBalanceTooLow>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, balance, requiredBalance ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new UnderlyingBalanceTooLow(evmLog, fasset, agentVaultEntity, balance, requiredBalance)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // dangerous events

  protected async onRedemptionPaymentIncomplete(em: EntityManager, evmLog: EvmLog, logArgs: RedemptionRequestIncompleteEvent.OutputTuple):
    Promise<RedemptionRequestIncomplete>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ redeemer, remainingLots ] = logArgs
    const redeemerEvmAddress = await findOrCreateEvmAddress(em, redeemer, AddressType.USER)
    return new RedemptionRequestIncomplete(evmLog, fasset, redeemerEvmAddress, remainingLots)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // collateral pool

  protected async onCollateralPoolEntered(em: EntityManager, evmLog: EvmLog, logArgs: EnteredEvent.OutputTuple): Promise<CollateralPoolEntered> {
    const agentVault = await em.findOneOrFail(AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, amountNatWei, receivedTokensWei, addedFAssetFeesUBA, newFAssetFeeDebt, timelockExpiresAt ] = logArgs
    const tokenHolderEvmAddress = await findOrCreateEvmAddress(em, tokenHolder, AddressType.USER)
    return new CollateralPoolEntered(evmLog, agentVault.fasset,
      tokenHolderEvmAddress, amountNatWei, receivedTokensWei, addedFAssetFeesUBA, newFAssetFeeDebt, Number(timelockExpiresAt)
    )
  }

  protected async onCollateralPoolExited(em: EntityManager, evmLog: EvmLog, logArgs: ExitedEvent.OutputTuple): Promise<CollateralPoolExited> {
    const agentVault = await em.findOneOrFail(AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ tokenHolder, burnedTokensWei, receivedNatWei, receviedFAssetFeesUBA, closedFAssetsUBA, newFAssetFeeDebt ] = logArgs
    const tokenHolderEvmAddress = await findOrCreateEvmAddress(em, tokenHolder, AddressType.USER)
    return new CollateralPoolExited(evmLog, agentVault.fasset,
      tokenHolderEvmAddress, burnedTokensWei, receivedNatWei, receviedFAssetFeesUBA, closedFAssetsUBA, newFAssetFeeDebt
    )
  }

  protected async onCollateralPoolPaidOut(em: EntityManager, evmLog: EvmLog, logArgs: PaidOutEvent.OutputTuple): Promise<CollateralPoolPaidOut> {
    const agentVault = await em.findOneOrFail(AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ recipient, paidNatWei, burnedTokensWei ] = logArgs
    const recipientEvmAddress = await findOrCreateEvmAddress(em, recipient, AddressType.USER)
    return new CollateralPoolPaidOut(evmLog, agentVault.fasset, recipientEvmAddress, paidNatWei, burnedTokensWei)
  }

  protected async onCollateralPoolDonated(em: EntityManager, evmLog: EvmLog, logArgs: DonatedEvent.OutputTuple): Promise<CollateralPoolDonated> {
    const agentVault = await em.findOneOrFail(AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ donator, amountNatWei ] = logArgs
    const donatorEvmAddress = await findOrCreateEvmAddress(em, donator, AddressType.USER)
    return new CollateralPoolDonated(evmLog, agentVault.fasset, donatorEvmAddress, amountNatWei)
  }

  protected async onCollateralPoolClaimedReward(em: EntityManager, evmLog: EvmLog, logArgs: ClaimedRewardEvent.OutputTuple):
    Promise<CollateralPoolClaimedReward>
  {
    const agentVault = await em.findOneOrFail(AgentVault, { collateralPool: { hex: evmLog.address.hex }})
    const [ amountNatWei, rewardType ] = logArgs
    return new CollateralPoolClaimedReward(evmLog, agentVault.fasset, amountNatWei, Number(rewardType))
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // erc20 (fasset, collateral, wnat tokens)

  protected async onERC20Transfer(em: EntityManager, evmLog: EvmLog, logArgs: TransferEvent.OutputTuple): Promise<ERC20Transfer> {
    const [ from, to, value ] = logArgs
    const fromEvmAddress = await findOrCreateEvmAddress(em, from, AddressType.USER)
    const toEvmAddress = await findOrCreateEvmAddress(em, to, AddressType.USER)
    await this.increaseTokenBalance(em, evmLog.address, toEvmAddress, value)
    await this.increaseTokenBalance(em, evmLog.address, fromEvmAddress, -value)
    return new ERC20Transfer(evmLog, fromEvmAddress, toEvmAddress, value)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // agent announcements

  protected async onVaultCollateralWithdrawalAnnounced(em: EntityManager, evmLog: EvmLog, logArgs: VaultCollateralWithdrawalAnnouncedEvent.OutputTuple):
    Promise<VaultCollateralWithdrawalAnnounced> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, amountWei, withdrawalAllowedAt ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new VaultCollateralWithdrawalAnnounced(evmLog, fasset, agentVaultEntity, amountWei, withdrawalAllowedAt)
  }

  protected async onPoolTokenRedemptionAnnounced(em: EntityManager, evmLog: EvmLog, logArgs: PoolTokenRedemptionAnnouncedEvent.OutputTuple):
    Promise<PoolTokenRedemptionAnnounced> {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, amountWei, withdrawalAllowedAt ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new PoolTokenRedemptionAnnounced(evmLog, fasset, agentVaultEntity, amountWei, withdrawalAllowedAt)
  }

  protected async onUnderlyingWithdrawalAnnounced(em: EntityManager, evmLog: EvmLog, logArgs: UnderlyingWithdrawalAnnouncedEvent.OutputTuple):
    Promise<UnderlyingWithdrawalAnnounced>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, announcmentId, paymentReference ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new UnderlyingWithdrawalAnnounced(evmLog, fasset, agentVaultEntity, announcmentId, paymentReference)
  }

  protected async onUnderlyingWithdrawalConfirmed(em: EntityManager, evmLog: EvmLog, logArgs: UnderlyingWithdrawalConfirmedEvent.OutputTuple):
    Promise<UnderlyingWithdrawalConfirmed>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ , announcementId, spentUBA, transactionHash ] = logArgs
    const underlyingWithdrawalAnnounced = await em.findOneOrFail(UnderlyingWithdrawalAnnounced, { announcementId , fasset })
    return new UnderlyingWithdrawalConfirmed(evmLog, fasset, underlyingWithdrawalAnnounced, spentUBA, transactionHash)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // agent ping

  protected async onAgentPing(em: EntityManager, evmLog: EvmLog, logArgs: AgentPingEvent.OutputTuple): Promise<AgentPing> {
    const [ agentVault, sender, query ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    const senderEvmAddress = await findOrCreateEvmAddress(em, sender, AddressType.USER)
    return new AgentPing(evmLog, agentVaultEntity.fasset, agentVaultEntity, senderEvmAddress, query)
  }

  protected async onAgentPingResponse(em: EntityManager, evmLog: EvmLog, logArgs: AgentPingResponseEvent.OutputTuple): Promise<AgentPingResponse> {
    const [ agentVault,, query, response ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new AgentPingResponse(evmLog, agentVaultEntity.fasset, agentVaultEntity, query, response)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // system

  protected async onCurrentUnderlyingBlockUpdated(em: EntityManager, evmLog: EvmLog, logArgs: CurrentUnderlyingBlockUpdatedEvent.OutputTuple):
    Promise<CurrentUnderlyingBlockUpdated>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ underlyingBlockNumber, underlyingBlockTimestamp, updatedAt ] = logArgs
    return new CurrentUnderlyingBlockUpdated(evmLog, fasset,
      Number(underlyingBlockNumber), Number(underlyingBlockTimestamp), Number(updatedAt))
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // core vault

  protected async onTransferToCoreVaultStarted(em: EntityManager, evmLog: EvmLog, logArgs: TransferToCoreVaultStartedEvent.OutputTuple):
    Promise<TransferToCoreVaultStarted>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transferRedemptionRequestId, valueUBA ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new TransferToCoreVaultStarted(evmLog, fasset, agentVaultEntity, Number(transferRedemptionRequestId), valueUBA)
  }

  protected async onTransferToCoreVaultSuccessful(em: EntityManager, evmLog: EvmLog, logArgs: TransferToCoreVaultSuccessfulEvent.OutputTuple):
    Promise<TransferToCoreVaultSuccessful>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, transferRedemptionRequestId, valueUBA ] = logArgs
    const transferToCoreVaultStarted = await em.findOneOrFail(TransferToCoreVaultStarted,
      { transferRedemptionRequestId: Number(transferRedemptionRequestId), fasset })
    return new TransferToCoreVaultSuccessful(evmLog, fasset, transferToCoreVaultStarted, valueUBA)
  }

  protected async onReturnFromCoreVaultRequested(em: EntityManager, evmLog: EvmLog, logArgs: ReturnFromCoreVaultRequestedEvent.OutputTuple):
    Promise<ReturnFromCoreVaultRequested>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, requestId, paymentReference, valueUBA ] = logArgs
    const agentVaultEntity = await em.findOneOrFail(AgentVault, { address: { hex: agentVault }})
    return new ReturnFromCoreVaultRequested(evmLog, fasset, agentVaultEntity, Number(requestId), paymentReference, valueUBA)
  }

  protected async onReturnFromCoreVaultConfirmed(em: EntityManager, evmLog: EvmLog, logArgs: ReturnFromCoreVaultConfirmedEvent.OutputTuple):
    Promise<ReturnFromCoreVaultConfirmed>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, requestId, receivedUnderlyingUBA, remintedUBA ] = logArgs
    const returnFromCoreVaultRequested = await em.findOneOrFail(ReturnFromCoreVaultRequested, { requestId: Number(requestId), fasset })
    return new ReturnFromCoreVaultConfirmed(evmLog, fasset, returnFromCoreVaultRequested, receivedUnderlyingUBA, remintedUBA)
  }

  protected async onReturnFromCoreVaultCancelled(em: EntityManager, evmLog: EvmLog, logArgs: ReturnFromCoreVaultCancelledEvent.OutputTuple):
    Promise<ReturnFromCoreVaultCancelled>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ agentVault, requestId ] = logArgs
    const returnFromCoreVaultRequested = await em.findOneOrFail(ReturnFromCoreVaultRequested, { requestId: Number(requestId), fasset })
    return new ReturnFromCoreVaultCancelled(evmLog, fasset, returnFromCoreVaultRequested)
  }

  protected async onCoreVaultRedemptionRequested(em: EntityManager, evmLog: EvmLog, logArgs: CoreVaultRedemptionRequestedEvent.OutputTuple):
    Promise<CoreVaultRedemptionRequested>
  {
    const fasset = this.lookup.assetManagerAddressToFAssetType(evmLog.address.hex)
    const [ redeemer, paymentAddress, paymentReference, valueUBA, feeUBA ] = logArgs
    const redeemerEntity = await findOrCreateEvmAddress(em, redeemer, AddressType.USER)
    const paymentAddressEntity = await findOrCreateUnderlyingAddress(em, paymentAddress, AddressType.USER)
    return new CoreVaultRedemptionRequested(evmLog, fasset, redeemerEntity, paymentAddressEntity, paymentReference, valueUBA, feeUBA)
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  // core vault manager

  protected async onCoreVaultManagerSettingsUpdated(em: EntityManager, evmLog: EvmLog, logArgs: SettingsUpdatedEvent.OutputTuple):
    Promise<CoreVaultManagerSettingsUpdated>
  {
    const fasset = this.lookup.coreVaultManagerToFAssetType(evmLog.address.hex)
    const [ escrowEndTimeSeconds, escrowAmount, minimalAmount, fee ] = logArgs
    return new CoreVaultManagerSettingsUpdated(evmLog, fasset, escrowEndTimeSeconds, escrowAmount, minimalAmount, fee)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // price publisher

  protected async onPublishedPrices(em: EntityManager, evmLog: EvmLog, logArgs: PricesPublishedEvent.OutputTuple): Promise<PricesPublished> {
    const [ votingRoundId ] = logArgs
    const pricesPublished = new PricesPublished(evmLog, Number(votingRoundId))
    return pricesPublished
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  // helpers

  private async createLogEntity(em: EntityManager, log: Event): Promise<EvmLog> {
    const transactionSource = await findOrCreateEvmAddress(em, log.transactionSource, AddressType.SYSTEM)
    const transactionTarget = log.transactionTarget === null ? undefined
      : await findOrCreateEvmAddress(em, log.transactionTarget, AddressType.SYSTEM)
    const block = await findOrCreateEvmBlock(em, log.blockNumber, log.blockTimestamp)
    const transaction = await findOrCreateEvmTransaction(em, log.transactionHash, block,
      log.transactionIndex, transactionSource, transactionTarget)
    const eventSource = await findOrCreateEvmAddress(em, log.source, AddressType.SYSTEM)
    const evmLog = new EvmLog(log.logIndex, log.name, eventSource, transaction, block)
    // do not persist here, only persist if the log was processed
    return evmLog
  }

  private async increaseTokenBalance(em: EntityManager, token: EvmAddress, holder: EvmAddress, amount: bigint): Promise<void> {
    let balance = await em.findOne(TokenBalance, { token, holder })
    if (balance === null) {
      balance = new TokenBalance(token, holder, amount)
    } else {
      balance.amount += amount
    }
    em.persist(balance)
  }

}