import { describe, beforeEach, afterEach, it } from "mocha"
import { use, expect } from "chai"
import chaiAsPromised from "chai-as-promised"
import { unlink } from "fs"
import { FAssetType } from "../src"
import { EvmLog } from "../src/orm/entities/evm/log"
import { AgentVaultCreated, AgentDestroyAnnounced } from "../src/orm/entities/events/agent"
import { AgentVaultSettings } from "../src/orm/entities/state/agent"
import { CollateralTypeAdded, ERC20Transfer } from "../src/orm/entities/events/token"
import { EventFixture } from "./fixtures/events/event"
import {
  CollateralReservationDeleted, CollateralReserved,
  MintingExecuted, MintingPaymentDefault,
  SelfMint
} from "../src/orm/entities/events/minting"
import {
  RedeemedInCollateral,
  RedemptionDefault, RedemptionPaymentBlocked, RedemptionPaymentFailed,
  RedemptionPerformed, RedemptionRejected, RedemptionRequested
} from "../src/orm/entities/events/redemption"
import {
  FullLiquidationStarted, LiquidationEnded,
  LiquidationPerformed, LiquidationStarted
} from "../src/orm/entities/events/liquidation"
import { AgentPing, AgentPingResponse } from "../src/orm/entities/events/ping"
import { CurrentUnderlyingBlockUpdated } from "../src/orm/entities/events/system"
import { TokenBalance } from "../src/orm/entities/state/balance"
import { EventStorer } from "../src/indexer/eventlib/event-storer"
import { Context } from "../src/context/context"
import { EVENTS } from "../src/config/constants"
import {
  RedemptionTicketCreated, RedemptionTicketDeleted, RedemptionTicketUpdated
} from "../src/orm/entities/events/redemption-ticket"
import { RedemptionTicket } from "../src/orm/entities/state/redemption-ticket"
import { TestConfigLoader } from "./fixtures/config"
import {
  CoreVaultRedemptionRequested, ReturnFromCoreVaultCancelled, ReturnFromCoreVaultConfirmed,
  ReturnFromCoreVaultRequested, TransferToCoreVaultDefaulted, TransferToCoreVaultStarted,
  TransferToCoreVaultSuccessful
} from "../src/orm/entities/events/core-vault"
import { CoreVaultManagerSettingsUpdated } from "../src/orm/entities/events/core-vault-manager"
import { AssetManagerSettings, EmergencyPauseTriggered } from "../src/orm/entities"
import { CoreVaultManagerSettings } from "../src/orm/entities/state/settings"
import {
  CPClaimedReward, CPEntered, CPExited, CPFeeDebtChanged,
  CPFeeDebtPaid, CPFeesWithdrawn, CPPaidOut, CPSelfCloseExited
} from "../src/orm/entities/events/collateral-pool-v2"


const ASSET_MANAGER_FXRP = "AssetManager_FTestXRP"
const ASSET_MANAGER_FBTC = "AssetManager_FTestBTC"
const CORE_VAULT_MANAGER_FXRP = "CoreVaultManager_FTestXRP"

use(chaiAsPromised)

