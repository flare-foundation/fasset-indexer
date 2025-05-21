import { sleep } from "fasset-indexer-core/utils"
import { logger } from "fasset-indexer-core/logger"
import { updateUnderlyingBalance } from "fasset-indexer-core/orm"
import { XrpConfigLoader } from "../config/config"
import { XrpContext } from "../context"

const SLEEP_CYCLE_MS = 60_000

export async function monitor(config: XrpConfigLoader, context: XrpContext) {
  while (true) {
    await updateBalances(config.xrpMonitoredAddresses, context)
    await sleep(SLEEP_CYCLE_MS)
  }
}

async function updateBalances(addresses: string[], context: XrpContext) {
  for (const address of addresses) {
    const balance = await fetchBalanceOf(address, context)
    if (balance == null) continue
    await context.orm.em.transactional(async em => {
      await updateUnderlyingBalance(em, address, balance)
    })
    logger.info(`successfully updated ripple balance for ${address}`)
  }
}

async function fetchBalanceOf(address: string, context: XrpContext): Promise<bigint | null> {
  try {
    return await context.provider.balanceOf(address)
  } catch (err: any) {
    logger.error(`could not fetch ripple balance for ${address} due to: ${err}`)
    return null
  }
}