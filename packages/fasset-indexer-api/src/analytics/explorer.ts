import { raw } from "fasset-indexer-core/orm"
import * as core from "fasset-indexer-core"
import * as Entities from "fasset-indexer-core/entities"
import { PaymentReference } from "fasset-indexer-core/utils"
import { EVENTS } from "fasset-indexer-core/config"
import { XRP_TRANSACTION_SUCCESS_CODE } from 'fasset-indexer-xrp/constants'
import { unixnow } from "../shared/utils"
import { SharedAnalytics } from "./shared"
import * as ExplorerType from "./types"
import * as SQL from "./utils/raw-sql"
import { DEAD_ADDRESS } from "../config/constants"
import type { EntityManager, ORM } from "fasset-indexer-core/orm"
import type { FilterQuery } from "@mikro-orm/core"


const ALL_TRANSACTION_TYPES = Object.values(ExplorerType.TransactionType)
  .filter(v => typeof v === "number")

export class ExplorerAnalytics extends SharedAnalytics {
  protected lookup: core.ContractLookup
  private coreVaultCache = new Map<core.FAssetType, string>()

  constructor(
    public readonly orm: ORM,
    public readonly chain: string,
    addressesJson?: string
  ) {
    const lookup = new core.ContractLookup(chain, addressesJson)
    const fassets = core.FASSETS.filter(x => lookup.supportsFAsset(core.FAssetType[x]))
    super(orm, fassets)
    this.lookup = lookup
  }

  async statistics(start?: number, end?: number): Promise<ExplorerType.ExplorerAggregateStatistics> {
    const em = this.orm.em.fork()
    if (start == null) {
      start = 0
    }
    if (end == null) {
      end = Date.now() / 1000
    }
    const [mint, redeem] = await Promise.all([
      this.mintStats(em, start, end),
      this.redeemStats(em, start, end)
    ])
    return { mint, redeem }
  }

  async transactions(
    limit: number, offset: number,
    user?: string, agent?: string,
    start?: number, end?: number,
    asc: boolean = false,
    status?: number,
    types: ExplorerType.TransactionType[] = ALL_TRANSACTION_TYPES
  ): Promise<ExplorerType.TransactionsInfo> {
    const em = this.orm.em.fork()
    ;[start, end] = this.standardizeInterval(start, end)
    const hasUser = user != null
    const hasAgent = agent != null
    const hasWindow = start != null || end != null
    const hasStatus = status != null
    const filterParams = [user ?? agent, start, end, status].filter(x => x != null)
    const conn = em.getConnection('read')
    const [transactions, countResult] = await Promise.all([
      conn.execute(
        SQL.EXPLORER_TRANSACTIONS(hasUser, hasAgent, asc, hasWindow, hasStatus, types),
        [...filterParams, limit, offset]
      ) as Promise<SQL.ExplorerTransactionsOrmResult[]>,
      conn.execute(
        SQL.EXPLORER_TRANSACTIONS_COUNT(hasUser, hasAgent, hasWindow, hasStatus, types),
        filterParams
      ) as Promise<[{ count: string }]>
    ])
    const info: ExplorerType.TransactionInfo[] = []
    for (const { name, timestamp, source, hash, agent_vault, agent_name, value_uba, user, resolution, underlying_payment } of transactions) {
      const transactionType = this.eventNameToTransactionType(name)
      const resolutionString = this.resolutionFromTransactionType(transactionType, resolution)
      info.push({
        name: ExplorerType.TransactionType[transactionType] as keyof typeof ExplorerType.TransactionType,
        agentVault: agent_vault, agentName: agent_name, user,
        timestamp, origin: source, hash, value: BigInt(value_uba ?? 0),
        resolution: resolutionString, payment: underlying_payment != null
      })
    }
    return { transactions: info, count: Number(countResult[0]?.count ?? 0) }
  }

  async transactionClassification(
    hash: string
  ): Promise<ExplorerType.GenericTransactionClassification> {
    const em = this.orm.em.fork()
    if (this.isNativeTransactionHash(hash)) {
      return this.nativeTransactionClassification(em, hash)
    } else if (this.isRippleTransactionHash(hash)) {
      return this.rippleTransactionClassification(em, hash)
    }
    throw new Error(`don't recognize transaction hash ${hash} format`)
  }

