import { IndexerRunner } from "fasset-indexer-core"
import { XrpConfigLoader } from "../config/config"
import { XrpContext } from "../context"
import { XrpAddressTransactionIndexer } from "../indexer/address-transaction-indexer"


async function runAddressIndexer() {
  const config = new XrpConfigLoader()
  const context = await XrpContext.create(config)
  const runners = config.xrpMonitoredAddresses.map(addr => {
    const indexer = new XrpAddressTransactionIndexer(context, addr)
    return new IndexerRunner(indexer, `xrp address ${addr}`)
  })
  await Promise.all(runners.map(runner => runner.run()))
}

runAddressIndexer()