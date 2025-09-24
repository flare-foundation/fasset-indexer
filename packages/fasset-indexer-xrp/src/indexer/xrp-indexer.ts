import { FAssetType } from "fasset-indexer-core"
import * as Entities from "fasset-indexer-core/entities"
import { findOrCreateEntity, getVar, setVar, type EntityManager } from "fasset-indexer-core/orm"
import { PaymentReference } from "fasset-indexer-core/utils"
import { logger } from "fasset-indexer-core/logger"
import { IXrpMemo, IXrpBlock, IXrpTransaction } from "../client/interface"
import { XRP_BLOCK_HEIGHT_OFFSET, XRP_TIMESTAMP_UNIX_OFFSET } from "../config/constants"
import type { XrpContext } from "../context"


export class XrpIndexer {
  private tracked = new Set<string>()
  private coreVaultLoaded: boolean = false
  private lastGreedyBlockToHandle: number = 0

  constructor(
    public readonly context: XrpContext,
    public readonly firstUnhandledBlockDbKey: string,
    public readonly minBlockDbKey: string,
    public readonly initialTracked: string[]
  ) {
    for (const address of initialTracked) {
      this.tracked.add(address)
    }
  }

  async run(startBlock?: number): Promise<void> {
    return this.runHistoric(startBlock)
  }

  async runHistoric(startBlock?: number, endBlock?: number): Promise<void> {
    const firstUnhandledBlock = await this.firstUnhandledBlock(startBlock)
    if (startBlock === undefined || firstUnhandledBlock > startBlock) {
      startBlock = firstUnhandledBlock
    }
    const lastBlockToHandle = await this.lastBlockToHandle()
    if (endBlock === undefined || endBlock > lastBlockToHandle) {
      endBlock = lastBlockToHandle
    }
    await this.updateTrackedAddresses()
    await this.processBlockBatch(startBlock, endBlock, false)
    // process new blocks but reprocess them again later
    endBlock = await this.latestBlockToHandle()
    startBlock = Math.max(this.lastGreedyBlockToHandle, endBlock)
    await this.processBlockBatch(startBlock, endBlock, true)
  }

  async processBlockBatch(startBlock: number, endBlock: number, greedy: boolean) {
    for (let i = startBlock; i <= endBlock; i += 1) {
      const block = await this.context.provider.block(i)
      await this.processBlock(block)
      if (!greedy) await this.setFirstUnhandledBlock(i + 1)
      this.lastGreedyBlockToHandle = i
      logger.info(`${this.context.chainName} indexer processed block height ${i}`)
    }
  }

  async firstUnhandledBlock(startBlock?: number): Promise<number> {
    const block = await getVar(this.context.orm.em.fork(), this.firstUnhandledBlockDbKey)
    return (block !== null ? Number(block.value!) : startBlock) ?? await this.minBlock()
  }

  // note: this is so new agent vault creation events are indexed before
  //       the xrp indexer skips the associated agent vault underlying addresses
  async lastBlockToHandle(): Promise<number> {
    const blocks = await this.context.orm.em.fork().find(
      Entities.CurrentUnderlyingBlockUpdated, {},
      { limit: 1, orderBy: { underlyingBlockNumber: 'desc' } })
    return blocks[0]?.underlyingBlockNumber ?? 0
  }

  async latestBlockToHandle(): Promise<number> {
    return await this.context.provider.blockHeight() - XRP_BLOCK_HEIGHT_OFFSET
  }

  async minBlock(): Promise<number> {
    const fromDb = await getVar(this.context.orm.em.fork(), this.minBlockDbKey)
    if (fromDb?.value != null) return Number(fromDb.value)
    throw new Error(`No min ${this.context.chainName} block number found for in the database`)
  }

  protected async setFirstUnhandledBlock(block: number): Promise<void> {
    const em = this.context.orm.em.fork()
    await setVar(em, this.firstUnhandledBlockDbKey, block.toString())
  }

  protected async updateTrackedAddresses(): Promise<void> {
    const em = this.context.orm.em.fork()
    await this.updateCoreVaultTracking(em)
    await this.updateAgentVaultTracking(em)
  }

