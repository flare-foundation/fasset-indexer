import { ContractLookup, FAssetType } from "fasset-indexer-core"
import * as Entities from "fasset-indexer-core/entities"
import * as ExplorerType from "./interface"
import * as SQL from "./utils/raw-sql"
import type { EntityManager, ORM } from "fasset-indexer-core/orm"
import { EVENTS } from "fasset-indexer-core/config"
import { unixnow } from "src/shared/utils"

const VALID_EVENTS = [
  EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED,
  EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED,
  EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_STARTED,
  EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_REQUESTED
]

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
    asc: boolean = false
  ): Promise<ExplorerType.TransactionsInfo> {
    const em = this.orm.em.fork()
    const isuser = user != null
    const isagent = agent != null
    ;[start, end] = this.standardizeInterval(start, end)
    const window = start != null || end != null
    const transactions = await em.getConnection('read').execute(
      SQL.EXPLORER_TRANSACTIONS(isuser, isagent, asc, window),
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
    const count = (info.length < limit)
      ? offset + info.length
      : await this.getExplorerTransactionCount(em, user, agent)
    return { transactions: info, count }
  }

  async transactionClassification(
    hash: string
  ): Promise<ExplorerType.GenericTransactionClassification> {
    const em = this.orm.em.fork()
    if (this.isNativeTransactionHash(hash)) {
      const logs = await em.find(Entities.EvmLog, {
        transaction: { hash },
        name: { $in: VALID_EVENTS }
      })
      return logs.map(log => ({
        transactionHash: hash,
        eventName: ExplorerType.TransactionType[
          this.eventNameToTransactionType(log.name)]
      }))
    } else if (this.isRippleTransactionHash(hash)) {
      const resp = await em.getConnection('read').execute(
        SQL.EVENT_FROM_UNDERLYING_HASH, [hash]
      ) as { hash: string, name: string }[]
      return resp.map(({ hash, name }) => ({
        transactionHash: hash,
        eventName:ExplorerType.TransactionType[
          this.eventNameToTransactionType(name)]
      }))
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
  ): Promise<ExplorerType.RetrunFromCoreVaultTransactionDetails> {
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

  protected async mintingEventDetails(
    em: EntityManager, collateralReserved: Entities.CollateralReserved
  ): Promise<ExplorerType.MintEventDetails> {
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, collateralReserved.fasset,
      collateralReserved.paymentReference,
      collateralReserved.paymentAddress.text
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
      redemptionRequested.paymentAddress.text,
      redemptionRequested.agentVault.underlyingAddress.text
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
      redemptionRequested.paymentAddress.text,
      transferToCoreVaultStarted.agentVault.underlyingAddress.text
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
      returnFromCoreVaultRequested.agentVault.underlyingAddress.text,
      coreVault
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

  async getExplorerTransactionCount(em: EntityManager, user?: string, agent?: string): Promise<number> {
    let query = null
    if (user != null) {
      query = SQL.EXPLORER_TRANSACTION_USER_COUNT
    } else if (agent != null) {
      query = SQL.EXPLORER_TRANSACTION_AGENT_COUNT
    } else {
      query = SQL.EXPLORER_TRANSACTION_COUNT
    }
    const resp = await em.getConnection('read').execute(query, [user ?? agent])
    return Number(resp[0]?.cnt)
  }

  protected async getUnderlyingTransaction(
    em: EntityManager, fasset: FAssetType, reference: string, target: string, source?: string
  ): Promise<Entities.UnderlyingVoutReference | null> {
    const obj = source == null ? {} : { source: { text: source } }
    return em.findOne(Entities.UnderlyingVoutReference,
      { fasset, reference, transaction: { target: { text: target }, ...obj } },
      { populate: [ 'transaction.block', 'transaction.source', 'transaction.target' ] }
    )
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