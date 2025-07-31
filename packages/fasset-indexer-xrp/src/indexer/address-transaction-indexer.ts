import { logger } from "fasset-indexer-core/logger"
import { XrpContext } from "../context"
import { XrpReferenceIndexer } from "./reference-indexer"
import { IXrpWeirdAfTx } from "../client/interface"
import { EntityManager, findOrCreateEntity } from "fasset-indexer-core/orm"
import { UnderlyingBlock } from "fasset-indexer-core/entities"


const SEQUENCE_INDEX_SPAN = 30
const TRANSACTION_LIMIT = 1000

export class XrpAddressTransactionIndexer extends XrpReferenceIndexer {

  constructor(
    public readonly context: XrpContext,
    public readonly address: string
  ) {
    super(context, `firstUnhandledXrpBlock_${address}`, `minXrpBlock_${address}`)
  }

  async runHistoric(startSequence?: number, endSequence?: number): Promise<void> {
    const firstUnhandledSequence = await this.firstUnhandledBlock(startSequence)
    if (startSequence === undefined || firstUnhandledSequence > startSequence) {
      startSequence = firstUnhandledSequence
    }
    let lastSequenceToHandle = -1
    if (firstUnhandledSequence != -1) {
      lastSequenceToHandle = await this.lastBlockToHandle()
      if (endSequence === undefined || endSequence > lastSequenceToHandle) {
        endSequence = lastSequenceToHandle
      }
    } else {
      endSequence = -1
    }
    for (let i = startSequence; i <= endSequence; i += SEQUENCE_INDEX_SPAN + 1) {
      const endLoopSequence = Math.min(endSequence, i + SEQUENCE_INDEX_SPAN)
      console.log(i, endLoopSequence, TRANSACTION_LIMIT)
      const transactions = await this.context.provider.accountTxs(
        this.address, i, endLoopSequence, TRANSACTION_LIMIT)
      await this.processTxs(transactions)
      let firstUnhandledBlock = null
      if (firstUnhandledSequence == -1) {
        const lastTx = transactions[transactions.length - 1]
        console.log(lastTx)
        firstUnhandledBlock = lastTx.tx.ledger_index
      } else {
        firstUnhandledBlock = i + 1
      }
      await this.setFirstUnhandledBlock(firstUnhandledBlock)
      logger.info(`${this.context.chainName} address indexer processed block height ${i}`)
    }
  }

  protected async processTxs(transactions: IXrpWeirdAfTx[]) {
    await this.context.orm.em.transactional(async em => {
      await this._processTxs(em, transactions)
    })
  }

  override async minBlock(): Promise<number> {
    return -1
  }

  private async _processTxs(em: EntityManager, transactions: IXrpWeirdAfTx[]) {
    let ledgerIndex = -1
    let underlyingBlock = null
    for (const { tx, meta } of transactions.sort((tx1, tx2) => tx1.tx.ledger_index - tx2.tx.ledger_index)) {
      if (tx.ledger_index != ledgerIndex) {
        const ledgerIdx = meta.AffectedNodes[0].ModifiedNode.LedgerIndex
        underlyingBlock = await findOrCreateEntity(em, UnderlyingBlock, {
          height: tx.ledger_index, hash: ledgerIdx, timestamp: tx.date
        })
      }
      await this.processTx(em, tx, underlyingBlock!)
    }
  }

}