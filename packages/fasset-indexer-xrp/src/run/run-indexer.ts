import { IndexerRunner } from "fasset-indexer-core"
import { XrpIndexer } from "../indexer/indexer"
import { XrpConfigLoader } from "../config/config"
import { XrpContext } from "../context"
import { monitor } from "./run-monitor"


async function runIndexer() {
  const config = new XrpConfigLoader()
  const context = await XrpContext.create(config)
  const indexer = new XrpIndexer(context)
  const runner = new IndexerRunner(indexer, 'xrp')
  await Promise.all([monitor(config, context), runner.run(config.xrpMinBlockNumber)])
}

runIndexer()