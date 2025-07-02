import { FAssetType } from "../../../src"
import { ORM } from "../../../src/orm"
import { EvmAddress } from "../../../src/orm/entities/evm/address"
import { UnderlyingAddress } from "../../../src/orm/entities/underlying/address"
import { AgentManager, AgentOwner, AgentVault } from "../../../src/orm/entities/agent"
import { CoreVaultManagerSettings } from "../../../src/orm/entities/state/settings"
import {
  randomChoice, randomHash,
  randomNativeAddress, randomNumber, randomString, randomUnderlyingAddress
} from "../utils"
import { ASSET_MANAGERS } from "../constants"
import { EVENTS } from "../../../src/config"

import type { Event } from "../../../src/indexer/eventlib/event-scraper"
import type { EventNameToEventArgs } from "./types"
import { EventGeneration } from "./generate"


export class EventFixture extends EventGeneration {

  constructor(public readonly orm: ORM) { super(orm) }

  async storeInitialCoreVaultManagerSettings(fasset: FAssetType = FAssetType.FXRP): Promise<void> {
    await this.orm.em.transactional(async em => {
      const vaultManager = new CoreVaultManagerSettings(fasset, BigInt(0), BigInt(0), 1, BigInt(0))
      em.persist(vaultManager)
    })
  }

  async storeInitialAgents(fasset: FAssetType = FAssetType.FXRP): Promise<void> {
    await this.orm.em.transactional(async (em) => {
      const managerAddress = new EvmAddress(randomNativeAddress(), 1)
      em.persist(managerAddress)
      const agentManager = new AgentManager(managerAddress, randomString(5), randomString(10), 'http://localhost:3000/awesome/pic.png')
      em.persist(agentManager)
      const ownerAddress = new EvmAddress(randomNativeAddress(), 1)
      const agentOwner = new AgentOwner(ownerAddress, agentManager)
      em.persist(agentOwner)
      const vaultAddress = new EvmAddress(randomNativeAddress(), 1)
      const underlyingVaultAddress = new UnderlyingAddress(randomUnderlyingAddress(), 1)
      const collateralPoolAddress = new EvmAddress(randomNativeAddress(), 1)
      const collateralPoolTokenAddress = new EvmAddress(randomNativeAddress(), 1)
      const agentVault = new AgentVault(
        fasset,
        vaultAddress, underlyingVaultAddress, collateralPoolAddress,
        collateralPoolTokenAddress, agentOwner, false
      )
      em.persist(agentVault)
    })
  }

  async generateEvent(name: keyof EventNameToEventArgs, source?: string, args: any[] = []): Promise<Event> {
    return { name, args: await this.generateEventArgs(name, args), ...this.generateEventWithoutArgs(source) }
  }

  protected async generateEventArgs<T extends keyof EventNameToEventArgs>(name: T, args: any[]): Promise<EventNameToEventArgs[T]>
  protected async generateEventArgs(name: keyof EventNameToEventArgs, args: any[] = []) {
    switch (name) {
      case EVENTS.ASSET_MANAGER.SETTING_CHANGED: {
        return this.generateSettingChanged(args[0])
      } case EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED: {
        return this.generateCollateralTypeAdded()
      } case EVENTS.ASSET_MANAGER.AGENT_VAULT_CREATED: {
        return this.generateAgentVaultCreated()
      } case EVENTS.ASSET_MANAGER.AGENT_SETTING_CHANGED: {
        return this.generateAgentSettingsChanged()
      } case EVENTS.ASSET_MANAGER.AGENT_DESTROYED: {
        return this.generateAgentDestroyed()
      } case EVENTS.ASSET_MANAGER.SELF_CLOSE: {
        return this.generateSelfClose()
      } case EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED: {
        return this.generateCollateralReserved()
      } case EVENTS.ASSET_MANAGER.MINTING_EXECUTED: {
        return this.generateMintingExecuted()
      } case EVENTS.ASSET_MANAGER.MINTING_PAYMENT_DEFAULT: {
        return this.generateMintingPaymentDefault()
      } case EVENTS.ASSET_MANAGER.COLLATERAL_RESERVATION_DELETED: {
        return this.generateCollateralReservationDeleted()
      } case EVENTS.ASSET_MANAGER.SELF_MINT: {
        return this.generateSelfMint()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED: {
        return this.generateRedemptionRequested()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PERFORMED: {
        return this.generateRedemptionPerformed()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_DEFAULT: {
        return this.generateRedemptionDefault()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_BLOCKED: {
        return this.generateRedemptionPaymentBlocked()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_FAILED: {
        return this.generateRedemptionPaymentFailed()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REJECTED: {
        return this.generateRedemptionRejected()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_CREATED: {
        return this.generateRedemptionTicketCreated()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_DELETED: {
        return this.generateRedemptionTicketDeleted()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_UPDATED: {
        return this.generateRedemptionTicketUpdated()
      } case EVENTS.ASSET_MANAGER.REDEEMED_IN_COLLATERAL: {
        return this.generateRedeemedInCollateral()
      } case EVENTS.ASSET_MANAGER.REDEMPTION_REQUEST_INCOMPLETE: {
        return this.generateRedemptionRequestIncomplete()
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_STARTED: {
        return this.generateLiquidationStarted()
      } case EVENTS.ASSET_MANAGER.FULL_LIQUIDATION_STARTED: {
        return this.generateFullLiquidationStarted()
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_PERFORMED: {
        return this.generateLiquidationPerformed()
      } case EVENTS.ASSET_MANAGER.LIQUIDATION_ENDED: {
        return this.generateLiquidationEnded()
      } case EVENTS.ASSET_MANAGER.AVAILABLE_AGENT_EXITED: {
        return this.generateAvailableAgentExited()
      } case EVENTS.ASSET_MANAGER.AGENT_ENTERED_AVAILABLE: {
        return this.generateAgentEnteredAvailable()
      } case EVENTS.COLLATERAL_POOL.ENTER: {
        return this.generateCollateralPoolEnter()
      } case EVENTS.COLLATERAL_POOL.EXIT: {
        return this.generateCollateralPoolExit()
      } case EVENTS.ERC20.TRANSFER: {
        return this.generateTransfer()
      } case EVENTS.ASSET_MANAGER.AGENT_PING: {
        return this.generateAgentPing()
      } case EVENTS.ASSET_MANAGER.AGENT_PING_RESPONSE: {
        return this.generateAgentPingResponse()
      } case EVENTS.ASSET_MANAGER.CURRENT_UNDERLYING_BLOCK_UPDATED: {
        return this.generateCurrentUnderlyingBlockUpdated()
      } case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_STARTED: {
        return this.generateTransferToCoreVaultStarted()
      } case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_SUCCESSFUL: {
        return this.generateTransferToCoreVaultSuccessful()
      } case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_DEFAULTED: {
        return this.generateTransferToCoreVaultDefaulted()
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_REQUESTED: {
        return this.generateReturnFromCoreVaultRequested()
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CONFIRMED: {
        return this.generateReturnFromCoreVaultConfirmed()
      } case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CANCELLED: {
        return this.generateReturnFromCoreVaultCancelled()
      } case EVENTS.ASSET_MANAGER.CORE_VAULT_REDEMPTION_REQUESTED: {
        return this.generateCoreVaultRedemptionRequested()
      } case EVENTS.CORE_VAULT_MANAGER.SETTINGS_UPDATED: {
        return this.generateSettingsUpdated()
      }
    }
  }
}