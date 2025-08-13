import { ContractLookup, FAssetType } from "fasset-indexer-core"
import * as Entities from "fasset-indexer-core/entities"
import * as ExplorerType from "./interface"
import { EXPLORER_TRANSACTIONS } from "./utils/raw-sql"
import type { EntityManager, ORM } from "fasset-indexer-core/orm"


export class ExplorerAnalytics {
  protected lookup: ContractLookup
  private agentNameCache = new Map<number, Entities.AgentVault>()
  private coreVaultCache = new Map<FAssetType, string>()

  constructor(public readonly orm: ORM, public readonly chain: string, addressesJson?: string) {
    this.lookup = new ContractLookup(chain, addressesJson)
  }

  async transactions(limit: number, offset: number): Promise<ExplorerType.TransactionInfo[]> {
    const em = this.orm.em.fork()
    const transactions = await em.getConnection('read').execute(EXPLORER_TRANSACTIONS, [limit, offset]) as {
      name: string, timestamp: number, source: string, hash: string, agent_id: number, value_uba: string
    }[]
    const ret = []
    for (const { name, timestamp, source, hash, agent_id, value_uba } of transactions) {
      const agent = await this.getAgentVault(em, agent_id)
      const transactionType = this.eventNameToTransactionType(name)
      ret.push({
        name: ExplorerType.TransactionType[transactionType],
        agent, timestamp, origin: source, hash, value: BigInt(value_uba)
      })
    }
    return ret
  }

  async mintingTransactionDetails(hash: string): Promise<ExplorerType.MintTransactionDetails> {
    const em = this.orm.em.fork()
    const collateralReserved = await em.findOneOrFail(Entities.CollateralReserved,
      { evmLog: { transaction: { hash }} },
      { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.owner.manager',
        'minter', 'paymentAddress', 'executor'
      ] }
    )
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, collateralReserved.fasset,
      collateralReserved.paymentReference,
      collateralReserved.paymentAddress.text
    )
    const resp: ExplorerType.MintTransactionDetails = {
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

  async redemptionTransactionDetails(hash: string): Promise<ExplorerType.RedeemTransactionDetails> {
    const em = this.orm.em.fork()
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested,
      { evmLog: { transaction: { hash } } },
      { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager',
        'redeemer', 'paymentAddress', 'executor'
      ] })
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, redemptionRequested.fasset,
      redemptionRequested.paymentReference,
      redemptionRequested.paymentAddress.text,
      redemptionRequested.agentVault.underlyingAddress.text
    )
    const resp: ExplorerType.RedeemTransactionDetails = {
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

  async transferToCoreVaultTransactionDetails(hash: string): Promise<ExplorerType.TransferToCoreVaultTransactionDetails> {
    const em = this.orm.em.fork()
    const transferToCoreVaultStarted = await em.findOneOrFail(Entities.TransferToCoreVaultStarted,
      { evmLog: { transaction: { hash } } },
      { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager'
      ] }
    )
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
    const resp: ExplorerType.TransferToCoreVaultTransactionDetails = {
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

  async returnFromCoreVaultTransactionDetails(hash: string): Promise<ExplorerType.ReturnFromCoreVaultTransactionDetails> {
    const em = this.orm.em.fork()
    const returnFromCoreVaultRequested = await em.findOneOrFail(Entities.ReturnFromCoreVaultRequested,
      { evmLog: { transaction: { hash }} }, { populate: [
        'evmLog.block', 'evmLog.transaction.source',
        'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager'
      ] }
    )
    const coreVault = await this.getCoreVaultAddress(em, returnFromCoreVaultRequested.fasset)
    const underlyingTransaction = await this.getUnderlyingTransaction(
      em, returnFromCoreVaultRequested.fasset,
      returnFromCoreVaultRequested.paymentReference,
      returnFromCoreVaultRequested.agentVault.underlyingAddress.text,
      coreVault
    )
    const resp: ExplorerType.ReturnFromCoreVaultTransactionDetails = {
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

  private async getAgentVault(em: EntityManager, id: number): Promise<Entities.AgentVault> {
    if (!this.agentNameCache.has(id)) {
      const vault = await em.findOne(Entities.AgentVault,
        { address: id }, { populate: [
          'owner.manager', 'address', 'underlyingAddress', 'collateralPool'
        ] }
      )
      this.agentNameCache.set(id, vault)
    }
    return this.agentNameCache.get(id) ?? null
  }

  private async getCoreVaultAddress(em: EntityManager, fasset: FAssetType): Promise<string> {
    if (!this.coreVaultCache.has(fasset)) {
      const settings = await em.findOne(Entities.CoreVaultManagerSettings,
        { fasset }, { populate: ['coreVault'] })
      this.coreVaultCache.set(fasset, settings.coreVault?.text)
    }
    return this.coreVaultCache.get(fasset)
  }
}