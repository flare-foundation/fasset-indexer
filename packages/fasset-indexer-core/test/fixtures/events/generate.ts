import { ORM } from "../../../src/orm"
import { CollateralTypeAdded } from "../../../src/orm/entities/events/token"
import { AgentManager, AgentVault } from "../../../src/orm/entities/agent"
import { CollateralReserved } from "../../../src/orm/entities/events/minting"
import { RedemptionRequested } from "../../../src/orm/entities/events/redemption"
import { RedemptionTicketCreated } from "../../../src/orm/entities/events/redemption-ticket"
import {
  ReturnFromCoreVaultRequested,
  TransferToCoreVaultStarted
} from "../../../src/orm/entities/events/core-vault"
import {
  randomBoolean,
  randomChoice,
  randomHash,
  randomHex,
  randomNativeAddress,
  randomNumber,
  randomString,
  randomUnderlyingAddress
} from "../utils"
import { AGENT_SETTINGS, ASSET_MANAGERS, WNAT_TOKEN } from "../constants"
import type { Event } from "../../../src/indexer/eventlib/types"
import type {
  AgentVaultCreatedEvent,
  CollateralTypeAddedEvent,
  AgentSettingChangedEvent,
  CollateralReservedEvent,
  AgentDestroyedEvent,
  SelfCloseEvent,
  MintingExecutedEvent,
  MintingPaymentDefaultEvent,
  CollateralReservationDeletedEvent,
  RedemptionRequestedEvent,
  RedemptionPerformedEvent,
  RedemptionDefaultEvent,
  RedemptionPaymentBlockedEvent,
  RedemptionPaymentFailedEvent,
  RedemptionRejectedEvent,
  RedemptionRequestIncompleteEvent,
  RedeemedInCollateralEvent,
  LiquidationStartedEvent,
  LiquidationPerformedEvent,
  FullLiquidationStartedEvent,
  LiquidationEndedEvent,
  AvailableAgentExitedEvent,
  AgentAvailableEvent,
  CurrentUnderlyingBlockUpdatedEvent,
  AgentPingEvent,
  AgentPingResponseEvent,
  SelfMintEvent,
  RedemptionTicketCreatedEvent,
  RedemptionTicketUpdatedEvent,
  RedemptionTicketDeletedEvent,
  CoreVaultRedemptionRequestedEvent,
  ReturnFromCoreVaultCancelledEvent,
  ReturnFromCoreVaultConfirmedEvent,
  ReturnFromCoreVaultRequestedEvent,
  TransferToCoreVaultStartedEvent,
  TransferToCoreVaultSuccessfulEvent,
  TransferToCoreVaultDefaultedEvent,
  SettingChangedEvent,
  AgentDestroyAnnouncedEvent
} from "../../../chain/typechain/assetManager/IAssetManager__latest"
import type { TransferEvent } from "../../../chain/typechain/IERC20"
import type { SettingsUpdatedEvent } from "../../../chain/typechain/ICoreVaultManager"
import type { EmergencyPauseTriggeredEvent } from "../../../chain/typechain/assetManager/IAssetManager__initial"
import type {
  CPClaimedRewardEvent,
  CPEnteredEvent,
  CPExitedEvent,
  CPFeeDebtChangedEvent,
  CPFeeDebtPaidEvent,
  CPFeesWithdrawnEvent,
  CPPaidOutEvent,
  CPSelfCloseExitedEvent
} from "../../../chain/typechain/collateralPool/ICollateralPool__latest"
import type {
  EnteredEvent,
  ExitedEvent
} from "../../../chain/typechain/collateralPool/ICollateralPool__initial"
import type { PersonalAccountCreatedEvent } from "../../../chain/typechain/smartAccount/IMasterAccountController"
import type { FAssetIface } from "../../../src/shared"

export class EventGeneration {

  constructor(public readonly orm: ORM) { }

