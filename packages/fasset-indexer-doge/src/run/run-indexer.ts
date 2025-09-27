import { IndexerRunner } from "fasset-indexer-core"
import { DogeConfigLoader } from "../config/config"
import { DogeContext } from "../context"
import { DogeIndexer } from "../indexer/indexer"


const SLEEP_MS = 10000

async function runIndexer(): Promise<void> {
  const config = new DogeConfigLoader()
  const context = await DogeContext.create(config)
  const indexer = new DogeIndexer(context)
  const runner = new IndexerRunner(indexer, 'doge-indexer')
  await runner.run(SLEEP_MS, config.dogeMinBlockNumber)
}

runIndexer()