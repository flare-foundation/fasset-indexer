import { IndexerRunner } from "fasset-indexer-core"
import { XrpReferenceIndexer } from "../indexer/reference-indexer"
import { XrpConfigLoader } from "../config/config"
import { XrpContext } from "../context"
import { monitor } from "./run-monitor"
import {
  FIRST_UNHANDLED_XRP_BLOCK_DB_KEY,
  MIN_XRP_BLOCK_NUMBER_DB_KEY
} from "../config/constants"


async function runIndexer() {
  const config = new XrpConfigLoader()
  const context = await XrpContext.create(config)
  const indexer = new XrpReferenceIndexer(context, FIRST_UNHANDLED_XRP_BLOCK_DB_KEY, MIN_XRP_BLOCK_NUMBER_DB_KEY)
  const runner = new IndexerRunner(indexer, 'xrp')
  await Promise.all([monitor(config, context), runner.run(config.xrpMinBlockNumber)])
}

runIndexer()