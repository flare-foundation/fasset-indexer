import { ContractLookup, FAssetType } from "fasset-indexer-core"
import * as Entities from "fasset-indexer-core/entities"
import * as ExplorerType from "./types"
import * as SQL from "./utils/raw-sql"
import { PaymentReference } from "fasset-indexer-core/utils"
import { EVENTS } from "fasset-indexer-core/config"
import { XRP_TRANSACTION_SUCCESS_CODE } from 'fasset-indexer-xrp/constants'
import { unixnow } from "../shared/utils"
import type { EntityManager, ORM } from "fasset-indexer-core/orm"
import type { FilterQuery } from "@mikro-orm/core"



const ALL_TRANSACTION_TYPES = Object.values(ExplorerType.TransactionType)
  .filter(v => typeof v === "number")

export class ExplorerAnalytics {
  protected lookup: ContractLookup
  private coreVaultCache = new Map<FAssetType, string>()

  constructor(
    public readonly orm: ORM,
    public readonly chain: string,
    addressesJson?: string
  ) {
    this.lookup = new ContractLookup(chain, addressesJson)
  }

  async transactions(
    limit: number, offset: number,
    user?: string, agent?: string,
    start?: number, end?: number,
    asc: boolean = false,
    types: ExplorerType.TransactionType[] = ALL_TRANSACTION_TYPES
  ): Promise<ExplorerType.TransactionsInfo> {
    const em = this.orm.em.fork()
    const isuser = user != null
    const isagent = agent != null
    ;[start, end] = this.standardizeInterval(start, end)
    const window = start != null || end != null
    const transactions = await em.getConnection('read').execute(
      SQL.EXPLORER_TRANSACTIONS(isuser, isagent, asc, window, types),
      (isuser || isagent)
        ? (window ? [user ?? agent, start, end, limit, offset] : [user ?? agent, limit, offset])
        : (window ? [start, end, limit, offset] : [limit, offset])
    ) as SQL.ExplorerTransactionsOrmResult[]
    const info: ExplorerType.TransactionInfo[] = []
    for (const { name, timestamp, source, hash, agent_vault, agent_name, value_uba, user } of transactions) {
      const transactionType = this.eventNameToTransactionType(name)
      info.push({
        name: ExplorerType.TransactionType[transactionType] as any,
        agentVault: agent_vault, agentName: agent_name, user,
        timestamp, origin: source, hash, value: BigInt(value_uba)
      })
    }
    return { transactions: info, count: transactions[0]?.count ?? 0 }
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
    const flows: ExplorerType.MintEventDetails[] = []
    for (const collateralReserved of collateralReservations) {
      const details = await this.mintingEventDetails(em, collateralReserved)
      flows.push(details)
    }
    return { flows }
  }

