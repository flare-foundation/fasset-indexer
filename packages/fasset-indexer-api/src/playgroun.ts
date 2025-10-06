import { Context, ConfigLoader } from "fasset-indexer-core"
import { ExplorerAnalytics } from "./analytics/explorer"


async function main() {
  const config = new ConfigLoader()
  const context = await Context.create(config)
  const explorer = new ExplorerAnalytics(context.orm, config.chain, config.addressesJson)
  console.log(await explorer.transactions(10, 0))
  /* const r = await explorer.underlyingWithdrawalTransactionDetails('0xe94aaf7381c6af867aa8d0f00e73a59854af825bd11e625319ce4103b811b69e')
  console.log(r.flows[0].underlyingTransaction) */
  await context.orm.close()
}

main()