describe("FAsset evm events", () => {
  let context: Context
  let fixture: EventFixture
  let storer: EventStorer

  beforeEach(async () => {
    const loader = new TestConfigLoader()
    context = await Context.create(loader)
    fixture = new EventFixture(context.orm)
    storer = new EventStorer(context.orm, context)
  })

  afterEach(async () => {
    await context.orm.close(true)
    unlink(context.config.dbConfig.dbName!, () => {})
  })

  it("should store asset manager settings update", async () => {
    const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
    const em = context.orm.em.fork()
    let assetManagerSettings = em.create(AssetManagerSettings, {
      fasset: FAssetType.FXRP, lotSizeAmg: BigInt(10)
    })
    await em.persistAndFlush(assetManagerSettings)
    const assetManagerSettingsChanged = await fixture.generateEvent(
      EVENTS.ASSET_MANAGER.SETTING_CHANGED, assetManager, ['lotSizeAMG'])
    await storer.processEventUnsafe(em, assetManagerSettingsChanged)
    assetManagerSettings = await em.findOneOrFail(AssetManagerSettings, { fasset: FAssetType.FXRP })
    expect(assetManagerSettings).to.exist
    expect(assetManagerSettings.fasset).to.equal(FAssetType.FXRP)
    expect(assetManagerSettings.lotSizeAmg).to.equal(assetManagerSettingsChanged.args[1])
    expect(assetManagerSettings.lotSizeAmg).to.not.equal(BigInt(10))
  })

  it("should store erc20 transfers", async () => {
    const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
    const erc20Transfer = await fixture.generateEvent(EVENTS.ERC20.TRANSFER, assetManager)
    const em = context.orm.em.fork()
    await storer.processEventUnsafe(em, erc20Transfer)
    const erc20TransferEntity = await em.findOneOrFail(EvmLog, { index: erc20Transfer.index },
      { populate: ['block', 'address']}
    )
    expect(erc20TransferEntity).to.exist
    expect(erc20TransferEntity.name).to.equal(EVENTS.ERC20.TRANSFER)
    expect(erc20TransferEntity.address.hex).to.equal(assetManager)
    expect(erc20TransferEntity.block.index).to.equal(erc20Transfer.block.index)
    // check that erc20 transfer was stored
    const erc20TransferStored = await em.findOneOrFail(ERC20Transfer,
      { evmLog: { index: erc20Transfer.index, block: { index: erc20Transfer.block.index }}},
      { populate: ['evmLog.block', 'evmLog.address', 'from', 'to']}
    )
    expect(erc20TransferStored).to.exist
    expect(erc20TransferStored.evmLog.index).to.equal(erc20Transfer.index)
    expect(erc20TransferStored.evmLog.block.index).to.equal(erc20Transfer.block.index)
    expect(erc20TransferStored.evmLog.address.hex).to.equal(assetManager)
    expect(erc20TransferStored.from.hex).to.equal(erc20Transfer.args[0])
    expect(erc20TransferStored.to.hex).to.equal(erc20Transfer.args[1])
    expect(erc20TransferStored.value).to.equal(erc20Transfer.args[2])
    // check that balance was updated for sender
    const tokenBalance = await em.findOneOrFail(TokenBalance,
      { token: { hex: assetManager }, holder: { hex: erc20Transfer.args[0] }},
      { populate: ['token', 'holder'] }
    )
    expect(tokenBalance).to.exist
    expect(tokenBalance.token.hex).to.equal(assetManager)
    expect(tokenBalance.holder.hex).to.equal(erc20Transfer.args[0])
    expect(tokenBalance.amount).to.equal(-erc20Transfer.args[2])
    // check that balance was updated for receiver
    const tokenBalanceReceiver = await em.findOneOrFail(TokenBalance,
      { token: { hex: assetManager }, holder: { hex: erc20Transfer.args[1] }},
      { populate: ['token', 'holder'] }
    )
    expect(tokenBalanceReceiver).to.exist
    expect(tokenBalanceReceiver.token.hex).to.equal(assetManager)
    expect(tokenBalanceReceiver.holder.hex).to.equal(erc20Transfer.args[1])
    expect(tokenBalanceReceiver.amount).to.equal(erc20Transfer.args[2])
  })

  it("should store agent created event", async () => {
    const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
    const em = context.orm.em.fork()
    // add initial collateral token type
    const collateralTypeAddedEvent = await fixture.generateEvent(
      EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED, assetManager)
    await storer.processEvent(collateralTypeAddedEvent)
    const collateralTypeAdded = await em.findOneOrFail(CollateralTypeAdded,
      { evmLog: { index: collateralTypeAddedEvent.index, block: { index: collateralTypeAddedEvent.block.index }}},
      { populate: ['evmLog.block', 'address'] })
    expect(collateralTypeAdded).to.exist
    expect(collateralTypeAdded.evmLog.index).to.equal(collateralTypeAddedEvent.index)
    expect(collateralTypeAdded.evmLog.block.index).to.equal(collateralTypeAddedEvent.block.index)
    expect(collateralTypeAdded.address.hex).to.equal(collateralTypeAddedEvent.args[1])
    expect(collateralTypeAdded.fasset).to.equal(FAssetType.FXRP)
    // store agents
    await fixture.storeInitialAgents(FAssetType.FXRP, true)
    // create agent
    const agentVaultCreatedEvent = await fixture.generateEvent(
      EVENTS.ASSET_MANAGER.AGENT_VAULT_CREATED, assetManager)
    await storer.processEventUnsafe(em, agentVaultCreatedEvent)
    // check that event was logged and agent vault created
    const agentVaultCreated = await em.findOneOrFail(AgentVaultCreated,
      { evmLog: { index: agentVaultCreatedEvent.index, block: { index: agentVaultCreatedEvent.block.index }}},
      { populate: ['evmLog.block', 'agentVault', 'agentVault.address'] })
    expect(agentVaultCreated).to.exist
    expect(agentVaultCreated.evmLog.index).to.equal(agentVaultCreatedEvent.index)
    expect(agentVaultCreated.evmLog.block.index).to.equal(agentVaultCreatedEvent.block.index)
    expect(agentVaultCreated.agentVault.address.hex).to.equal(agentVaultCreatedEvent.args[1])
    expect(agentVaultCreated.agentVault.collateralPool.hex).to.equal(agentVaultCreatedEvent.args.creationData[0])
    expect(agentVaultCreated.agentVault.collateralPoolToken.hex).to.equal(agentVaultCreatedEvent.args.creationData[1])
    expect(agentVaultCreated.agentVault.underlyingAddress.text).to.equal(agentVaultCreatedEvent.args.creationData[2])
    // check that agent vault settings were created
    const agentVaultSettings = await em.findOneOrFail(AgentVaultSettings, { agentVault: agentVaultCreated.agentVault },
      { populate: ['agentVault', 'collateralToken'] })
    expect(agentVaultSettings).to.exist
    expect(agentVaultSettings.agentVault).to.equal(agentVaultCreated.agentVault)
    expect(agentVaultSettings.collateralToken).to.equal(collateralTypeAdded)
    expect(agentVaultSettings.feeBIPS).to.equal(agentVaultCreatedEvent.args.creationData[5])
    expect(agentVaultSettings.redemptionPoolFeeShareBIPS).to.equal(agentVaultCreatedEvent.args.creationData[11])
  })

  it("should store all minting events", async () => {
    const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
    await fixture.storeInitialAgents()
    const em = context.orm.em.fork()
    // collateral reserved event
    const collateralReservedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED, assetManager)
    await storer.processEventUnsafe(em, collateralReservedEvent)
    const collateralReserved = await em.findOneOrFail(CollateralReserved,
      { evmLog: { index: collateralReservedEvent.index, block: { index: collateralReservedEvent.block.index }}},
      { populate: ['evmLog.block', 'agentVault.address', 'minter', 'paymentAddress', 'executor'] })
    expect(collateralReserved).to.exist
    expect(collateralReserved.evmLog.index).to.equal(collateralReservedEvent.index)
    expect(collateralReserved.evmLog.block.index).to.equal(collateralReservedEvent.block.index)
    expect(collateralReserved.agentVault.address.hex).to.equal(collateralReservedEvent.args[0])
    expect(collateralReserved.minter.hex).to.equal(collateralReservedEvent.args[1])
    expect(collateralReserved.collateralReservationId).to.equal(Number(collateralReservedEvent.args[2]))
    expect(collateralReserved.valueUBA).to.equal(collateralReservedEvent.args[3])
    expect(collateralReserved.feeUBA).to.equal(collateralReservedEvent.args[4])
    expect(collateralReserved.firstUnderlyingBlock).to.equal(Number(collateralReservedEvent.args[5]))
    expect(collateralReserved.lastUnderlyingBlock).to.equal(Number(collateralReservedEvent.args[6]))
    expect(collateralReserved.lastUnderlyingTimestamp).to.equal(Number(collateralReservedEvent.args[7]))
    expect(collateralReserved.paymentAddress.text).to.equal(collateralReservedEvent.args[8])
    expect(collateralReserved.paymentReference).to.equal(collateralReservedEvent.args[9])
    expect(collateralReserved.executor.hex).to.equal(collateralReservedEvent.args[10])
    expect(collateralReserved.executorFeeNatWei).to.equal(collateralReservedEvent.args[11])
    // minting executed event
    const mintingExecutedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.MINTING_EXECUTED, assetManager)
    await storer.processEventUnsafe(em, mintingExecutedEvent)
    const mintingExecuted = await em.findOneOrFail(MintingExecuted,
      { evmLog: { index: mintingExecutedEvent.index, block: { index: mintingExecutedEvent.block.index }}},
      { populate: ['evmLog.block', 'collateralReserved'] })
    expect(mintingExecuted).to.exist
    expect(mintingExecuted.evmLog.index).to.equal(mintingExecutedEvent.index)
    expect(mintingExecuted.evmLog.block.index).to.equal(mintingExecutedEvent.block.index)
    expect(mintingExecuted.collateralReserved.collateralReservationId).to.equal(Number(mintingExecutedEvent.args[1]))
    expect(mintingExecuted.poolFeeUBA).to.equal(mintingExecutedEvent.args[4])
    // minting payment default event
    const mintingPaymentDefaultEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.MINTING_PAYMENT_DEFAULT, assetManager)
    await storer.processEventUnsafe(em, mintingPaymentDefaultEvent)
    const mintingPaymentDefault = await em.findOneOrFail(MintingPaymentDefault,
      { evmLog: { index: mintingPaymentDefaultEvent.index, block: { index: mintingPaymentDefaultEvent.block.index }}},
      { populate: ['evmLog.block', 'collateralReserved'] })
    expect(mintingPaymentDefault).to.exist
    expect(mintingPaymentDefault.evmLog.index).to.equal(mintingPaymentDefaultEvent.index)
    expect(mintingPaymentDefault.evmLog.block.index).to.equal(mintingPaymentDefaultEvent.block.index)
    expect(mintingPaymentDefault.collateralReserved.collateralReservationId).to.equal(Number(mintingPaymentDefaultEvent.args[2]))
    // collateral reservation deleted
    const collateralReservationDeletedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_RESERVATION_DELETED, assetManager)
    await storer.processEventUnsafe(em, collateralReservationDeletedEvent)
    const collateralReservationDeleted = await em.findOneOrFail(CollateralReservationDeleted,
      { evmLog: { index: collateralReservationDeletedEvent.index, block: { index: collateralReservationDeletedEvent.block.index }}},
      { populate: ['evmLog.block', 'collateralReserved'] })
    expect(collateralReservationDeleted).to.exist
    expect(collateralReservationDeleted.evmLog.index).to.equal(collateralReservationDeletedEvent.index)
    expect(collateralReservationDeleted.evmLog.block.index).to.equal(collateralReservationDeletedEvent.block.index)
    expect(collateralReservationDeleted.collateralReserved.collateralReservationId).to.equal(Number(collateralReservationDeletedEvent.args[2]))
  })

  it("should store all redemption events", async () => {
    const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
    await fixture.storeInitialAgents()
    const em = context.orm.em.fork()
    // redemption requested event
    const redemptionRequestedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED, assetManager)
    await storer.processEventUnsafe(em, redemptionRequestedEvent)
    const redemptionRequested = await em.findOneOrFail(RedemptionRequested,
      { evmLog: { index: redemptionRequestedEvent.index, block: { index: redemptionRequestedEvent.block.index }}},
      { populate: ['evmLog.block', 'agentVault', 'redeemer', 'paymentAddress', 'executor'] })
    expect(redemptionRequested).to.exist
    expect(redemptionRequested.evmLog.index).to.equal(redemptionRequestedEvent.index)
    expect(redemptionRequested.evmLog.block.index).to.equal(redemptionRequestedEvent.block.index)
    expect(redemptionRequested.redeemer.hex).to.equal(redemptionRequestedEvent.args[1])
    expect(redemptionRequested.requestId).to.equal(Number(redemptionRequestedEvent.args[2]))
    expect(redemptionRequested.paymentAddress.text).to.equal(redemptionRequestedEvent.args[3])
    expect(redemptionRequested.valueUBA).to.equal(redemptionRequestedEvent.args[4])
    expect(redemptionRequested.feeUBA).to.equal(redemptionRequestedEvent.args[5])
    expect(redemptionRequested.firstUnderlyingBlock).to.equal(Number(redemptionRequestedEvent.args[6]))
    expect(redemptionRequested.lastUnderlyingBlock).to.equal(Number(redemptionRequestedEvent.args[7]))
    expect(redemptionRequested.lastUnderlyingTimestamp).to.equal(Number(redemptionRequestedEvent.args[8]))
    expect(redemptionRequested.paymentReference).to.equal(redemptionRequestedEvent.args[9])
    expect(redemptionRequested.executor.hex).to.equal(redemptionRequestedEvent.args[10])
    expect(redemptionRequested.executorFeeNatWei).to.equal(redemptionRequestedEvent.args[11])
    // redemption performed event
    const redemptionPerformedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_PERFORMED, assetManager)
    await storer.processEventUnsafe(em, redemptionPerformedEvent)
    const redemptionPerformed = await em.findOneOrFail(RedemptionPerformed,
      { evmLog: { index: redemptionPerformedEvent.index, block: { index: redemptionPerformedEvent.block.index }}},
      { populate: ['evmLog.block', 'redemptionRequested'] })
    expect(redemptionPerformed).to.exist
    expect(redemptionPerformed.evmLog.index).to.equal(redemptionPerformedEvent.index)
    expect(redemptionPerformed.evmLog.block.index).to.equal(redemptionPerformedEvent.block.index)
    expect(redemptionPerformed.redemptionRequested.redeemer.hex).to.equal(redemptionPerformedEvent.args[1])
    expect(redemptionPerformed.redemptionRequested.requestId).to.equal(Number(redemptionPerformedEvent.args[2]))
    expect(redemptionPerformed.transactionHash).to.equal(redemptionPerformedEvent.args[3])
    expect(redemptionPerformed.spentUnderlyingUBA).to.equal(redemptionPerformedEvent.args[5])
    // redemption default event
    const redemptionDefaultEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_DEFAULT, assetManager)
    await storer.processEventUnsafe(em, redemptionDefaultEvent)
    const redemptionDefault = await em.findOneOrFail(RedemptionDefault,
      { evmLog: { index: redemptionDefaultEvent.index, block: { index: redemptionDefaultEvent.block.index }}},
      { populate: ['evmLog.block', 'redemptionRequested'] })
    expect(redemptionDefault).to.exist
    expect(redemptionDefault.evmLog.index).to.equal(redemptionDefaultEvent.index)
    expect(redemptionDefault.evmLog.block.index).to.equal(redemptionDefaultEvent.block.index)
    expect(redemptionDefault.redemptionRequested.redeemer.hex).to.equal(redemptionDefaultEvent.args[1])
    expect(redemptionDefault.redemptionRequested.requestId).to.equal(Number(redemptionDefaultEvent.args[2]))
    expect(redemptionDefault.redeemedVaultCollateralWei).to.equal(redemptionDefaultEvent.args[4])
    expect(redemptionDefault.redeemedPoolCollateralWei).to.equal(redemptionDefaultEvent.args[5])
    // redemption rejected event
    const redemptionRejectedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_REJECTED, assetManager)
    await storer.processEventUnsafe(em, redemptionRejectedEvent)
    const redemptionRejected = await em.findOneOrFail(RedemptionRejected,
      { evmLog: { index: redemptionRejectedEvent.index, block: { index: redemptionRejectedEvent.block.index }}},
      { populate: ['evmLog.block', 'redemptionRequested'] })
    expect(redemptionRejected).to.exist
    expect(redemptionRejected.evmLog.index).to.equal(redemptionRejectedEvent.index)
    expect(redemptionRejected.evmLog.block.index).to.equal(redemptionRejectedEvent.block.index)
    expect(redemptionRejected.redemptionRequested.requestId).to.equal(Number(redemptionRejectedEvent.args[2]))
    // redemption payment blocked
    const redemptionPaymentBlockedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_BLOCKED, assetManager)
    await storer.processEventUnsafe(em, redemptionPaymentBlockedEvent)
    const redemptionPaymentBlocked = await em.findOneOrFail(RedemptionPaymentBlocked,
      { evmLog: { index: redemptionPaymentBlockedEvent.index, block: { index: redemptionPaymentBlockedEvent.block.index }}},
      { populate: ['evmLog.block', 'redemptionRequested'] })
    expect(redemptionPaymentBlocked).to.exist
    expect(redemptionPaymentBlocked.evmLog.index).to.equal(redemptionPaymentBlockedEvent.index)
    expect(redemptionPaymentBlocked.evmLog.block.index).to.equal(redemptionPaymentBlockedEvent.block.index)
    expect(redemptionPaymentBlocked.redemptionRequested.requestId).to.equal(Number(redemptionPaymentBlockedEvent.args[2]))
    expect(redemptionPaymentBlocked.transactionHash).to.equal(redemptionPaymentBlockedEvent.args[3])
    expect(redemptionPaymentBlocked.spentUnderlyingUBA).to.equal(redemptionPaymentBlockedEvent.args[5])
    // redemption payment failed
    const redemptionPaymentFailedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_FAILED, assetManager)
    await storer.processEventUnsafe(em, redemptionPaymentFailedEvent)
    const redemptionPaymentFailed = await em.findOneOrFail(RedemptionPaymentFailed,
      { evmLog: { index: redemptionPaymentFailedEvent.index, block: { index: redemptionPaymentFailedEvent.block.index }}},
      { populate: ['evmLog.block', 'redemptionRequested'] })
    expect(redemptionPaymentFailed).to.exist
    expect(redemptionPaymentFailed.evmLog.index).to.equal(redemptionPaymentFailedEvent.index)
    expect(redemptionPaymentFailed.evmLog.block.index).to.equal(redemptionPaymentFailedEvent.block.index)
    expect(redemptionPaymentFailed.redemptionRequested.requestId).to.equal(Number(redemptionPaymentFailedEvent.args[2]))
    expect(redemptionPaymentFailed.transactionHash).to.equal(redemptionPaymentFailedEvent.args[3])
    expect(redemptionPaymentFailed.spentUnderlyingUBA).to.equal(redemptionPaymentFailedEvent.args[4])
    expect(redemptionPaymentFailed.failureReason).to.equal(redemptionPaymentFailedEvent.args[5])
  })

  it("should store redeemed in collateral event", async () => {
    const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
    await fixture.storeInitialAgents()
    const em = context.orm.em.fork()
    // redemption requested event
    const redeemedInCollateralEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEEMED_IN_COLLATERAL, assetManager)
    await storer.processEventUnsafe(em, redeemedInCollateralEvent)
    const redeemedInCollateral = await em.findOneOrFail(RedeemedInCollateral,
      { evmLog: { index: redeemedInCollateralEvent.index, block: { index: redeemedInCollateralEvent.block.index }}},
      { populate: ['evmLog.block', 'agentVault.address', 'redeemer'] })
    expect(redeemedInCollateral).to.exist
    expect(redeemedInCollateral.evmLog.index).to.equal(redeemedInCollateralEvent.index)
    expect(redeemedInCollateral.evmLog.block.index).to.equal(redeemedInCollateralEvent.block.index)
    expect(redeemedInCollateral.agentVault.address.hex).to.equal(redeemedInCollateralEvent.args[0])
    expect(redeemedInCollateral.redeemer.hex).to.equal(redeemedInCollateralEvent.args[1])
    expect(redeemedInCollateral.redemptionAmountUBA).to.equal(redeemedInCollateralEvent.args[2])
    expect(redeemedInCollateral.paidVaultCollateralWei).to.equal(redeemedInCollateralEvent.args[3])
  })

  it("should store agent ping", async () => {
    const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
    await fixture.storeInitialAgents(FAssetType.FXRP)
    const em = context.orm.em.fork()
    // agent ping
    const agentPingEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.AGENT_PING, assetManagerXrp)
    await storer.processEventUnsafe(em, agentPingEvent)
    const agentPing = await em.findOneOrFail(AgentPing,
      { evmLog: { index: agentPingEvent.index, block: { index: agentPingEvent.block.index }}},
      { populate: ['evmLog.block', 'agentVault.address', 'sender'] }
    )
    expect(agentPing).to.exist
    expect(agentPing.evmLog.index).to.equal(agentPingEvent.index)
    expect(agentPing.evmLog.block.index).to.equal(agentPingEvent.block.index)
    expect(agentPing.agentVault.address.hex).to.equal(agentPingEvent.args[0])
    expect(agentPing.sender.hex).to.equal(agentPingEvent.args[1])
    expect(agentPing.query).to.equal(agentPingEvent.args[2])
  })

  it("should store agent ping response", async () => {
    const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
    await fixture.storeInitialAgents(FAssetType.FXRP)
    const em = context.orm.em.fork()
    // agent pong
    const agentPingResponseEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.AGENT_PING_RESPONSE, assetManagerXrp)
    await storer.processEventUnsafe(em, agentPingResponseEvent)
    const agentPingResponse = await em.findOneOrFail(AgentPingResponse,
      { evmLog: { index: agentPingResponseEvent.index, block: { index: agentPingResponseEvent.block.index }}},
      { populate: ['evmLog.block', 'agentVault.address'] }
    )
    expect(agentPingResponse).to.exist
    expect(agentPingResponse.evmLog.index).to.equal(agentPingResponseEvent.index)
    expect(agentPingResponse.evmLog.block.index).to.equal(agentPingResponseEvent.block.index)
    expect(agentPingResponse.agentVault.address.hex).to.equal(agentPingResponseEvent.args[0])
    expect(agentPingResponse.query).to.equal(agentPingResponseEvent.args[2])
    expect(agentPingResponse.response).to.equal(agentPingResponseEvent.args[3])
  })

  it("should store current underlying block updated event", async () => {
    const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
    const currentUnderlyingBlockUpdatedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.CURRENT_UNDERLYING_BLOCK_UPDATED, assetManagerXrp)
    const em = context.orm.em.fork()
    await storer.processEventUnsafe(em, currentUnderlyingBlockUpdatedEvent)
    const currentUnderlyingBlockUpdated = await em.findOneOrFail(CurrentUnderlyingBlockUpdated,
      { evmLog: { index: currentUnderlyingBlockUpdatedEvent.index, block: { index: currentUnderlyingBlockUpdatedEvent.block.index }}},
      { populate: ['evmLog.block'] })
    expect(currentUnderlyingBlockUpdated).to.exist
    expect(currentUnderlyingBlockUpdated.evmLog.index).to.equal(currentUnderlyingBlockUpdatedEvent.index)
    expect(currentUnderlyingBlockUpdated.evmLog.block.index).to.equal(currentUnderlyingBlockUpdatedEvent.block.index)
    expect(currentUnderlyingBlockUpdated.underlyingBlockNumber).to.equal(Number(currentUnderlyingBlockUpdatedEvent.args[0]))
    expect(currentUnderlyingBlockUpdated.underlyingBlockTimestamp).to.equal(Number(currentUnderlyingBlockUpdatedEvent.args[1]))
    expect(currentUnderlyingBlockUpdated.updatedAt).to.equal(Number(currentUnderlyingBlockUpdatedEvent.args[2]))
  })

  it("should store self mint event", async () => {
    const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
    await fixture.storeInitialAgents(FAssetType.FXRP)
    const em = context.orm.em.fork()
    const selfMintEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.SELF_MINT, assetManagerXrp)
    await storer.processEventUnsafe(em, selfMintEvent)
    const selfMint = await em.findOneOrFail(SelfMint,
      { evmLog: { index: selfMintEvent.index, block: { index: selfMintEvent.block.index }}},
      { populate: ['evmLog.block', 'agentVault.address'] })
    expect(selfMint).to.exist
    expect(selfMint.evmLog.index).to.equal(selfMintEvent.index)
    expect(selfMint.evmLog.block.index).to.equal(selfMintEvent.block.index)
    expect(selfMint.agentVault.address.hex).to.equal(selfMintEvent.args[0])
    expect(selfMint.mintFromFreeUnderlying).to.equal(selfMintEvent.args[1])
    expect(selfMint.mintedUBA).to.equal(selfMintEvent.args[2])
    expect(selfMint.depositedUBA).to.equal(selfMintEvent.args[3])
    expect(selfMint.poolFeeUBA).to.equal(selfMintEvent.args[4])
  })

  it("should store agent vault destroy announced", async () => {
    const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
    await fixture.storeInitialAgents(FAssetType.FXRP)
    const em = context.orm.em.fork()
    const announceDestroyEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.AGENT_VAULT_DESTROY_ANNOUNCED, assetManagerXrp)
    await storer.processEventUnsafe(em, announceDestroyEvent)
    const announceDestroy = await em.findOneOrFail(AgentDestroyAnnounced,
      { evmLog: { index: announceDestroyEvent.index, block: { index: announceDestroyEvent.block.index }}},
      { populate: ['evmLog.block', 'agentVault.address']}
    )
    expect(announceDestroy).to.exist
    expect(announceDestroy.agentVault.address.hex).to.equal(announceDestroyEvent.args[0])
    expect(announceDestroy.allowedAt).to.equal(announceDestroyEvent.args[1])
  })

  describe("redemption tickets", () => {

    it("should store the redemption ticket created event and state", async () => {
      const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents()
      const em = context.orm.em.fork()
      // redemption ticket created event
      const redemptionTicketCreatedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_CREATED, assetManager)
      await storer.processEventUnsafe(em, redemptionTicketCreatedEvent)
      const redemptionTicketCreated = await em.findOneOrFail(RedemptionTicketCreated,
        { evmLog: { index: redemptionTicketCreatedEvent.index, block: { index: redemptionTicketCreatedEvent.block.index }}},
        { populate: ['evmLog.block', 'agentVault.address'] })
      expect(redemptionTicketCreated).to.exist
      expect(redemptionTicketCreated.evmLog.index).to.equal(redemptionTicketCreatedEvent.index)
      expect(redemptionTicketCreated.evmLog.block.index).to.equal(redemptionTicketCreatedEvent.block.index)
      expect(redemptionTicketCreated.agentVault.address.hex).to.equal(redemptionTicketCreatedEvent.args[0])
      expect(redemptionTicketCreated.redemptionTicketId).to.equal(redemptionTicketCreatedEvent.args[1])
      expect(redemptionTicketCreated.ticketValueUBA).to.equal(redemptionTicketCreatedEvent.args[2])
      const redemptionTicket = await em.findOneOrFail(RedemptionTicket, { redemptionTicketCreated }, { populate: ['redemptionTicketCreated'] })
      expect(redemptionTicket).to.exist
      expect(redemptionTicket.redemptionTicketCreated.redemptionTicketId).to.equal(redemptionTicketCreatedEvent.args[1])
      expect(redemptionTicket.ticketValueUBA).to.equal(redemptionTicketCreatedEvent.args[2])
      expect(redemptionTicket.destroyed).to.be.false
    })

    it("should store the redemption ticket updated event and state", async () => {
      const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents()
      const em = context.orm.em.fork()
      // redemption ticket created event
      const redemptionTicketCreatedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_CREATED, assetManager)
      await storer.processEvent(redemptionTicketCreatedEvent)
      // redemption ticket updated event
      const redemptionTicketUpdatedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_UPDATED, assetManager)
      await storer.processEventUnsafe(em, redemptionTicketUpdatedEvent)
      const redemptionTicketUpdated = await em.findOneOrFail(RedemptionTicketUpdated,
        { evmLog: { index: redemptionTicketUpdatedEvent.index, block: { index: redemptionTicketUpdatedEvent.block.index }}},
        { populate: ['evmLog.block', 'redemptionTicketCreated.agentVault.address'] })
      expect(redemptionTicketUpdated).to.exist
      expect(redemptionTicketUpdated.evmLog.index).to.equal(redemptionTicketUpdatedEvent.index)
      expect(redemptionTicketUpdated.evmLog.block.index).to.equal(redemptionTicketUpdatedEvent.block.index)
      expect(redemptionTicketUpdated.redemptionTicketCreated.agentVault.address.hex).to.equal(redemptionTicketUpdatedEvent.args[0])
      expect(redemptionTicketUpdated.redemptionTicketCreated.redemptionTicketId).to.equal(redemptionTicketUpdatedEvent.args[1])
      expect(redemptionTicketUpdated.ticketValueUBA).to.equal(redemptionTicketUpdatedEvent.args[2])
      // redemption ticket
      const redemptionTicket = await em.findOneOrFail(RedemptionTicket, {
        redemptionTicketCreated: redemptionTicketUpdated.redemptionTicketCreated
      }, { populate: ['redemptionTicketCreated'] })
      expect(redemptionTicket).to.exist
      expect(redemptionTicket.redemptionTicketCreated.redemptionTicketId).to.equal(redemptionTicketUpdatedEvent.args[1])
      expect(redemptionTicket.ticketValueUBA).to.equal(redemptionTicketUpdatedEvent.args[2])
      expect(redemptionTicket.destroyed).to.be.false
    })

    it("should store the redemption ticket deleted event and state", async () => {
      const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents()
      const em = context.orm.em.fork()
      // redemption ticket created event
      const redemptionTicketCreatedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_CREATED, assetManager)
      await storer.processEvent(redemptionTicketCreatedEvent)
      // redemption ticket deleted event
      const redemptionTicketDeletedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_DELETED, assetManager)
      await storer.processEventUnsafe(em, redemptionTicketDeletedEvent)
      const redemptionTicketDeleted = await em.findOneOrFail(RedemptionTicketDeleted,
        { evmLog: { index: redemptionTicketDeletedEvent.index, block: { index: redemptionTicketDeletedEvent.block.index }}},
        { populate: ['evmLog.block', 'redemptionTicketCreated.agentVault.address'] })
      expect(redemptionTicketDeleted).to.exist
      expect(redemptionTicketDeleted.evmLog.index).to.equal(redemptionTicketDeletedEvent.index)
      expect(redemptionTicketDeleted.evmLog.block.index).to.equal(redemptionTicketDeletedEvent.block.index)
      expect(redemptionTicketDeleted.redemptionTicketCreated.agentVault.address.hex).to.equal(redemptionTicketDeletedEvent.args[0])
      expect(redemptionTicketDeleted.redemptionTicketCreated.redemptionTicketId).to.equal(redemptionTicketDeletedEvent.args[1])
      // redemption ticket
      const redemptionTicket = await em.findOneOrFail(RedemptionTicket, {
        redemptionTicketCreated: redemptionTicketDeleted.redemptionTicketCreated
      }, { populate: ['redemptionTicketCreated'] })
      expect(redemptionTicket).to.exist
      expect(redemptionTicket.redemptionTicketCreated.redemptionTicketId).to.equal(redemptionTicketDeletedEvent.args[1])
      expect(redemptionTicket.ticketValueUBA).to.equal(BigInt(0))
      expect(redemptionTicket.destroyed).to.be.true
    })
  })

  describe("liquidations", () => {

    it("should store all liquidation started events", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents(FAssetType.FXRP)
      const em = context.orm.em.fork()
      const liquidationStartedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.LIQUIDATION_STARTED, assetManagerXrp)
      await storer.processEventUnsafe(em, liquidationStartedEvent)
      const liquidationStarted = await em.findOneOrFail(LiquidationStarted,
        { evmLog: { index: liquidationStartedEvent.index, block: { index: liquidationStartedEvent.block.index }}},
        { populate: ['evmLog.block', 'agentVault.address'] })
      expect(liquidationStarted).to.exist
      expect(liquidationStarted.evmLog.index).to.equal(liquidationStartedEvent.index)
      expect(liquidationStarted.evmLog.block.index).to.equal(liquidationStartedEvent.block.index)
      expect(liquidationStarted.agentVault.address.hex).to.equal(liquidationStartedEvent.args[0])
    })

    it("should store all full-liquidation started events", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents()
      const em = context.orm.em.fork()
      const fullLiquidationStartedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.FULL_LIQUIDATION_STARTED, assetManagerXrp)
      await storer.processEventUnsafe(em, fullLiquidationStartedEvent)
      const liquidationStarted = await em.findOneOrFail(FullLiquidationStarted,
        { evmLog: { index: fullLiquidationStartedEvent.index, block: { index: fullLiquidationStartedEvent.block.index }}},
        { populate: ['evmLog.block', 'agentVault.address'] })
      expect(liquidationStarted).to.exist
      expect(liquidationStarted.evmLog.index).to.equal(fullLiquidationStartedEvent.index)
      expect(liquidationStarted.evmLog.block.index).to.equal(fullLiquidationStartedEvent.block.index)
      expect(liquidationStarted.agentVault.address.hex).to.equal(fullLiquidationStartedEvent.args[0])
    })

    it("should store all liquidation ended events", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents()
      const em = context.orm.em.fork()
      const liquidationStartedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.LIQUIDATION_ENDED, assetManagerXrp)
      await storer.processEventUnsafe(em, liquidationStartedEvent)
      const liquidationStarted = await em.findOneOrFail(LiquidationEnded,
        { evmLog: { index: liquidationStartedEvent.index, block: { index: liquidationStartedEvent.block.index }}},
        { populate: ['evmLog.block', 'agentVault.address'] })
      expect(liquidationStarted).to.exist
      expect(liquidationStarted.evmLog.index).to.equal(liquidationStartedEvent.index)
      expect(liquidationStarted.evmLog.block.index).to.equal(liquidationStartedEvent.block.index)
      expect(liquidationStarted.agentVault.address.hex).to.equal(liquidationStartedEvent.args[0])
    })

    it("should store all liquidation performed events", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents()
      const em = context.orm.em.fork()
      const liquidationPerformedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.LIQUIDATION_PERFORMED, assetManagerXrp)
      await storer.processEventUnsafe(em, liquidationPerformedEvent)
      const liquidationPerformed = await em.findOneOrFail(LiquidationPerformed,
        { evmLog: { index: liquidationPerformedEvent.index, block: { index: liquidationPerformedEvent.block.index }}},
        { populate: ['evmLog.block', 'agentVault.address', 'liquidator'] })
      expect(liquidationPerformed).to.exist
      expect(liquidationPerformed.evmLog.index).to.equal(liquidationPerformedEvent.index)
      expect(liquidationPerformed.evmLog.block.index).to.equal(liquidationPerformedEvent.block.index)
      expect(liquidationPerformed.agentVault.address.hex).to.equal(liquidationPerformedEvent.args[0])
      expect(liquidationPerformed.liquidator.hex).to.equal(liquidationPerformedEvent.args[1])
      expect(liquidationPerformed.valueUBA).to.equal(liquidationPerformedEvent.args[2])
    })
  })

  describe("emergency pause", () => {

    it("should test storing the emergency pause triggered event with old interface", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      const event = await fixture.generateEvent(EVENTS.ASSET_MANAGER.EMERGENCY_PAUSE_TRIGGERED, assetManagerXrp)
      await storer.processEvent(event)
      const em = context.orm.em.fork()
      const emergencyPauseTriggered = await em.findOneOrFail(EmergencyPauseTriggered, { fasset: FAssetType.FXRP })
      expect(emergencyPauseTriggered.level).to.equal(1)
      expect(emergencyPauseTriggered.pausedUntil).to.equal(event.args[1])
    })
  })

  describe("edge cases", () => {

    it("should be able to store collateral reserved events with same ids, from different fassets", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      const assetManagerBtc = context.getContractAddress(ASSET_MANAGER_FBTC)
      await fixture.storeInitialAgents()
      const event1 = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED, assetManagerXrp)
      const event2 = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED, assetManagerBtc)
      event2.args[2] = event1.args[2]
      const em = context.orm.em.fork()
      await storer.processEventUnsafe(em, event1)
      await storer.processEventUnsafe(em, event2)
      const collateralReserved = await em.findOneOrFail(CollateralReserved, { fasset: FAssetType.FXRP })
      expect(collateralReserved.collateralReservationId).to.equal(Number(event1.args[2]))
      expect(collateralReserved.fasset).to.equal(FAssetType.FXRP)
      const collateralReservedBtc = await em.findOneOrFail(CollateralReserved, { fasset: FAssetType.FBTC })
      expect(collateralReservedBtc.collateralReservationId).to.equal(Number(event2.args[2]))
      expect(collateralReservedBtc.fasset).to.equal(FAssetType.FBTC)
    })

    it("should not confuse collateral reserved from different fassets", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      const assetManagerBtc = context.getContractAddress(ASSET_MANAGER_FBTC)
      await fixture.storeInitialAgents()
      const em = context.orm.em.fork()
      const event1 = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED, assetManagerXrp)
      await storer.processEventUnsafe(em, event1)
      await em.flush()
      const event2 = await fixture.generateEvent(EVENTS.ASSET_MANAGER.MINTING_EXECUTED, assetManagerBtc)
      event2.args[1] = event1.args[2]
      expect(storer.processEventUnsafe(em, event2)).to.eventually.be.rejected
    })

    it("should not allow two events with same log index and block index", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      const assetManagerBtc = context.getContractAddress(ASSET_MANAGER_FBTC)
      const event1 = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED, assetManagerXrp)
      const event2 = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED, assetManagerBtc)
      event2.index = event1.index
      event2.block.index = event1.block.index
      const em = context.orm.em.fork()
      await storer.processEventUnsafe(em, event1)
      await storer.processEventUnsafe(em, event2)
      const logs = await em.findAll(EvmLog)
      expect(logs).to.have.length(1)
    })

    it("should not store an event that is not processed", async () => {
      const collateralTypeAddedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED)
      collateralTypeAddedEvent.name = 'ShmollateralShmypeAShmadded'
      const em = context.orm.em.fork()
      await storer.processEventUnsafe(em, collateralTypeAddedEvent)
      const evmLogs = await em.findAll(EvmLog)
      expect(evmLogs).to.be.empty
    })

    it("should not store same event twice (really really improbable to happen with current impl)", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      const event1 = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED, assetManagerXrp)
      const event2 = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED, assetManagerXrp)
      event2.block.index = event1.block.index
      event2.index = event1.index
      const em = context.orm.em.fork()
      await storer.processEventUnsafe(em, event1)
      await storer.processEventUnsafe(em, event1)
      const logs = await em.findAll(EvmLog)
      expect(logs).to.have.length(1)
    })
  })

  describe("core vault", () => {

    it("should store transfer to core vault data", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents(FAssetType.FXRP)
      const em = context.orm.em.fork()
      // test transfer to core vault started
      const ettcvs = await fixture.generateEvent(EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_STARTED, assetManagerXrp)
      await storer.processEventUnsafe(em, ettcvs)
      const ttcvs = await em.findOneOrFail(TransferToCoreVaultStarted,
        { evmLog: { block: { index: ettcvs.block.index }, index: ettcvs.index }},
        { populate: [ 'agentVault.address' ]}
      )
      expect(ttcvs.fasset).to.equal(FAssetType.FXRP)
      expect(ttcvs.agentVault.address.hex).to.equal(ettcvs.args[0])
      expect(ttcvs.transferRedemptionRequestId).to.equal(Number(ettcvs.args[1]))
      expect(ttcvs.valueUBA).to.equal(ettcvs.args[2])
      // test transfer to core vault successful
      const ettcvf = await fixture.generateEvent(EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_SUCCESSFUL, assetManagerXrp)
      await storer.processEventUnsafe(em, ettcvf)
      const ttcvf = await em.findOneOrFail(TransferToCoreVaultSuccessful,
        { evmLog: { block: { index: ettcvf.block.index }, index: ettcvf.index }}
      )
      expect(ttcvf.fasset).to.equal(FAssetType.FXRP)
      expect(ttcvf.transferToCoreVaultStarted).to.equal(ttcvs)
      expect(ttcvf.valueUBA).to.equal(ettcvf.args[2])
      // TODO: test transfer to core vault defaulted
      const ettcvd = await fixture.generateEvent(EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_DEFAULTED, assetManagerXrp)
      await storer.processEventUnsafe(em, ettcvd)
      const ttcvd = await em.findOneOrFail(TransferToCoreVaultDefaulted,
        { evmLog: { block: { index: ettcvd.block.index }, index: ettcvd.index }})
      expect(ttcvd.fasset).to.equal(FAssetType.FXRP)
      expect(ttcvd.transferToCoreVaultStarted).to.equal(ttcvs)
      expect(ttcvd.remintedUBA).to.equal(ettcvd.args[2])
    })

    it("should store return from core vault", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents(FAssetType.FXRP)
      const em = context.orm.em.fork()
      // test transfer from core vault requested
      const etfcvr = await fixture.generateEvent(EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_REQUESTED, assetManagerXrp)
      await storer.processEventUnsafe(em, etfcvr)
      const tfcvr = await em.findOneOrFail(ReturnFromCoreVaultRequested,
        { evmLog: { block: { index: etfcvr.block.index }, index: etfcvr.index }},
        { populate: ['agentVault.address']}
      )
      expect(tfcvr.fasset).to.equal(FAssetType.FXRP)
      expect(tfcvr.agentVault.address.hex).to.equal(etfcvr.args[0])
      expect(tfcvr.requestId).to.equal(Number(etfcvr.args[1]))
      expect(tfcvr.paymentReference).to.equal(etfcvr.args[2])
      expect(tfcvr.valueUBA).to.equal(etfcvr.args[3])
      // test transfer from core vault confirmed
      const etfcvc = await fixture.generateEvent(EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CONFIRMED, assetManagerXrp)
      await storer.processEventUnsafe(em, etfcvc)
      const tfcvc = await em.findOneOrFail(ReturnFromCoreVaultConfirmed,
        { evmLog: { block: { index: etfcvc.block.index }, index: etfcvc.index }}
      )
      expect(tfcvc.fasset).to.equal(FAssetType.FXRP)
      expect(tfcvc.returnFromCoreVaultRequested).to.equal(tfcvr)
      expect(tfcvc.receivedUnderlyingUBA).to.equal(etfcvc.args[2])
      expect(tfcvc.remintedUBA).to.equal(etfcvc.args[3])
      // test transfer from core vault canceled
      const etfcvd = await fixture.generateEvent(EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CANCELLED, assetManagerXrp)
      await storer.processEventUnsafe(em, etfcvd)
      const tfcvd = await em.findOneOrFail(ReturnFromCoreVaultCancelled,
        { evmLog: { block: { index: etfcvd.block.index }, index: etfcvd.index }}
      )
      expect(tfcvd.fasset).to.equal(FAssetType.FXRP)
      expect(tfcvd.returnFromCoreVaultRequested).to.equal(tfcvr)
    })

    it("should store core vault redemption requested", async () => {
      const assetManagerXrp = context.getContractAddress(ASSET_MANAGER_FXRP)
      await fixture.storeInitialAgents(FAssetType.FXRP)
      const em = context.orm.em.fork()
      // test core vault redemption requested
      const ecvrr = await fixture.generateEvent(EVENTS.ASSET_MANAGER.CORE_VAULT_REDEMPTION_REQUESTED, assetManagerXrp)
      await storer.processEventUnsafe(em, ecvrr)
      const cvrr = await em.findOneOrFail(CoreVaultRedemptionRequested,
        { evmLog: { block: { index: ecvrr.block.index }, index: ecvrr.index }}
      )
      expect(cvrr.fasset).to.equal(FAssetType.FXRP)
      expect(cvrr.redeemer.hex).to.equal(ecvrr.args[0])
      expect(cvrr.paymentAddress.text).to.equal(ecvrr.args[1])
      expect(cvrr.paymentReference).to.equal(ecvrr.args[2])
      expect(cvrr.valueUBA).to.equal(ecvrr.args[3])
      expect(cvrr.feeUBA).to.equal(ecvrr.args[4])
    })
  })

  describe("core vault manager", () => {
    it("should store settings updated", async () => {
      const coreVaultManagerXrp = context.getContractAddress(CORE_VAULT_MANAGER_FXRP)
      await fixture.storeInitialCoreVaultManagerSettings()
      const em = context.orm.em.fork()
      const esu = await fixture.generateEvent(EVENTS.CORE_VAULT_MANAGER.SETTINGS_UPDATED, coreVaultManagerXrp)
      await storer.processEventUnsafe(em, esu)
      const su = await em.findOneOrFail(CoreVaultManagerSettingsUpdated,
        { evmLog: { block: { index: esu.block.index }, index: esu.index }}
      )
      expect(su.fasset).to.equal(FAssetType.FXRP)
      expect(su.escrowEndTimeSeconds).to.equal(Number(esu.args[0]))
      expect(su.escrowAmount).to.equal(esu.args[1])
      expect(su.minimalAmount).to.equal(esu.args[2])
      expect(su.fee).to.equal(esu.args[3])
      const cvms = await em.findOneOrFail(CoreVaultManagerSettings, { fasset: FAssetType.FXRP })
      expect(cvms.fasset).to.equal(FAssetType.FXRP)
      expect(cvms.escrowEndTimeSeconds).to.equal(su.escrowEndTimeSeconds)
      expect(cvms.escrowAmount).to.equal(su.escrowAmount)
      expect(cvms.minimalAmount).to.equal(su.minimalAmount)
      expect(cvms.chainPaymentFee).to.equal(su.fee)
    })
  })

  describe("collateral pool", () => {

    it("should store collateral pool cp-entered event", async () => {
      const agents = await fixture.storeInitialAgents(FAssetType.FXRP)
      const ecpe = await fixture.generateEvent(EVENTS.COLLATERAL_POOL.CP_ENTERED, agents[0].collateralPool.hex)
      await storer.processEvent(ecpe)
      // check
      const em = context.orm.em.fork()
      const cpe = await em.findOneOrFail(CPEntered,
        { evmLog: { block: { index: ecpe.block.index }, index: ecpe.index }},
        { populate: [ 'tokenHolder' ]}
      )
      expect(cpe.fasset).to.equal(FAssetType.FXRP)
      expect(cpe.tokenHolder.hex).to.equal(ecpe.args[0])
      expect(cpe.amountNatWei).to.equal(ecpe.args[1])
      expect(cpe.receivedTokensWei).to.equal(ecpe.args[2])
      expect(cpe.timelockExpiresAt).to.equal(ecpe.args[3])
    })

    it("should store collateral pool cp-exited event", async () => {
      const agents = await fixture.storeInitialAgents(FAssetType.FXRP)
      const ecpe = await fixture.generateEvent(EVENTS.COLLATERAL_POOL.CP_EXITED, agents[0].collateralPool.hex)
      await storer.processEvent(ecpe)
      // check
      const em = context.orm.em.fork()
      const cpe = await em.findOneOrFail(CPExited,
        { evmLog: { block: { index: ecpe.block.index }, index: ecpe.index }},
        { populate: [ 'tokenHolder' ]}
      )
      expect(cpe.fasset).to.equal(FAssetType.FXRP)
      expect(cpe.tokenHolder.hex).to.equal(ecpe.args[0])
      expect(cpe.burnedTokensWei).to.equal(ecpe.args[1])
      expect(cpe.receivedNatWei).to.equal(ecpe.args[2])
    })

    it("should store collateral pool cp-claimed-reward event", async () => {
      const agents = await fixture.storeInitialAgents(FAssetType.FXRP)
      const ecpccr = await fixture.generateEvent(EVENTS.COLLATERAL_POOL.CP_CLAIMED_REWARD, agents[0].collateralPool.hex)
      await storer.processEvent(ecpccr)
      // check
      const em = context.orm.em.fork()
      const ccr = await em.findOneOrFail(CPClaimedReward,
        { evmLog: { block: { index: ecpccr.block.index }, index: ecpccr.index }},
      )
      expect(ccr.fasset).to.equal(FAssetType.FXRP)
      expect(ccr.amountNatWei).to.equal(ecpccr.args[0])
      expect(ccr.rewardType).to.equal(Number(ecpccr.args[1]))
    })

    it("should store collateral pool cp-fee-debt-paid event", async () => {
      const agents = await fixture.storeInitialAgents(FAssetType.FXRP)
      const ecpcfdp = await fixture.generateEvent(EVENTS.COLLATERAL_POOL.CP_FEE_DEBT_PAID, agents[0].collateralPool.hex)
      await storer.processEvent(ecpcfdp)
      // check
      const em = context.orm.em.fork()
      const cpcfdp = await em.findOneOrFail(CPFeeDebtPaid,
        { evmLog: { block: { index: ecpcfdp.block.index }, index: ecpcfdp.index }},
        { populate: [ 'tokenHolder' ] }
      )
      expect(cpcfdp.fasset).to.equal(FAssetType.FXRP)
      expect(cpcfdp.tokenHolder.hex).to.equal(ecpcfdp.args[0])
      expect(cpcfdp.paidFeesUBA).to.equal(ecpcfdp.args[1])
    })

    it("should store collateral pool cp-fee-debt-changed event", async () => {
      const agents = await fixture.storeInitialAgents(FAssetType.FXRP)
      const ecpcfdc = await fixture.generateEvent(EVENTS.COLLATERAL_POOL.CP_FEE_DEBT_CHANGED, agents[0].collateralPool.hex)
      await storer.processEvent(ecpcfdc)
      // check
      const em = context.orm.em.fork()
      const cpcfdc = await em.findOneOrFail(CPFeeDebtChanged,
        { evmLog: { block: { index: ecpcfdc.block.index }, index: ecpcfdc.index }},
        { populate: [ 'tokenHolder' ] }
      )
      expect(cpcfdc.fasset).to.equal(FAssetType.FXRP)
      expect(cpcfdc.tokenHolder.hex).to.equal(ecpcfdc.args[0])
      expect(cpcfdc.newFeeDebtUBA).to.equal(ecpcfdc.args[1])
    })

    it("should store collateral pool cp-fees-withdrawn event", async () => {
      const agents = await fixture.storeInitialAgents(FAssetType.FXRP)
      const ecpcfw = await fixture.generateEvent(EVENTS.COLLATERAL_POOL.CP_FEES_WITHDRAWN, agents[0].collateralPool.hex)
      await storer.processEvent(ecpcfw)
      // check
      const em = context.orm.em.fork()
      const cpcfw = await em.findOneOrFail(CPFeesWithdrawn,
        { evmLog: { block: { index: ecpcfw.block.index }, index: ecpcfw.index }},
        { populate: [ 'tokenHolder' ] }
      )
      expect(cpcfw.fasset).to.equal(FAssetType.FXRP)
      expect(cpcfw.tokenHolder.hex).to.equal(ecpcfw.args[0])
      expect(cpcfw.withdrawnFeesUBA).to.equal(ecpcfw.args[1])
    })

    it("should store collateral pool cp-paid-out event", async () => {
      const agents = await fixture.storeInitialAgents(FAssetType.FXRP)
      const ecpcpo = await fixture.generateEvent(EVENTS.COLLATERAL_POOL.CP_PAID_OUT, agents[0].collateralPool.hex)
      await storer.processEvent(ecpcpo)
      // check
      const em = context.orm.em.fork()
      const cpcpo = await em.findOneOrFail(CPPaidOut,
        { evmLog: { block: { index: ecpcpo.block.index }, index: ecpcpo.index }},
        { populate: [ 'recipient' ] }
      )
      expect(cpcpo.fasset).to.equal(FAssetType.FXRP)
      expect(cpcpo.recipient.hex).to.equal(ecpcpo.args[0])
      expect(cpcpo.paidNatWei).to.equal(ecpcpo.args[1])
      expect(cpcpo.burnedTokensWei).to.equal(ecpcpo.args[2])
    })

     it("should store collateral pool cp-self-close-exited event", async () => {
      const agents = await fixture.storeInitialAgents(FAssetType.FXRP)
      const ecpcsce = await fixture.generateEvent(EVENTS.COLLATERAL_POOL.CP_SELF_CLOSE_EXITED, agents[0].collateralPool.hex)
      await storer.processEvent(ecpcsce)
      // check
      const em = context.orm.em.fork()
      const cpcsce = await em.findOneOrFail(CPSelfCloseExited,
        { evmLog: { block: { index: ecpcsce.block.index }, index: ecpcsce.index }},
        { populate: [ 'tokenHolder' ] }
      )
      expect(cpcsce.fasset).to.equal(FAssetType.FXRP)
      expect(cpcsce.tokenHolder.hex).to.equal(ecpcsce.args[0])
      expect(cpcsce.burnedTokensWei).to.equal(ecpcsce.args[1])
      expect(cpcsce.receivedNatWei).to.equal(ecpcsce.args[2])
      expect(cpcsce.closedFAssetsUBA).to.equal(ecpcsce.args[3])
    })
  })

  describe("edge cases", async () => {
    it("should fetch null bigint when storing agent settings updated", async () => {
      const assetManager = context.getContractAddress(ASSET_MANAGER_FXRP)
      // add initial collateral token type
      const collateralTypeAddedEvent = await fixture.generateEvent(EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED, assetManager)
      await storer.processEvent(collateralTypeAddedEvent)
      // store
      await fixture.storeInitialAgents(FAssetType.FXRP, true)
      const settingChanged = await fixture.generateEvent(EVENTS.ASSET_MANAGER.AGENT_SETTING_CHANGED, assetManager)
      await storer.processEvent(settingChanged)
    })
  })

})