  async redemptionTransactionDetails(
    hash: string
  ): Promise<ExplorerType.RedeemTransactionDetails> {
    const em = this.orm.em.fork()
    const redemptionRequests = await em.find(Entities.RedemptionRequested,
      { evmLog: { transaction: { hash } } },
      { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager',
        'redeemer', 'paymentAddress', 'executor'
      ] })
    const flows: ExplorerType.RedeemEventDetails[] = []
    for (const redemptionRequested of redemptionRequests) {
      const details = await this.redemptionEventDetails(em, redemptionRequested)
      flows.push(details)
    }
    const redemptionRequestIncompletes = await em.find(Entities.RedemptionRequestIncomplete,
      { evmLog: { transaction: { hash } }}, { populate: [ 'evmLog.block', 'redeemer' ] })
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
    const flows: ExplorerType.TransferToCoreVaultEventDetails[] = []
    for (const transferToCoreVaultStarted of transferToCoreVaultRequests) {
      const details = await this.transferToCoreVaultEventDetails(em, transferToCoreVaultStarted)
      flows.push(details)
    }
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
    const flows: ExplorerType.ReturnFromCoreVaultEventDetails[] = []
    for (const returnFromCoreVaultRequested of returnFromCoreVaultRequests) {
      const details = await this.returnFromCoreVaultEventDetails(em, returnFromCoreVaultRequested)
      flows.push(details)
    }
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
    const flows: ExplorerType.SelfMintEventDetails[] = []
    for (const selfMint of selfMints) {
      const details = await this.selfMintEventDetails(em, selfMint)
      flows.push(details)
    }
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
    // find resolution event
    const mintingExecuted = await em.findOne(Entities.MintingExecuted,
      { collateralReserved }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ]} )
    if (mintingExecuted != null) {
      resp.events.resolution = mintingExecuted
      return resp
    }
    const mintingDefaulted = await em.findOne(Entities.MintingPaymentDefault,
      { collateralReserved }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ]} )
    if (mintingDefaulted != null) {
      resp.events.resolution = mintingDefaulted
      return resp
    }
    const mintingDeleted = await em.findOne(Entities.CollateralReservationDeleted,
      { collateralReserved }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    if (mintingDeleted != null) {
      resp.events.resolution = mintingDeleted
      return resp
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
    const redemptionPerformed = await em.findOne(Entities.RedemptionPerformed,
      { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    if (redemptionPerformed != null) {
      resp.events.resolution = redemptionPerformed
      return resp
    }
    const redemptionDefault = await em.findOne(Entities.RedemptionDefault,
      { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    if (redemptionDefault != null) {
      resp.events.resolution = redemptionDefault
      return resp
    }
    const redemptionRejected = await em.findOne(Entities.RedemptionRejected,
      { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ]})
      if (redemptionRejected != null) {
        resp.events.resolution = redemptionRejected
        return resp
      }
    const redemptionBlocked = await em.findOne(Entities.RedemptionPaymentBlocked,
      { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    if (redemptionBlocked != null) {
      resp.events.resolution = redemptionBlocked
      return resp
    }
    const redemptionFailed = await em.findOne(Entities.RedemptionPaymentFailed,
      { redemptionRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    if (redemptionFailed != null) {
      resp.events.resolution = redemptionFailed
      return resp
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
    const transferSuccessful = await em.findOne(Entities.TransferToCoreVaultSuccessful,
      { transferToCoreVaultStarted }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    if (transferSuccessful != null) {
      resp.events.resolution = transferSuccessful
      return resp
    }
    const transferDefaulted = await em.findOne(Entities.TransferToCoreVaultDefaulted,
      { transferToCoreVaultStarted }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] } )
    if (transferDefaulted != null) {
      resp.events.resolution = transferDefaulted
      return resp
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
    const returnConfirmed = await em.findOne(Entities.ReturnFromCoreVaultConfirmed,
      { returnFromCoreVaultRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    if (returnConfirmed != null) {
      resp.events.resolution = returnConfirmed
      return resp
    }
    const returnCancelled = await em.findOne(Entities.ReturnFromCoreVaultCancelled,
      { returnFromCoreVaultRequested }, { populate: [ 'evmLog.block', 'evmLog.transaction.source' ] })
    if (returnCancelled != null) {
      resp.events.resolution = returnCancelled
      return resp
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

  protected async nativeTransactionClassification(em: EntityManager, hash: string): Promise<ExplorerType.GenericTransactionClassification> {
    const ret: ExplorerType.GenericTransactionClassification = []
    const logs = await em.find(Entities.EvmLog, { transaction: { hash } })
    for (const log of logs) {
      let oglog: Entities.EvmLog | null = null
      if (
           log.name == EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED
        || log.name == EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED
        || log.name == EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_STARTED
        || log.name == EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_REQUESTED
        || log.name == EVENTS.ASSET_MANAGER.SELF_MINT
      ) {
        oglog = log
      // core vault transfers
      } else if (log.name == EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_SUCCESSFUL) {
        oglog = await em.findOneOrFail(Entities.TransferToCoreVaultSuccessful,
          { evmLog: log }, { populate: [ 'transferToCoreVaultStarted.evmLog.transaction' ]}
        ).then(x => x.transferToCoreVaultStarted.evmLog)
      } else if (log.name == EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_DEFAULTED) {
        oglog = await em.findOneOrFail(Entities.TransferToCoreVaultDefaulted,
          { evmLog: log }, { populate: [ 'transferToCoreVaultStarted.evmLog.transaction' ]}
        ).then(x => x.transferToCoreVaultStarted.evmLog)
      // core vault returns
      } else if (log.name == EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CONFIRMED) {
        oglog = await em.findOneOrFail(Entities.ReturnFromCoreVaultConfirmed,
          { evmLog: log }, { populate: [ 'returnFromCoreVaultRequested.evmLog.transaction' ] }
        ).then(x => x.returnFromCoreVaultRequested.evmLog)
      } else if (log.name == EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CANCELLED) {
        oglog = await em.findOneOrFail(Entities.ReturnFromCoreVaultCancelled,
          { evmLog: log }, { populate: [ 'returnFromCoreVaultRequested.evmLog.transaction' ] }
        ).then(x => x.returnFromCoreVaultRequested.evmLog)
      // mintings
      } else if (log.name == EVENTS.ASSET_MANAGER.MINTING_EXECUTED) {
        oglog = await em.findOneOrFail(Entities.MintingExecuted,
          { evmLog: log }, { populate: [ 'collateralReserved.evmLog.transaction' ] }
        ).then(x => x.collateralReserved.evmLog)
      } else if (log.name == EVENTS.ASSET_MANAGER.MINTING_PAYMENT_DEFAULT) {
        oglog = await em.findOneOrFail(Entities.MintingPaymentDefault,
           { evmLog: log }, { populate: [ 'collateralReserved.evmLog.transaction' ] }
        ).then(x => x.collateralReserved.evmLog)
      } else if (log.name == EVENTS.ASSET_MANAGER.COLLATERAL_RESERVATION_DELETED) {
        oglog = await em.findOneOrFail(Entities.CollateralReservationDeleted,
          { evmLog: log }, { populate: [ 'collateralReserved.evmLog.transaction' ] }
        ).then(x => x.collateralReserved.evmLog)
      // redemptions
      } else if (log.name == EVENTS.ASSET_MANAGER.REDEMPTION_PERFORMED) {
        oglog = await em.findOneOrFail(Entities.RedemptionPerformed,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      } else if (log.name == EVENTS.ASSET_MANAGER.REDEMPTION_DEFAULT) {
        oglog = await em.findOneOrFail(Entities.RedemptionDefault,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      } else if (log.name == EVENTS.ASSET_MANAGER.REDEMPTION_REJECTED) {
        oglog = await em.findOneOrFail(Entities.RedemptionRejected,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      } else if (log.name == EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_FAILED) {
        oglog = await em.findOneOrFail(Entities.RedemptionPaymentFailed,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      } else if (log.name == EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_BLOCKED) {
        oglog = await em.findOneOrFail(Entities.RedemptionPaymentBlocked,
          { evmLog: log }, { populate: [ 'redemptionRequested.evmLog.transaction' ] }
        ).then(x => x.redemptionRequested.evmLog)
      } else {
        continue
      }
      ret.push({ eventName: log.name, transactionHash: oglog.transaction.hash })
    }
    return ret
  }

  protected async rippleTransactionClassification(em: EntityManager, hash: string): Promise<ExplorerType.GenericTransactionClassification> {
    let oglog: { evmLog: Entities.EvmLog | null } = null
    const fasset = FAssetType.FXRP
    const reference = await em.findOneOrFail(Entities.UnderlyingVoutReference,
      { transaction: { hash } }, { populate: [ 'transaction.block' ] })
    if (PaymentReference.isMint(reference.reference)) {
      const oglog = await em.findOneOrFail(Entities.CollateralReserved,
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
      oglog = await em.findOneOrFail(Entities.UnderlyingBalanceToppedUp,
        { transactionHash: hash, fasset }, { populate: [ 'evmLog.transaction' ]})
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
        .execute()
      //@ts-ignore
      return resp
    }
    return [{ eventName: oglog.evmLog.name, transactionHash: oglog.evmLog.transaction.hash }]
  }

  protected async getUnderlyingTransaction(
    em: EntityManager,
    fasset: FAssetType,
    reference: string,
    filters: FilterQuery<Entities.UnderlyingVoutReference> = {}
  ): Promise<Entities.UnderlyingVoutReference | null> {
    const transactions = await em.find(Entities.UnderlyingVoutReference,
      { fasset, reference, ...filters as object },
      {
        populate: [ 'transaction.block', 'transaction.source', 'transaction.target' ],
        orderBy: { block: { timestamp: 'DESC' } }
      }
    )
    if (transactions.length == 0) return null
    const successful = transactions.filter(x => x.transaction.result == XRP_TRANSACTION_SUCCESS_CODE)
    if (successful.length > 0) return successful[0]
    return transactions[0]
  }

  protected eventNameToTransactionType(name: string): ExplorerType.TransactionType {
    switch (name) {
      case 'CollateralReserved':
        return ExplorerType.TransactionType.Mint
      case 'RedemptionRequested':
        return ExplorerType.TransactionType.Redeem
      case 'TransferToCoreVaultStarted':
        return ExplorerType.TransactionType.TransferToCV
      case 'ReturnFromCoreVaultRequested':
        return ExplorerType.TransactionType.ReturnFromCV
      case 'SelfMint':
        return ExplorerType.TransactionType.SelfMint
      default:
        throw new Error(`event name ${name} cannot be mapped to transaction type`)
    }
  }

  private async getCoreVaultAddress(em: EntityManager, fasset: FAssetType): Promise<string> {
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