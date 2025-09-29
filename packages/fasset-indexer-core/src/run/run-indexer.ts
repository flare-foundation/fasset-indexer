import { EventIndexer } from "../indexer/indexer"
import { ensureConfigIntegrity } from "./integrity"
import { ensureData } from "./ensure-data"
import { ConfigLoader } from "../config/config"
import { Context } from "../context/context"
import { IndexerRunner } from "../indexer/runner"
import { EventIndexerParallelBackPopulation } from "../indexer/reindexing/indexer-parallel-back-population"
import { EventIndexerParallelRacePopulation } from "../indexer/reindexing/indexer-parallel-race-population"
import { migrateCollateralPoolEvents } from "../scripts/migrate-collateral-pool-events"
import { logger } from "../logger"


async function runIndexer() {
  const config = new ConfigLoader()
  const context = await Context.create(config)

  // define indexer by configured type
  let indexer: EventIndexer | EventIndexerParallelBackPopulation | EventIndexerParallelRacePopulation
  const allEvents = config.indexEvents
  if (config.reindexing == null) {
    indexer = new EventIndexer(context, allEvents)
  } else if (config.reindexing.type == 'back') {
    indexer = new EventIndexerParallelBackPopulation(
      context, config.reindexing.diff, config.reindexing.name, allEvents)
  } else if (config.reindexing.type == 'race') {
    const newEvents = new Set(config.reindexing.diff)
    const oldEvents = allEvents.filter(event => !newEvents.has(event))
    indexer = new EventIndexerParallelRacePopulation(
      context, config.reindexing.diff, config.reindexing.name, oldEvents)
  } else {
    throw new Error(`reindexing type "${config.reindexing.type}" not recognized`)
  }

  process.on("SIGINT", async () => {
    logger.info("stopping indexer...")
    await context.orm.close()
    process.exit(0)
  })

  logger.info("ensuring configuration integrity...")
  await ensureConfigIntegrity(context, true, config.reindexing?.name)
  await ensureData(context)

  logger.info(`starting ${context.chain} event indexer...`)
  const runner = new IndexerRunner(indexer, 'native')
  await Promise.all([
    migrateCollateralPoolEvents(context.orm.em.fork()),
    runner.run(config.evmLogFetchCycleSleepMs, undefined, config.reindexing != null)
  ])
}

runIndexer()