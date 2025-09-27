import { IndexerRunner } from "fasset-indexer-core"
import { BtcConfigLoader } from "../config/config"
import { BtcContext } from "../context"
import { BtcIndexer } from "../indexer/indexer"

const SLEEP_CYCLE_MS = 2000

async function runIndexer(): Promise<void> {
  const config = new BtcConfigLoader()
  const context = await BtcContext.create(config)
  const indexer = new BtcIndexer(context)
  const runner = new IndexerRunner(indexer, 'doge')
  await runner.run(SLEEP_CYCLE_MS, config.btcMinBlockNumber)
}

runIndexer()