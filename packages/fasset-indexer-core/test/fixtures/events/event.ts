import { EventInterface, FAssetType } from "../../../src"
import { ORM } from "../../../src/orm"
import { EvmAddress } from "../../../src/orm/entities/evm/address"
import { UnderlyingAddress } from "../../../src/orm/entities/underlying/address"
import { AgentManager, AgentOwner, AgentVault } from "../../../src/orm/entities/agent"
import { AgentVaultSettings, CollateralTypeAdded } from "../../../src/orm/entities"
import { CoreVaultManagerSettings } from "../../../src/orm/entities/state/settings"
import { randomNativeAddress, randomString, randomUnderlyingAddress } from "../utils"
import { EventGeneration } from "./generate"
import { EVENTS } from "../../../src/config"
import type { Event } from "../../../src/indexer/eventlib/event-scraper"
import type { EventNameToEventArgs } from "./types"


export class EventFixture extends EventGeneration {
  events: EventInterface

  constructor(public readonly orm: ORM) {
    super(orm)
    this.events = new EventInterface()
  }

  async storeInitialCoreVaultManagerSettings(fasset: FAssetType = FAssetType.FXRP): Promise<void> {
    await this.orm.em.transactional(async em => {
      const vaultManager = em.create(CoreVaultManagerSettings, {
        fasset,
        escrowAmount: BigInt(0),
        escrowEndTimeSeconds: 1,
        minimalAmount: BigInt(0),
        chainPaymentFee: BigInt(0)
      })
      em.persist(vaultManager)
    })
  }

  async storeInitialAgents(fasset: FAssetType = FAssetType.FXRP, settings = false): Promise<AgentVault[]> {
    const agents: AgentVault[] = []
    await this.orm.em.transactional(async (em) => {
      const managerAddress = em.create(EvmAddress, { hex: randomNativeAddress() })
      const agentManager = em.create(AgentManager, {
        address: managerAddress,
        name: randomString(5),
        description: randomString(10),
        iconUrl: 'http://localhost:3000/awesome/pic.png'
      })
      const ownerAddress = em.create(EvmAddress, { hex: randomNativeAddress() })
      const agentOwner = em.create(AgentOwner, { address: ownerAddress, manager: agentManager })
      const vaultAddress = em.create(EvmAddress, { hex: randomNativeAddress() })
      const underlyingVaultAddress = em.create(UnderlyingAddress, { text: randomUnderlyingAddress() })
      const collateralPoolAddress = em.create(EvmAddress, { hex: randomNativeAddress() })
      const collateralPoolTokenAddress = em.create(EvmAddress, { hex: randomNativeAddress() })
      const agentVault = em.create(AgentVault, {
        fasset, address: vaultAddress, underlyingAddress: underlyingVaultAddress,
        collateralPool: collateralPoolAddress, collateralPoolToken: collateralPoolTokenAddress,
        owner: agentOwner, destroyed: false
      })
      if (settings) {
        const collateralTypeAdded = await em.findOneOrFail(CollateralTypeAdded, { collateralClass: 1 })
        em.create(AgentVaultSettings, {
          agentVault,
          feeBIPS: BigInt(0),
          poolFeeShareBIPS: BigInt(0),
          collateralToken: collateralTypeAdded,
          poolExitCollateralRatioBIPS: BigInt(0),
          mintingVaultCollateralRatioBIPS: BigInt(0),
          mintingPoolCollateralRatioBIPS: BigInt(0),
          buyFAssetByAgentFactorBIPS: BigInt(0),
          redemptionPoolFeeShareBIPS: BigInt(0)
        })
      }
      agents.push(agentVault)
    })
    return agents
  }

  async generateEvent(name: keyof EventNameToEventArgs, source?: string, args: any[] = []): Promise<Event> {
    const topic = this.events.getEventTopics(name, Object.values(this.events.interfaces).flat())[0]
    return { name, args: await this.generateEventArgs(name, args), ...this.generateEventWithoutArgs(source), topic }
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
      } case EVENTS.ASSET_MANAGER.AGENT_VAULT_DESTROY_ANNOUNCED: {
        return this.generateAgentVaultDestroyAnnounced()
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
      } case EVENTS.ASSET_MANAGER.EMERGENCY_PAUSE_TRIGGERED: {
        return this.generateEmergencyPauseTriggered()
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
      } case EVENTS.COLLATERAL_POOL.CP_ENTERED: {
        return this.generateCPEntered()
      } case EVENTS.COLLATERAL_POOL.CP_EXITED: {
        return this.generateCPExited()
      } case EVENTS.COLLATERAL_POOL.CP_CLAIMED_REWARD: {
        return this.generateCPClaimedReward()
      } case EVENTS.COLLATERAL_POOL.CP_FEES_WITHDRAWN: {
        return this.generateCPFeesWithdrawn()
      } case EVENTS.COLLATERAL_POOL.CP_FEE_DEBT_CHANGED: {
        return this.generateCPFeeDebtChanged()
      } case EVENTS.COLLATERAL_POOL.CP_FEE_DEBT_PAID: {
        return this.generateCPFeeDebtPaid()
      } case EVENTS.COLLATERAL_POOL.CP_PAID_OUT: {
        return this.generateCPPaidOut()
      } case EVENTS.COLLATERAL_POOL.CP_SELF_CLOSE_EXITED: {
        return this.generateCPSelfCloseExited()
      }
    }
  }
}