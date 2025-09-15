import { UnderlyingTransaction } from "fasset-indexer-core/entities"
import { XrpContext } from "../context"
import { XrpClient } from "../client/xrp-client"
import { XrpConfigLoader } from "../config/config"

const TX_UPDATE_LIMIT = 1e4

export async function addTransactionResults(context: XrpContext, client: XrpClient) {
  const em = context.orm.em.fork()
  const transactions = await em.find(UnderlyingTransaction, { result: null }, { limit: TX_UPDATE_LIMIT })
  console.log(`transaction to process ${transactions.length}`)
  for (const transaction of transactions) {
    const tx = await client.transaction(transaction.hash)
    transaction.result = tx.meta?.TransactionResult
    console.log(`obtained tx with result ${transaction.result}`)
    transaction.fee = BigInt(tx.Fee ?? 0)
    await em.persistAndFlush(transaction)
  }
  await context.orm.close()
}

async function main() {
  const config = new XrpConfigLoader()
  const client = new XrpClient(config)
  const context = await XrpContext.create(config)
  await addTransactionResults(context, client)
}

main()