  protected async processBlock(block: IXrpBlock): Promise<void> {
    await this.context.orm.em.transactional(async em => {
    let blockEnt = await em.findOne(Entities.UnderlyingBlock, { hash: block.ledger_hash })
    if (blockEnt == null) {
      blockEnt = await this.storeXrpBlock(em, block)
      for (const tx of block.transactions) {
        await this.processTransaction(em, tx, blockEnt)
      }
    }})
  }

  protected async processTransaction(
    em: EntityManager,
    transaction: IXrpTransaction,
    block: Entities.UnderlyingBlock
  ): Promise<void> {
    let utransaction = null
    const { Account, Destination } = transaction
    if (this.tracked.has(Account) || this.tracked.has(Destination!)) {
      utransaction = await this.storeTransaction(em, transaction, block)
      logger.info(`ripple indexer stored transaction ${utransaction.hash}`)
    }
    if (transaction.Memos == null) return
    for (const memo of transaction.Memos) {
      const reference = this.extractReference(memo)
      if (reference == null) continue
      if (utransaction == null) {
        utransaction = await this.storeTransaction(em, transaction, block)
      }
      if (utransaction.source == null) {
        logger.warn(`transaction ${transaction.hash} has valid FAsset reference ${reference} but no source`)
        continue
      }
      await this.storeReference(em, reference, utransaction, utransaction.source, block)
      logger.info(`ripple indexer stored reference ${reference}`)
      break
    }
  }

  protected async storeTransaction(
    em: EntityManager,
    transaction: IXrpTransaction,
    block: Entities.UnderlyingBlock
  ): Promise<Entities.UnderlyingTransaction> {
    let source = undefined
    let target = undefined
    const { Account, Destination, Amount } = transaction
    if (Account != null) {
      source = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: Account })
    }
    if(Destination != null) {
      target = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: Destination })
    }
    return findOrCreateEntity(em, Entities.UnderlyingTransaction,
      { hash: transaction.hash }, {}, {
        block, source, target,
        value: BigInt(Amount ?? 0),
        result: transaction?.metaData?.TransactionResult,
        fee: BigInt(transaction.Fee ?? 0)
       }
    )
  }

  private async updateCoreVaultTracking(em: EntityManager): Promise<void> {
    if (this.coreVaultLoaded) return
    const settings = await em.findOne(Entities.CoreVaultManagerSettings,
      { fasset: FAssetType.FXRP }, { populate: ['coreVault'] }
    )
    if (settings != null && settings.coreVault != null) {
      this.tracked.add(settings.coreVault.text)
      this.coreVaultLoaded = true
    }
  }

  private async updateAgentVaultTracking(em: EntityManager): Promise<void> {
    const agents = await em.findAll(
      Entities.AgentVault, { populate: [ 'underlyingAddress' ] })
    for (const agent of agents) {
      this.tracked.add(agent.underlyingAddress.text)
    }
  }

  private async storeXrpBlock(em: EntityManager, xrpBlock: IXrpBlock): Promise<Entities.UnderlyingBlock> {
    return em.create(Entities.UnderlyingBlock, {
      hash: xrpBlock.ledger_hash, height: xrpBlock.ledger_index,
      timestamp: xrpBlock.close_time + XRP_TIMESTAMP_UNIX_OFFSET
    }, { persist: false }) // persist only if a transaction is saved within
  }

  private async storeReference(
    em: EntityManager,
    reference: string,
    transaction: Entities.UnderlyingTransaction,
    address: Entities.UnderlyingAddress,
    block: Entities.UnderlyingBlock
  ): Promise<Entities.UnderlyingVoutReference> {
    return em.create(Entities.UnderlyingVoutReference, {
      fasset: FAssetType.FXRP, reference, transaction, address, block
    })
  }

  private extractReference(memo: IXrpMemo): string | null {
    const candidate = memo.Memo.MemoData
    if (typeof candidate != 'string') {
      return null
    }
    const formattedReference = '0x' + candidate.toLowerCase()
    const isValid = PaymentReference.isValid(formattedReference)
    return isValid ? formattedReference : null
  }
}