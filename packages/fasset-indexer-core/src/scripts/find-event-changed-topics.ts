import { Context } from "../context/context"
import { EVENTS } from "../config"
import { IAssetManager__latest__factory, IAssetManager__initial__factory } from "../../chain/typechain"
import { ConfigLoader } from "../config/config"


const iface1 = IAssetManager__initial__factory.createInterface()
const iface2 = IAssetManager__latest__factory.createInterface()

async function am(context: Context) {
  for (const iface of Object.keys(EVENTS)) {
    if (iface != 'ASSET_MANAGER') continue
    for (const event of Object.values(EVENTS[iface as keyof typeof EVENTS])) {
      const resp1 = context.getEventTopics(event, [iface1])[0]
      const resp2 = context.getEventTopics(event, [iface2])[0]
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