  protected generateEventWithoutArgs(topic: string, sourcename: FAssetIface, source?: string): Omit<Event, 'name' | 'args'> {
      return {
        topic, sourcename,
        index: randomNumber(1, 1e6),
        source: source ?? randomChoice(ASSET_MANAGERS),
        block: {
          index: randomNumber(1, 1e6),
          timestamp: Math.floor(Date.now() / 1000)
        },
        transaction: {
          index: randomNumber(1, 1e6),
          source: randomNativeAddress(),
          hash: randomHash(),
          target: randomNativeAddress(),
          value: BigInt(randomNumber(1, 1e20)),
          gasUsed: BigInt(randomNumber(1, 1e8)),
          gasPrice: BigInt(randomNumber(1, 1e13)),
          gasLimit: BigInt(1e13),
          nonce: randomNumber(1, 1000),
          type: 1
        }
      }
    }

  protected async generateSettingChanged(name: string): Promise<SettingChangedEvent.OutputTuple> {
    return [name, BigInt(randomNumber(1e2, 1e4))]
  }

  protected async generateCollateralTypeAdded(): Promise<CollateralTypeAddedEvent.OutputTuple> {
    return [
      BigInt(1),
      randomNativeAddress(),
      BigInt(randomNumber(5, 18)),
      true,
      randomChoice(['BTC', 'XRP', 'DOGE']),
      randomChoice(['USDC', 'USDT', 'ETH']),
      BigInt(randomNumber(13_000, 14_000)),
      BigInt(randomNumber(25_000, 30_000))
    ]
  }

  protected async generateAgentVaultCreated(): Promise<AgentVaultCreatedEvent.OutputTuple> {
    const struct = {
      collateralPool: randomNativeAddress(),
      collateralPoolToken: randomNativeAddress(),
      underlyingAddress: randomUnderlyingAddress(),
      vaultCollateralToken: await this.getRandomCollateralType(),
      poolWNatToken: WNAT_TOKEN,
      feeBIPS: BigInt(randomNumber(10, 9999)),
      poolFeeShareBIPS: BigInt(randomNumber(10, 9999)),
      mintingVaultCollateralRatioBIPS: BigInt(randomNumber(15_000, 20_000)),
      mintingPoolCollateralRatioBIPS: BigInt(randomNumber(14_000, 19_000)),
      buyFAssetByAgentFactorBIPS: BigInt(randomNumber(9000, 11000)),
      poolExitCollateralRatioBIPS: BigInt(randomNumber(14_000, 25_000)),
      redemptionPoolFeeShareBIPS: BigInt(randomNumber(1, 10_000))
    }
    return {
      0: await this.getRandomAgentManager(),
      1: randomNativeAddress(),
      creationData: [
        struct.collateralPool,
        struct.collateralPoolToken,
        struct.underlyingAddress,
        struct.vaultCollateralToken,
        struct.poolWNatToken,
        struct.feeBIPS,
        struct.poolFeeShareBIPS,
        struct.mintingVaultCollateralRatioBIPS,
        struct.mintingPoolCollateralRatioBIPS,
        struct.buyFAssetByAgentFactorBIPS,
        struct.poolExitCollateralRatioBIPS,
        struct.redemptionPoolFeeShareBIPS,
      ]
    } as any
  }