  async mintingTransactionDetails(
    hash: string
  ): Promise<ExplorerType.MintTransactionDetails> {
    const em = this.orm.em.fork()
    const collateralReservations = await em.find(Entities.CollateralReserved,
      { evmLog: { transaction: { hash }} },
      { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.owner.manager',
        'minter', 'paymentAddress', 'executor'
      ] }
    )
    const flows = await Promise.all(
      collateralReservations.map(cr => this.mintingEventDetails(em, cr))
    )
    return { flows }
  }

  async directMintTransactionDetails(
    hash: string
  ): Promise<ExplorerType.DirectMintTransactionDetails> {
    const em = this.orm.em.fork()
    const [directMints, directMintsSA] = await Promise.all([
      em.find(Entities.DirectMintingExecuted,
        { evmLog: { transaction: { hash } } },
        { populate: ['evmLog.block', 'evmLog.transaction.source', 'targetAddress', 'executor'] }),
      em.find(Entities.DirectMintingExecutedToSmartAccount,
        { evmLog: { transaction: { hash } } },
        { populate: ['evmLog.block', 'evmLog.transaction.source', 'sourceAddress', 'executor'] })
    ])
    const flows = await Promise.all(
      [...directMints, ...directMintsSA].map(dm => this.directMintEventDetails(em, dm))
    )
    return { flows }
  }

  async redemptionTransactionDetails(
    hash: string
  ): Promise<ExplorerType.RedeemTransactionDetails> {
    const em = this.orm.em.fork()
    const [redemptionRequests, redemptionRequestIncompletes] = await Promise.all([
      em.find(Entities.RedemptionRequested,
        { evmLog: { transaction: { hash } } },
        { populate: [
          'evmLog.block', 'evmLog.transaction.source',
          'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager',
          'redeemer', 'paymentAddress', 'executor'
        ] }),
      em.find(Entities.RedemptionRequestIncomplete,
        { evmLog: { transaction: { hash } }}, { populate: [ 'evmLog.block', 'redeemer' ] })
    ])
    const flows = await Promise.all(
      redemptionRequests.map(rr => this.redemptionEventDetails(em, rr))
    )
    return { flows, flags: redemptionRequestIncompletes }
  }

  async transferToCoreVaultTransactionDetails(
    hash: string
  ): Promise<ExplorerType.TransferToCoreVaultTransactionDetails> {
    const em = this.orm.em.fork()
    const transferToCoreVaultRequests = await em.find(Entities.TransferToCoreVaultStarted,
      { evmLog: { transaction: { hash } } },
      { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager'
      ] }
    )
    const flows = await Promise.all(
      transferToCoreVaultRequests.map(t => this.transferToCoreVaultEventDetails(em, t))
    )
    return { flows }
  }

  async returnFromCoreVaultTransactionDetails(
    hash: string
  ): Promise<ExplorerType.ReturnFromCoreVaultTransactionDetails> {
    const em = this.orm.em.fork()
    const returnFromCoreVaultRequests = await em.find(Entities.ReturnFromCoreVaultRequested,
      { evmLog: { transaction: { hash }} }, { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager'
      ] }
    )
    const flows = await Promise.all(
      returnFromCoreVaultRequests.map(r => this.returnFromCoreVaultEventDetails(em, r))
    )
    return { flows }
  }

  async selfMintTransactionDetails(
    hash: string
  ): Promise<ExplorerType.SelfMintTransactionDetails> {
    const em = this.orm.em.fork()
    const selfMints = await em.find(Entities.SelfMint,
      { evmLog: { transaction: { hash }} }, { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager'
      ]}
    )
    const flows = await Promise.all(
      selfMints.map(s => this.selfMintEventDetails(em, s))
    )
    return { flows }
  }

  async underlyingBalanceToppedUpTransactionDetails(
    hash: string
  ): Promise<ExplorerType.BalanceTopupTransactionDetails> {
    const em = this.orm.em.fork()
    const topups = await em.find(Entities.UnderlyingBalanceToppedUp,
      { evmLog: { transaction: { hash }}}, { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager'
      ]}
    )
    const flows = await Promise.all(
      topups.map(t => this.underlyingBalanceToppedUpEventDetails(em, t))
    )
    return { flows }
  }

  async underlyingWithdrawalTransactionDetails(
    hash: string
  ): Promise<ExplorerType.WithdrawalTransactionDetails> {
    const em = this.orm.em.fork()
    const withdrawals = await em.find(Entities.UnderlyingWithdrawalAnnounced,
      { evmLog: { transaction: { hash }} }, { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager'
      ]})
    const flows = await Promise.all(
      withdrawals.map(w => this.underlyingWithdrawalEventDetails(em, w))
    )
    return { flows }
  }

  protected async mintingEventDetails(
    em: EntityManager, collateralReserved: Entities.CollateralReserved
  ): Promise<ExplorerType.MintEventDetails> {
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, collateralReserved.fasset,
      collateralReserved.paymentReference,
      { transaction: { target: collateralReserved.paymentAddress }}
    )
    const resp: ExplorerType.MintEventDetails = {
      events: { original: collateralReserved }, underlyingTransaction
    }
    if (collateralReserved.resolution == core.CollateralReservationResolution.EXECUTED) {
      resp.events.resolution = await em.findOneOrFail(Entities.MintingExecuted,
        { collateralReserved }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ]} )
    } else if (collateralReserved.resolution == core.CollateralReservationResolution.DEFAULTED) {
      resp.events.resolution = await em.findOneOrFail(Entities.MintingPaymentDefault,
        { collateralReserved }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ]} )
    } else if (collateralReserved.resolution == core.CollateralReservationResolution.DELETED) {
      resp.events.resolution = await em.findOneOrFail(Entities.CollateralReservationDeleted,
      { collateralReserved }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    }
    return resp
  }

  protected async redemptionEventDetails(
    em: EntityManager, redemptionRequested: Entities.RedemptionRequested
  ): Promise<ExplorerType.RedeemEventDetails> {
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, redemptionRequested.fasset,
      redemptionRequested.paymentReference,
      { transaction: {
        source: redemptionRequested.agentVault.underlyingAddress,
        target: redemptionRequested.paymentAddress
      }}
    )
    const resp: ExplorerType.RedeemEventDetails = {
      events: { original: redemptionRequested }, underlyingTransaction
    }
    // find resolution event
    if (redemptionRequested.resolution == core.RedemptionResolution.PERFORMED) {
      resp.events.resolution = await em.findOneOrFail(Entities.RedemptionPerformed,
        { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    } else if (redemptionRequested.resolution == core.RedemptionResolution.DEFAULTED) {
      resp.events.resolution = await em.findOneOrFail(Entities.RedemptionDefault,
        { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    } else if (redemptionRequested.resolution == core.RedemptionResolution.REJECTED) {
      resp.events.resolution = await em.findOneOrFail(Entities.RedemptionRejected,
        { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ]})
    } else if (redemptionRequested.resolution == core.RedemptionResolution.BLOCKED) {
      resp.events.resolution = await em.findOneOrFail(Entities.RedemptionPaymentBlocked,
        { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    } else if (redemptionRequested.resolution == core.RedemptionResolution.FAILED) {
      resp.events.resolution = await em.findOneOrFail(Entities.RedemptionPaymentFailed,
      { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    }
    return resp
  }

  protected async transferToCoreVaultEventDetails(
    em: EntityManager, transferToCoreVaultStarted: Entities.TransferToCoreVaultStarted
  ): Promise<ExplorerType.TransferToCoreVaultEventDetails> {
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested, {
      fasset: transferToCoreVaultStarted.fasset,
      requestId: transferToCoreVaultStarted.transferRedemptionRequestId
    }, { populate: [ 'paymentAddress' ]})
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, transferToCoreVaultStarted.fasset,
      redemptionRequested.paymentReference,
      { transaction: {
        source: transferToCoreVaultStarted.agentVault.underlyingAddress,
        target: redemptionRequested.paymentAddress
      }}
    )
    const resp: ExplorerType.TransferToCoreVaultEventDetails = {
      events: { original: transferToCoreVaultStarted }, underlyingTransaction
    }
    // find resolution event
    if (transferToCoreVaultStarted.resolution == core.TransferToCoreVaultResolution.SUCCESSFUL) {
      resp.events.resolution = await em.findOneOrFail(Entities.TransferToCoreVaultSuccessful,
        { transferToCoreVaultStarted }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    } else if (transferToCoreVaultStarted.resolution == core.TransferToCoreVaultResolution.DEFAULTED) {
      resp.events.resolution = await em.findOneOrFail(Entities.TransferToCoreVaultDefaulted,
        { transferToCoreVaultStarted }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] } )
    }
    return resp
  }

  protected async returnFromCoreVaultEventDetails(
    em: EntityManager, returnFromCoreVaultRequested: Entities.ReturnFromCoreVaultRequested
  ): Promise<ExplorerType.ReturnFromCoreVaultEventDetails> {
    const coreVault = await this.getCoreVaultAddress(em, returnFromCoreVaultRequested.fasset)
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, returnFromCoreVaultRequested.fasset,
      returnFromCoreVaultRequested.paymentReference,
      { transaction: {
        source: { text: coreVault },
        target: returnFromCoreVaultRequested.agentVault.underlyingAddress
      }}
    )
    const resp: ExplorerType.ReturnFromCoreVaultEventDetails = {
      events: { original: returnFromCoreVaultRequested }, underlyingTransaction
    }
    // find resolution event
    if (returnFromCoreVaultRequested.resolution == core.ReturnFromCoreVaultResolution.CONFIRMED) {
      resp.events.resolution = await em.findOneOrFail(Entities.ReturnFromCoreVaultConfirmed,
        { returnFromCoreVaultRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    } else if (returnFromCoreVaultRequested.resolution == core.ReturnFromCoreVaultResolution.CANCELLED) {
      resp.events.resolution = await em.findOneOrFail(Entities.ReturnFromCoreVaultCancelled,
        { returnFromCoreVaultRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    }
    return resp
  }

  protected async underlyingWithdrawalEventDetails(
    em: EntityManager, underlyingWithdrawalAnnounced: Entities.UnderlyingWithdrawalAnnounced
  ): Promise<ExplorerType.WithdrawalEventDetails> {
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, underlyingWithdrawalAnnounced.fasset,
      underlyingWithdrawalAnnounced.paymentReference,
      { transaction: {
        source: underlyingWithdrawalAnnounced.agentVault.underlyingAddress
      }}
    )
    const resp: ExplorerType.WithdrawalEventDetails = {
      events: { original: underlyingWithdrawalAnnounced }, underlyingTransaction
    }
    // find resolution event
    if (underlyingWithdrawalAnnounced.resolution == core.UnderlyingWithdrawalResolution.CONFIRMED) {
      resp.events.resolution = await em.findOne(Entities.UnderlyingWithdrawalConfirmed,
      { underlyingWithdrawalAnnounced }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    } else if (underlyingWithdrawalAnnounced.resolution == core.UnderlyingWithdrawalResolution.CANCELLED) {
      resp.events.resolution = await em.findOne(Entities.UnderlyingWithdrawalCancelled,
        { underlyingWithdrawalAnnounced }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    }
    return resp
  }

  protected async selfMintEventDetails(
    em: EntityManager, selfMint: Entities.SelfMint
  ): Promise<ExplorerType.SelfMintEventDetails> {
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, selfMint.fasset,
      PaymentReference.selfMint(selfMint.agentVault.address.hex),
      {
        transaction: { value: selfMint.depositedUBA, target: selfMint.agentVault.underlyingAddress },
        block: { timestamp: { $lte: selfMint.evmLog.block.timestamp } }
      }
    )
    return { events: { original: selfMint }, underlyingTransaction }
  }

  protected async underlyingBalanceToppedUpEventDetails(
    em: EntityManager, underlyingTopup: Entities.UnderlyingBalanceToppedUp
  ): Promise<ExplorerType.BalanceTopupEventDetails> {
    const hash = underlyingTopup.transactionHash.slice(2).toUpperCase()
    const underlyingTransaction = await em.findOneOrFail(Entities.UnderlyingReference,
      { transaction: { hash }}, { populate: [ 'transaction.block', 'transaction.source', 'transaction.target' ] })
    return { events: { original: underlyingTopup }, underlyingTransaction }
  }

  protected async directMintEventDetails(
    em: EntityManager, directMint: Entities.DirectMintingExecuted | Entities.DirectMintingExecutedToSmartAccount
  ): Promise<ExplorerType.DirectMintEventDetails> {
    const hash = directMint.transactionId.slice(2).toUpperCase()
    const underlyingTransaction = await em.findOne(Entities.UnderlyingTransaction,
      { hash }, { populate: [ 'block', 'source', 'target' ] })
    return { events: { original: directMint }, underlyingTransaction }
  }

  protected async nativeTransactionClassification(em: EntityManager, hash: string): Promise<ExplorerType.GenericTransactionClassification> {
    const logs = await em.find(Entities.EvmLog, { transaction: { hash } }, { populate: [ 'transaction' ]})
    const classified = await Promise.all(logs.map(async log => {
      const oglog = await this.nativeEventClassification(em, log)
      if (oglog == null) return null
      return { eventName: log.name, transactionHash: oglog.transaction.hash }
    }))
    return classified.filter(x => x != null) as ExplorerType.GenericTransactionClassification
  }

  protected async nativeEventClassification(em: EntityManager, log: Entities.EvmLog): Promise<Entities.EvmLog | null> {
    switch (log.name) {
      case EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED:
        return log
      case EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED:
      case EVENTS.ASSET_MANAGER.REDEMPTION_WITH_TAG_REQUESTED:
        return log
      case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_STARTED:
        return log
      case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_REQUESTED:
        return log
      case EVENTS.ASSET_MANAGER.SELF_MINT:
      case EVENTS.ASSET_MANAGER.DIRECT_MINTING_EXECUTED:
      case EVENTS.ASSET_MANAGER.DIRECT_MINTING_EXECUTED_TO_SMART_ACCOUNT:
        return log
      case EVENTS.ASSET_MANAGER.UNDERLYING_BALANCE_TOPPED_UP:
        return log
      case EVENTS.ASSET_MANAGER.UNDERLYING_WITHDRAWAL_ANNOUNCED:
        return log
      case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_SUCCESSFUL:
        return em.findOneOrFail(Entities.TransferToCoreVaultSuccessful,
          { evmLog: log }, { populate: [ 'transferToCoreVaultStarted.evmLog.transaction' ]}
        ).then(x => x.transferToCoreVaultStarted.evmLog)
      case EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_DEFAULTED:
        return em.findOneOrFail(Entities.TransferToCoreVaultDefaulted,
          { evmLog: log }, { populate: [ 'transferToCoreVaultStarted.evmLog.transaction' ]}
        ).then(x => x.transferToCoreVaultStarted.evmLog)
      case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CONFIRMED:
        return em.findOneOrFail(Entities.ReturnFromCoreVaultConfirmed,
          { evmLog: log }, { populate: [ 'returnFromCoreVaultRequested.evmLog.transaction' ] }
        ).then(x => x.returnFromCoreVaultRequested.evmLog)
      case EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CANCELLED:
        return em.findOneOrFail(Entities.ReturnFromCoreVaultCancelled,
          { evmLog: log }, { populate: [ 'returnFromCoreVaultRequested.evmLog.transaction' ] }
        ).then(x => x.returnFromCoreVaultRequested.evmLog)
      case EVENTS.ASSET_MANAGER.MINTING_EXECUTED:
        return em.findOneOrFail(Entities.MintingExecuted,
          { evmLog: log }, { populate: [ 'collateralReserved.evmLog.transaction' ] }
        ).then(x => x.collateralReserved.evmLog)
      case EVENTS.ASSET_MANAGER.MINTING_PAYMENT_DEFAULT:
        return em.findOneOrFail(Entities.MintingPaymentDefault,
           { evmLog: log }, { populate: [ 'collateralReserved.evmLog.transaction' ] }
        ).then(x => x.collateralReserved.evmLog)
      case EVENTS.ASSET_MANAGER.COLLATERAL_RESERVATION_DELETED:
        return em.findOneOrFail(Entities.CollateralReservationDeleted,
          { evmLog: log }, { populate: [ 'collateralReserved.evmLog.transaction' ] }
        ).then(x => x.collateralReserved.evmLog)
      case EVENTS.ASSET_MANAGER.REDEMPTION_PERFORMED:
        return em.findOneOrFail(Entities.RedemptionPerformed,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      case EVENTS.ASSET_MANAGER.REDEMPTION_DEFAULT:
        return em.findOneOrFail(Entities.RedemptionDefault,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      case EVENTS.ASSET_MANAGER.REDEMPTION_REJECTED:
        return em.findOneOrFail(Entities.RedemptionRejected,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      case EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_FAILED:
        return em.findOneOrFail(Entities.RedemptionPaymentFailed,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      case EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_BLOCKED:
        return em.findOneOrFail(Entities.RedemptionPaymentBlocked,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      case EVENTS.ASSET_MANAGER.UNDERLYING_WITHDRAWAL_CONFIRMED:
        return em.findOneOrFail(Entities.UnderlyingWithdrawalConfirmed,
          { evmLog: log }, { populate: [ 'underlyingWithdrawalAnnounced.evmLog.transaction' ] }
        ).then(x => x.underlyingWithdrawalAnnounced.evmLog)
      case EVENTS.ASSET_MANAGER.UNDERLYING_WITHDRAWAL_CANCELLED:
        return em.findOneOrFail(Entities.UnderlyingWithdrawalCancelled,
          { evmLog: log }, { populate: [ 'underlyingWithdrawalAnnounced.evmLog.transaction' ] }
        ).then(x => x.underlyingWithdrawalAnnounced.evmLog)
      default:
        return null
    }
  }

  protected async rippleTransactionClassification(em: EntityManager, hash: string): Promise<ExplorerType.GenericTransactionClassification> {
    let oglog: { evmLog: Entities.EvmLog | null } = null
    const fasset = core.FAssetType.FXRP
    const reference = await em.findOne(Entities.UnderlyingReference,
      { transaction: { hash } }, { populate: [ 'transaction.block' ] })
    if (reference == null || PaymentReference.isDirectMinting(reference.reference)) {
      const transactionId = '0x' + hash.toLowerCase()
      const [directMints, directMintsSA] = await Promise.all([
        em.find(Entities.DirectMintingExecuted,
          { transactionId, fasset }, { populate: [ 'evmLog.transaction' ] }),
        em.find(Entities.DirectMintingExecutedToSmartAccount,
          { transactionId, fasset }, { populate: [ 'evmLog.transaction' ] })
      ])
      return [...directMints, ...directMintsSA].map(dm => ({
        eventName: dm.evmLog.name, transactionHash: dm.evmLog.transaction.hash
      }))
    }
    if (PaymentReference.isMint(reference.reference)) {
      oglog = await em.findOneOrFail(Entities.CollateralReserved,
        { paymentReference: reference.reference, fasset }, { populate: [ 'evmLog.transaction' ] })
    } else if (PaymentReference.isRedeem(reference.reference)) {
      const requestId = PaymentReference.decodeId(reference.reference)
      oglog = await em.findOne(Entities.TransferToCoreVaultStarted,
        { transferRedemptionRequestId: Number(requestId), fasset }, { populate: [ 'evmLog.transaction' ] })
      if (oglog == null) {
        oglog = await em.findOneOrFail(Entities.RedemptionRequested,
          { paymentReference: reference.reference, fasset }, { populate: [ 'evmLog.transaction' ] })
      }
    } else if (PaymentReference.isReturnFromCoreVault(reference.reference)) {
      oglog = await em.findOneOrFail(Entities.ReturnFromCoreVaultRequested,
        { paymentReference: reference.reference, fasset }, { populate: [ 'evmLog.transaction' ] })
    } else if (PaymentReference.isRedeemFromCoreVault(reference.reference)) {
      oglog = await em.findOneOrFail(Entities.CoreVaultRedemptionRequested,
        { paymentReference: reference.reference, fasset }, { populate: [ 'evmLog.transaction' ]})
    } else if (PaymentReference.isWithdrawal(reference.reference)) {
      oglog = await em.findOneOrFail(Entities.UnderlyingWithdrawalAnnounced,
        { paymentReference: reference.reference, fasset }, { populate: [ 'evmLog.transaction' ]})
    } else if (PaymentReference.isTopup(reference.reference)) {
      const transactionHash = '0x' + hash.toLowerCase()
      oglog = await em.findOneOrFail(Entities.UnderlyingBalanceToppedUp,
        { transactionHash, fasset }, { populate: [ 'evmLog.transaction' ]})
    } else if (PaymentReference.isSelfMint(reference.reference)) {
      const hex = PaymentReference.decodeAddress(reference.reference)
      const resp = await em.createQueryBuilder(Entities.SelfMint, 'sm')
        .select(['el.name', 'et.hash'])
        .join('sm.evmLog', 'el')
        .join('el.block', 'eb')
        .join('el.transaction', 'et')
        .join('sm.agentVault', 'av')
        .join('av.address', 'ea')
        .where({
          'ea.hex': hex,
          'eb.timestamp': { $gte: reference.transaction.block.timestamp }
        })
        .orderBy({ 'eb.timestamp': 'asc' })
        .execute() as [ { name: string, hash: string }]
      return resp.map(({ name, hash}) => ({ eventName: name, transactionHash: hash }))
    }
    return [{ eventName: oglog.evmLog.name, transactionHash: oglog.evmLog.transaction.hash }]
  }

  protected async mintStats(em: EntityManager, start: number, end: number): Promise<ExplorerType.ExplorerStatistics> {
    // eslint-disable-next-line
    const directMintQuery = (entity: new () => any) =>
      em.createQueryBuilder(entity, 'dm')
        .select(['dm.fasset', raw('count(dm.evm_log_id) as count'), raw('sum(dm.minted_amount_uba) as value')])
        .join('dm.evmLog', 'el').join('el.block', 'eb')
        .where({ 'eb.timestamp': { $gte: start, $lt: end } })
        .groupBy('dm.fasset')
        .execute() as Promise<{ fasset: core.FAssetType, count: number, value: string }[]>
    const [standard, direct, directSA] = await Promise.all([
      em.createQueryBuilder(Entities.MintingExecuted, 'me')
        .select([
          'cr.fasset',
          raw('count(me.evm_log_id) as count'),
          raw('sum(cr.value_uba) as value'),
          raw('sum(meeb.timestamp - creb.timestamp) as time')
        ])
        .join('me.collateralReserved', 'cr')
        .join('me.evmLog', 'meel')
        .join('cr.evmLog', 'crel')
        .join('meel.block', 'meeb')
        .join('crel.block', 'creb')
        .where({ 'meeb.timestamp': { $gte: start, $lt: end } })
        .groupBy('cr.fasset')
        .execute() as Promise<{ fasset: core.FAssetType, count: number, value: string, time: number }[]>,
      directMintQuery(Entities.DirectMintingExecuted),
      directMintQuery(Entities.DirectMintingExecutedToSmartAccount)
    ])
    const count = [standard, direct, directSA]
      .map(r => this.convertOrmResultToFAssetAmountResult(r, 'count'))
      .reduce((acc, r) => this.transformFAssetAmountResults(acc, r, (a, b) => a + b))
    const value = [standard, direct, directSA]
      .map(r => this.convertOrmResultToFAssetValueResult(r, 'value'))
      .reduce((acc, r) => this.transformFAssetValueResults(acc, r, (a, b) => a + b))
    return {
      count, value,
      time: this.convertOrmResultToFAssetAmountResult(standard, 'time')
    }
  }

  protected async redeemStats(em: EntityManager, start: number, end: number): Promise<ExplorerType.ExplorerStatistics> {
    const resp = await em.createQueryBuilder(Entities.RedemptionPerformed, 'rp')
      .select([
        'rr.fasset',
        raw('count(rp.evm_log_id) as count'),
        raw('sum(rr.value_uba) as value'),
        raw('sum(rpeb.timestamp - rreb.timestamp) as time')
      ])
      .join('rp.redemptionRequested', 'rr')
      .join('rp.evmLog', 'rpel')
      .join('rr.evmLog', 'rrel')
      .join('rpel.block', 'rpeb')
      .join('rrel.block', 'rreb')
      .join('rr.redeemer', 'rdmr')
      .where({
        'rdmr.hex': { $ne: DEAD_ADDRESS },
        'rpeb.timestamp': { $gte: start, $lt: end }
      })
      .groupBy('rr.fasset')
      .execute() as { fasset: core.FAssetType, count: number, value: string, time: number }[]
    return {
      count: this.convertOrmResultToFAssetAmountResult(resp, 'count'),
      value: this.convertOrmResultToFAssetValueResult(resp, 'value'),
      time: this.convertOrmResultToFAssetAmountResult(resp, 'time')
    }
  }

  protected async getUnderlyingTransaction(
    em: EntityManager,
    fasset: core.FAssetType,
    reference: string,
    filters: FilterQuery<Entities.UnderlyingReference> = {}
  ): Promise<Entities.UnderlyingReference | Entities.UnderlyingReference[] | null> {
    const transactions = await em.find(Entities.UnderlyingReference,
      { fasset, reference, ...filters as object },
      {
        populate: [ 'transaction.block', 'transaction.source', 'transaction.target' ],
        orderBy: { block: { timestamp: 'DESC' } }
      }
    )
    if (transactions.length == 0) return null
    const successful = transactions.filter(x => x.transaction.result == XRP_TRANSACTION_SUCCESS_CODE)
    if (successful.length > 0) return successful.length > 1 ? successful : successful[0]
    return transactions.length > 1 ? transactions : transactions[0]
  }

  protected eventNameToTransactionType(name: string): ExplorerType.TransactionType {
    switch (name) {
      case 'CollateralReserved':
        return ExplorerType.TransactionType.Mint
      case 'RedemptionRequested':
      case 'RedemptionWithTagRequested':
        return ExplorerType.TransactionType.Redeem
      case 'TransferToCoreVaultStarted':
        return ExplorerType.TransactionType.TransferToCV
      case 'ReturnFromCoreVaultRequested':
        return ExplorerType.TransactionType.ReturnFromCV
      case 'SelfMint':
        return ExplorerType.TransactionType.SelfMint
      case 'UnderlyingWithdrawalAnnounced':
        return ExplorerType.TransactionType.Withdrawal
      case 'UnderlyingBalanceToppedUp':
        return ExplorerType.TransactionType.Topup
      case 'DirectMintingExecuted':
      case 'DirectMintingExecutedToSmartAccount':
        return ExplorerType.TransactionType.DirectMint
      default:
        throw new Error(`event name ${name} cannot be mapped to transaction type`)
    }
  }

  protected resolutionFromTransactionType(type: ExplorerType.TransactionType, resolution: number): string | undefined {
    switch (type) {
      case ExplorerType.TransactionType.Mint:
        return core.CollateralReservationResolution[resolution]
      case ExplorerType.TransactionType.Redeem:
        return core.RedemptionResolution[resolution]
      case ExplorerType.TransactionType.TransferToCV:
        return core.TransferToCoreVaultResolution[resolution]
      case ExplorerType.TransactionType.ReturnFromCV:
        return core.ReturnFromCoreVaultResolution[resolution]
      case ExplorerType.TransactionType.Withdrawal:
        return core.UnderlyingWithdrawalResolution[resolution]
      case ExplorerType.TransactionType.SelfMint:
        return undefined
      case ExplorerType.TransactionType.Topup:
      case ExplorerType.TransactionType.DirectMint:
        return undefined
      default:
        throw new Error(`invalid transaction type ${type}`)
    }
  }

  private async getCoreVaultAddress(em: EntityManager, fasset: core.FAssetType): Promise<string> {
    if (!this.coreVaultCache.has(fasset)) {
      const settings = await em.findOne(Entities.CoreVaultManagerSettings,
        { fasset }, { populate: ['coreVault'] })
      this.coreVaultCache.set(fasset, settings.coreVault?.text)
    }
    return this.coreVaultCache.get(fasset)
  }

  private isNativeTransactionHash(hash: string): boolean {
    return /0x[a-fA-F0-9]{64}/.test(hash)
  }
  private isRippleTransactionHash(hash: string): boolean {
    return /[A-F0-9]{64}/.test(hash)
  }

  private standardizeInterval(a: number, b?: number): [number | null, number | null] {
    if (a == null && b != null) {
      return [0, b]
    } else if (a != null && b == null) {
      return [a, unixnow()]
    }
    return [a, b]
  }
}