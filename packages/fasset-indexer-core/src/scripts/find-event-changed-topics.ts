import { CollateralPoolEventMigration } from "../indexer/eventlib/migrations/collateral-pool-migrations"
import { CollateralPoolEntered, CollateralPoolExited } from "../orm/entities"
import { CollateralPoolClaimedReward, CollateralPoolPaidOut } from "../orm/entities/events/collateral-pool"
import { logger } from "../logger"
import { Context } from "../context/context"
import { EVENTS } from "../config"
import { IAssetManager__factory, IAssetManagerPreUpgrade__factory } from "../../chain/typechain"
import { ConfigLoader } from "../config/config"


const iface1 = IAssetManagerPreUpgrade__factory.createInterface()
const iface2 = IAssetManager__factory.createInterface()

async function am(context: Context) {
  for (const iface of Object.keys(EVENTS)) {
    if (iface != 'ASSET_MANAGER') continue
    for (const event of Object.values(EVENTS[iface as keyof typeof EVENTS])) {
      const resp1 = context.getEventTopic(event, [iface1])
      const resp2 = context.getEventTopic(event, [iface2])
      if (resp1 != resp2) console.log(event)
    }
  }
}

async function main() {
  const config = new ConfigLoader()
  const context = await Context.create(config)
  await am(context)
  await context.orm.close()
}

main()