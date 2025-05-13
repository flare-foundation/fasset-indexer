import { FAssetType } from "fasset-indexer-core"
import { getVar, setVar, findOrCreateUnderlyingAddress, AddressType, type EntityManager, findOrCreateUnderlyingTransaction } from "fasset-indexer-core/orm"
import { UnderlyingBlock, UnderlyingAddress, UnderlyingVoutReference, UnderlyingTransaction } from "fasset-indexer-core/entities"
import { PaymentReference } from "fasset-indexer-core/utils"
import { IXrpMemo, IXrpBlock, IXrpTransaction } from "../client/interface"
import { BLOCK_HEIGHT_OFFSET } from "../constants"
import { logger } from "fasset-indexer-core/logger"
import type { XrpContext } from "../context"


export class XrpIndexer {

  constructor(public readonly context: XrpContext) { }

  async runHistoric(startBlock?: number, endBlock?: number): Promise<void> {
    const firstUnhandledBlock = await this.firstUnhandledBlock(startBlock)
    if (startBlock === undefined || firstUnhandledBlock > startBlock) {
      startBlock = firstUnhandledBlock
    }
    const lastBlockToHandle = await this.lastBlockToHandle()
    if (endBlock === undefined || endBlock > lastBlockToHandle) {
      endBlock = lastBlockToHandle
    }
    for (let i = startBlock; i <= endBlock; i += 1) {
      const block = await this.context.provider.block(i)
      await this.processBlock(block)
      await this.setFirstUnhandledBlock(i + 1)
      logger.info(`${this.context.chainName} indexer processed block height ${i}`)
    }
  }

  async firstUnhandledBlock(startBlock?: number): Promise<number> {
    const block = await getVar(this.context.orm.em.fork(), this.context.firstUnhandledBlockDbKey)
    return (block !== null ? Number(block.value!) : startBlock) ?? await this.minBlock()
  }

  async lastBlockToHandle(): Promise<number> {
    return await this.context.provider.blockHeight() - BLOCK_HEIGHT_OFFSET
  }

  async minBlock(): Promise<number> {
    const fromDb = await getVar(this.context.orm.em.fork(), this.context.minBlockNumberDbKey)
    if (fromDb?.value != null) return Number(fromDb.value)
    throw new Error(`No min ${this.context.chainName} block number found for in the database`)
  }

  protected async setFirstUnhandledBlock(block: number): Promise<void> {
    const em = this.context.orm.em.fork()
    await setVar(em, this.context.firstUnhandledBlockDbKey, block.toString())
  }

  protected async processBlock(block: IXrpBlock): Promise<void> {
    await this.context.orm.em.transactional(async em => {
      const blockEnt = await this.storeXrpBlock(em, block)
      for (const tx of block.transactions) {
        await this.processTx(em, tx, blockEnt)
      }
    })
  }

  protected async processTx(em: EntityManager, transaction: IXrpTransaction, block: UnderlyingBlock): Promise<void> {
    if (transaction.Memos == null) return
    for (const memo of transaction.Memos) {
      const reference = this.extractReference(memo)
      if (reference == null) continue
      if (transaction.Account == null) {
        logger.error(`reference but no account present at index ${block.height}`)
        continue
      }
      const address = await findOrCreateUnderlyingAddress(em, transaction.Account, AddressType.AGENT)
      const utransaction = await findOrCreateUnderlyingTransaction(em, transaction.hash, block, BigInt(transaction.Amount!))
      await this.storeReference(em, reference, utransaction, address, block)
      break
    }
  }

  private async storeXrpBlock(em: EntityManager, xrpBlock: IXrpBlock): Promise<UnderlyingBlock> {
    const block = new UnderlyingBlock(xrpBlock.ledger_hash, xrpBlock.ledger_index, xrpBlock.close_time)
    em.persist(block)
    return block
  }

  private async storeReference(
    em: EntityManager, reference: string, transaction: UnderlyingTransaction, address: UnderlyingAddress, block: UnderlyingBlock
  ): Promise<UnderlyingVoutReference> {
    const ref = new UnderlyingVoutReference(FAssetType.FDOGE, reference, transaction, address, block)
    em.persist(ref)
    return ref
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