  protected async generateAgentVaultDestroyAnnounced(): Promise<AgentDestroyAnnouncedEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      BigInt(randomNumber(10, 9999))
    ]
  }

  protected async generateAgentSettingsChanged(): Promise<AgentSettingChangedEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      randomChoice(AGENT_SETTINGS),
      BigInt(randomNumber(10, 9999))
    ]
  }

  protected async generateAgentDestroyed(): Promise<AgentDestroyedEvent.OutputTuple> {
    return [await this.getRandomAgentVault()]
  }

  protected async generateSelfClose(): Promise<SelfCloseEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      BigInt(randomNumber(1000, 1e12)),
    ]
  }

  protected async generateCollateralReserved(): Promise<CollateralReservedEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      randomNativeAddress(),
      BigInt(randomNumber(1, 1e9)),
      BigInt(randomNumber(1e6, 1e9)),
      BigInt(randomNumber(1e2, 1e4)),
      BigInt(randomNumber(1, 1e6)),
      BigInt(randomNumber(1, 1e6)),
      BigInt(Date.now()),
      randomUnderlyingAddress(),
      randomHash(),
      randomNativeAddress(),
      BigInt(1e17)
    ]
  }

  protected async generateMintingExecuted(): Promise<MintingExecutedEvent.OutputTuple> {
    const collateralReserved = await this.getRandomCollateralReserved()
    return [
      collateralReserved.agentVault.address.hex,
      BigInt(collateralReserved.collateralReservationId),
      BigInt(collateralReserved.valueUBA),
      BigInt(collateralReserved.feeUBA),
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateMintingPaymentDefault(): Promise<MintingPaymentDefaultEvent.OutputTuple> {
    const collateralReserved = await this.getRandomCollateralReserved()
    return [
      collateralReserved.agentVault.address.hex,
      collateralReserved.minter.hex,
      BigInt(collateralReserved.collateralReservationId),
      collateralReserved.valueUBA
    ]
  }

  protected async generateCollateralReservationDeleted(): Promise<CollateralReservationDeletedEvent.OutputTuple> {
    const collateralReserved = await this.getRandomCollateralReserved()
    return [
      collateralReserved.agentVault.address.hex,
      collateralReserved.minter.hex,
      BigInt(collateralReserved.collateralReservationId),
      collateralReserved.valueUBA
    ]
  }

  protected async generateSelfMint(): Promise<SelfMintEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      randomBoolean(),
      BigInt(randomNumber(1, 1e6)),
      BigInt(randomNumber(1, 1e6)),
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateRedemptionRequested(): Promise<RedemptionRequestedEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      randomNativeAddress(),
      BigInt(randomNumber(1, 1e9)),
      randomUnderlyingAddress(),
      BigInt(randomNumber(1, 1e8)),
      BigInt(randomNumber(1, 1e4)),
      BigInt(randomNumber(1, 1e6)),
      BigInt(randomNumber(1, 1e6)),
      BigInt(Date.now()),
      randomHash(),
      randomNativeAddress(),
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateRedemptionPerformed(): Promise<RedemptionPerformedEvent.OutputTuple> {
    const redemptionRequested = await this.getRandomRedemptionRequest()
    return [
      redemptionRequested.agentVault.address.hex,
      redemptionRequested.redeemer.hex,
      BigInt(redemptionRequested.requestId),
      randomHash(),
      redemptionRequested.valueUBA,
      redemptionRequested.feeUBA
    ]
  }

  protected async generateRedemptionDefault(): Promise<RedemptionDefaultEvent.OutputTuple> {
    const redemptionRequested = await this.getRandomRedemptionRequest()
    return [
      redemptionRequested.agentVault.address.hex,
      redemptionRequested.redeemer.hex,
      BigInt(redemptionRequested.requestId),
      redemptionRequested.valueUBA,
      BigInt(randomNumber(1, 1e6)),
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateRedemptionPaymentBlocked(): Promise<RedemptionPaymentBlockedEvent.OutputTuple> {
    const redemptionRequested = await this.getRandomRedemptionRequest()
    return [
      redemptionRequested.agentVault.address.hex,
      redemptionRequested.redeemer.hex,
      BigInt(redemptionRequested.requestId),
      randomHash(),
      redemptionRequested.valueUBA,
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateRedemptionPaymentFailed(): Promise<RedemptionPaymentFailedEvent.OutputTuple> {
    const redemptionRequested = await this.getRandomRedemptionRequest()
    return [
      redemptionRequested.agentVault.address.hex,
      redemptionRequested.redeemer.hex,
      BigInt(redemptionRequested.requestId),
      randomHash(),
      redemptionRequested.valueUBA,
      'idk'
    ]
  }

  protected async generateRedemptionRejected(): Promise<RedemptionRejectedEvent.OutputTuple> {
    const redemptionRequested = await this.getRandomRedemptionRequest()
    return [
      redemptionRequested.agentVault.address.hex,
      redemptionRequested.redeemer.hex,
      BigInt(redemptionRequested.requestId),
      redemptionRequested.valueUBA
    ]
  }

  protected async generateRedemptionTicketCreated(): Promise<RedemptionTicketCreatedEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      BigInt(randomNumber(1, 1e6)),
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateRedemptionTicketUpdated(): Promise<RedemptionTicketUpdatedEvent.OutputTuple> {
    const redemptionTicketCreated = await this.getRandomRedemptionTicketCreated()
    return [
      redemptionTicketCreated.agentVault.address.hex,
      BigInt(redemptionTicketCreated.redemptionTicketId),
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateRedemptionTicketDeleted(): Promise<RedemptionTicketDeletedEvent.OutputTuple> {
    const redemptionTicketCreated = await this.getRandomRedemptionTicketCreated()
    return [
      redemptionTicketCreated.agentVault.address.hex,
      BigInt(redemptionTicketCreated.redemptionTicketId)
    ]
  }

  protected async generateRedeemedInCollateral(): Promise<RedeemedInCollateralEvent.OutputTuple> {
    const agentVault = await this.getRandomAgentVault()
    return [
      agentVault,
      randomNativeAddress(),
      BigInt(randomNumber(1e6, 1e12)),
      BigInt(randomNumber(1e6, 1e18))
    ]
  }

  protected async generateRedemptionRequestIncomplete(): Promise<RedemptionRequestIncompleteEvent.OutputTuple> {
    return [randomNativeAddress(), BigInt(randomNumber(1, 1e9))]
  }

  protected async generateLiquidationStarted(): Promise<LiquidationStartedEvent.OutputTuple> {
    return [await this.getRandomAgentVault(), BigInt(Date.now())]
  }

  protected async generateLiquidationPerformed(): Promise<LiquidationPerformedEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      randomNativeAddress(),
      BigInt(randomNumber(1, 1e9)),
      BigInt(randomNumber(1e5, 1e9)),
      BigInt(randomNumber(1e5, 1e9)),
    ]
  }

  protected async generateFullLiquidationStarted(): Promise<FullLiquidationStartedEvent.OutputTuple> {
    return [await this.getRandomAgentVault(), BigInt(Date.now())]
  }

  protected async generateLiquidationEnded(): Promise<LiquidationEndedEvent.OutputTuple> {
    return [await this.getRandomAgentVault()]
  }

  protected async generateAvailableAgentExited(): Promise<AvailableAgentExitedEvent.OutputTuple> {
    return [await this.getRandomAgentVault()]
  }

  protected async generateAgentEnteredAvailable(): Promise<AgentAvailableEvent.OutputTuple> {
    return [
      await this.getRandomAgentVault(),
      BigInt(randomNumber(1, 1e6)),
      BigInt(randomNumber(11_000, 15_000)),
      BigInt(randomNumber(11_000, 20_000)),
      BigInt(randomNumber(1, 1e3))
    ]
  }

  protected async generateEmergencyPauseTriggered(): Promise<EmergencyPauseTriggeredEvent.OutputTuple> {
    return [ BigInt(randomNumber(100, 100000)) ]
  }

  protected async generateCollateralPoolEnter(): Promise<EnteredEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e6, 1e12)),
      BigInt(randomNumber(1e6, 1e12)),
      BigInt(0),
      BigInt(0),
      BigInt(randomNumber(1e6, 1e12))
    ]
  }

  protected async generateCollateralPoolExit(): Promise<ExitedEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e6, 1e12)),
      BigInt(randomNumber(1e6, 1e12)),
      BigInt(0),
      BigInt(0),
      BigInt(randomNumber(1e6, 1e12))
    ]
  }


  protected async generateTransfer(): Promise<TransferEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      randomNativeAddress(),
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateAgentPing(): Promise<AgentPingEvent.OutputTuple> {
    const agentVault = await this.getRandomAgentVault()
    return [
      agentVault,
      randomNativeAddress(),
      BigInt(randomNumber(1, 1e6))
    ]
  }

  protected async generateAgentPingResponse(): Promise<AgentPingResponseEvent.OutputTuple> {
    const agentVault = await this.getRandomAgentVault()
    return [
      agentVault,
      '',
      BigInt(randomNumber(1, 1e6)),
      randomString(100)
    ]
  }

  protected async generateCurrentUnderlyingBlockUpdated(): Promise<CurrentUnderlyingBlockUpdatedEvent.OutputTuple> {
    return [
      BigInt(randomNumber(1, 1e8)),
      BigInt(randomNumber(1, 1e8)),
      BigInt(randomNumber(1, 1e8))
    ]
  }

  protected async generateTransferToCoreVaultStarted(): Promise<TransferToCoreVaultStartedEvent.OutputTuple> {
    const agentVault = await this.getRandomAgentVault()
    return [
      agentVault,
      BigInt(randomNumber(0, 1e8)),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateTransferToCoreVaultSuccessful(): Promise<TransferToCoreVaultSuccessfulEvent.OutputTuple> {
    const transferToCoreVaultStarted = await this.getRandomTransferToCoreVaultStarted()
    return [
      transferToCoreVaultStarted.agentVault.address.hex,
      BigInt(transferToCoreVaultStarted.transferRedemptionRequestId),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateTransferToCoreVaultDefaulted(): Promise<TransferToCoreVaultDefaultedEvent.OutputTuple> {
    const transferToCoreVaultStarted = await this.getRandomTransferToCoreVaultStarted()
    return [
      transferToCoreVaultStarted.agentVault.address.hex,
      BigInt(transferToCoreVaultStarted.transferRedemptionRequestId),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateReturnFromCoreVaultRequested(): Promise<ReturnFromCoreVaultRequestedEvent.OutputTuple> {
    const agentVault = await this.getRandomAgentVault()
    return [
      agentVault,
      BigInt(randomNumber(1, 1e5)),
      randomHex(32),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateReturnFromCoreVaultConfirmed(): Promise<ReturnFromCoreVaultConfirmedEvent.OutputTuple> {
    const returnFromCoreVaultRequested = await this.getRandomReturnFromCoreVaultRequested()
    return [
      returnFromCoreVaultRequested.agentVault.address.hex,
      BigInt(returnFromCoreVaultRequested.requestId),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateReturnFromCoreVaultCancelled(): Promise<ReturnFromCoreVaultCancelledEvent.OutputTuple> {
    const returnFromCoreVaultRequested = await this.getRandomReturnFromCoreVaultRequested()
    return [returnFromCoreVaultRequested.agentVault.address.hex, BigInt(returnFromCoreVaultRequested.requestId)]
  }

  protected async generateCoreVaultRedemptionRequested(): Promise<CoreVaultRedemptionRequestedEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      randomUnderlyingAddress(),
      randomHash(),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateSettingsUpdated(): Promise<SettingsUpdatedEvent.OutputTuple> {
    return [
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e6))
    ]
  }

  // collateral pool v2

  protected async generateCPClaimedReward(): Promise<CPClaimedRewardEvent.OutputTuple> {
    return [
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(0, 1))
    ]
  }

  protected async generateCPEntered(): Promise<CPEnteredEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e8, 1e9))
    ]
  }

  protected async generateCPExited(): Promise<CPExitedEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12)),
    ]
  }

  protected async generateCPFeeDebtChanged(): Promise<CPFeeDebtChangedEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateCPFeeDebtPaid(): Promise<CPFeeDebtPaidEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateCPFeesWithdrawn(): Promise<CPFeesWithdrawnEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateCPPaidOut(): Promise<CPPaidOutEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generateCPSelfCloseExited(): Promise<CPSelfCloseExitedEvent.OutputTuple> {
    return [
      randomNativeAddress(),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12)),
      BigInt(randomNumber(1e4, 1e12))
    ]
  }

  protected async generatePersonalAccountCreated(): Promise<PersonalAccountCreatedEvent.OutputTuple> {
    return [randomNativeAddress(), randomUnderlyingAddress()]
  }

  /////////////////////////////////////////////////////////////////////////////
  // utils

  private async getRandomCollateralType(): Promise<string> {
    const vaultCollateralToken = await this.orm.em.fork().findOne(CollateralTypeAdded, { collateralClass: 1 }, { populate: ['address'] })
    if (vaultCollateralToken === null) throw new Error('CollateralType not found')
    return vaultCollateralToken.address.hex
  }

  private async getRandomAgentManager(): Promise<string> {
    const agentManager = await this.orm.em.fork().findAll(AgentManager, { populate: ['address'] })
    if (agentManager === null) throw new Error('AgentManager not found')
    return randomChoice(agentManager).address.hex
  }

  private async getRandomAgentVault(): Promise<string> {
    const agentVault = await this.orm.em.fork().findAll(AgentVault, { populate: ['address'] })
    if (agentVault === null || agentVault.length === 0) throw new Error('AgentVault not found')
    return randomChoice(agentVault).address.hex
  }

  private async getRandomCollateralReserved(): Promise<CollateralReserved> {
    const collateralReserved = await this.orm.em.fork().findAll(CollateralReserved, { populate: ['agentVault.address', 'minter'] })
    if (collateralReserved === null || collateralReserved.length === 0) throw new Error('CollateralReserved not found')
    return randomChoice(collateralReserved)
  }

  private async getRandomRedemptionRequest(): Promise<RedemptionRequested> {
    const redemptionRequest = await this.orm.em.fork().findAll(RedemptionRequested, { populate: ['agentVault.address', 'redeemer'] })
    if (redemptionRequest === null || redemptionRequest.length === 0) throw new Error('RedemptionRequested not found')
    return randomChoice(redemptionRequest)
  }

  private async getRandomRedemptionTicketCreated(): Promise<RedemptionTicketCreated> {
    const redemptionTicketCreated = await this.orm.em.fork().findAll(RedemptionTicketCreated, { populate: ['agentVault.address'] })
    if (redemptionTicketCreated === null || redemptionTicketCreated.length === 0) throw new Error('RedemptionTicketCreated not found')
    return randomChoice(redemptionTicketCreated)
  }

  private async getRandomTransferToCoreVaultStarted(): Promise<TransferToCoreVaultStarted> {
    const transferToCoreVaultStarted = await this.orm.em.fork().findAll(TransferToCoreVaultStarted, { populate: ['agentVault.address'] })
    if (transferToCoreVaultStarted === null || transferToCoreVaultStarted.length === 0) throw new Error('TransferToCoreVaultStarted not found')
    return randomChoice(transferToCoreVaultStarted)
  }

  private async getRandomReturnFromCoreVaultRequested(): Promise<ReturnFromCoreVaultRequested> {
    const returnFromCoreVaultRequested = await this.orm.em.fork().findAll(ReturnFromCoreVaultRequested, { populate: ['agentVault.address'] })
    if (returnFromCoreVaultRequested === null || returnFromCoreVaultRequested.length === 0) throw new Error('ReturnFromCoreVaultRequested not found')
    return randomChoice(returnFromCoreVaultRequested)
  }
}