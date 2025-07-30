import { sleep } from "../utils/general"
import { logger } from "../logger"
import { SLEEP_AFTER_ERROR_MS, EVM_LOG_FETCH_SLEEP_MS } from "../config/constants"


interface Indexer {
  run(startBlock?: number): Promise<Indexer | void>
}

export class IndexerRunner {

  constructor(
    public indexer: Indexer,
    public name: string
  ) { }

  async run(startBlock?: number) {
    while (true) {
      try {
        const resp = await this.indexer.run(startBlock)
        if (resp != null) {
          logger.info('finished layered indexing, switching to regular')
          this.indexer = resp
        }
      } catch (e: any) {
        const stacktrace = (e.stack != null) ? `\n${e.stack}` : ''
        logger.error(`error running ${this.name} indexer: ${e}${stacktrace}`)
        await sleep(SLEEP_AFTER_ERROR_MS)
        continue
      }
      await sleep(EVM_LOG_FETCH_SLEEP_MS)
    }
  }
}