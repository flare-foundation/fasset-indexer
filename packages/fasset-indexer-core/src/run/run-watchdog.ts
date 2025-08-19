import { EvmStateWatchdog } from "../indexer/watchdog"
import { ensureConfigIntegrity } from "./integrity"
import { ConfigLoader } from "../config/config"
import { Context } from "../context/context"
import { logger } from "../logger"


async function runWatchdog() {
  const config = new ConfigLoader()
  const context = await Context.create(config)
  const watchdog = new EvmStateWatchdog(context)

  process.on("SIGINT", async () => {
    logger.info("stopping watchdog...")
    await context.orm.close()
    process.exit(0)
  })

  logger.info('ensuring configuration integrity...')
  await ensureConfigIntegrity(context, false)
  logger.info('starting watchdog...')
  await watchdog.run()
}

runWatchdog()