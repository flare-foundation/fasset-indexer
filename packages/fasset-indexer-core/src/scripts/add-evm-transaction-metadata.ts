import { ConfigLoader } from "../config/config"
import { Context } from "../context/context"
import { EventParser } from "../indexer/eventlib/event-parser"
import { EvmTransaction } from "../orm/entities"

const TX_LIMIT = 1e4

class TxParser extends EventParser {
  override async getTransaction(hash: string) {
    return super.getTransaction(hash)
  }
}


async function updateTransactions(context: Context) {
  const eventParser = new TxParser(context, [])
  const em = context.orm.em.fork()

  let i = 0
  const txs = await em.find(EvmTransaction, { value: null }, { limit: TX_LIMIT })
  for (const tx of txs) {
    i += 1
    console.log(`processing transaction ${i}/${txs.length}: ${tx.hash}`)
    const metadata = await eventParser.getTransaction(tx.hash)
    tx.gasLimit = metadata.gasLimit
    tx.gasPrice = metadata.gasPrice
    tx.gasUsed = metadata.gasUsed
    tx.value = metadata.value
    tx.nonce = metadata.nonce
    tx.type = metadata.type
    await em.persistAndFlush(tx)
  }
}

async function main() {
  const config = new ConfigLoader()
  const context = await Context.create(config)
  await updateTransactions(context)
  await context.orm.close()
}


main()