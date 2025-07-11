import { getVar, setVar } from "../orm/utils"
import { sleep } from "../utils/general"
import { logger } from "../logger"
import { SLEEP_AFTER_ERROR_MS, EVM_LOG_FETCH_SLEEP_MS } from "../config/constants"
import type { ORM } from "../orm"


interface Indexer {
  context: { orm: ORM }
  runHistoric(startBlock?: number): Promise<void>
}

export class IndexerRunner {

  constructor(
    public readonly indexer: Indexer,
    public readonly name: string
  ) { }

  async run(startBlock?: number, minBlockDbKey?: string): Promise<void> {
    await this.setMinBlock(startBlock, minBlockDbKey)
    while (true) {
      try {
        await this.indexer.runHistoric(startBlock)
      } catch (e: any) {
        const stacktrace = (e.stack != null) ? `\n${e.stack}` : ''
        logger.error(`error running ${this.name} indexer: ${e}${stacktrace}`)
        await sleep(SLEEP_AFTER_ERROR_MS)
        continue
      }
      await sleep(EVM_LOG_FETCH_SLEEP_MS)
    }
  }

  protected async setMinBlock(min?: number, minBlockDbKey?: string): Promise<void> {
    if (min != null && minBlockDbKey != null) {
      const em = this.indexer.context.orm.em.fork()
      const minBlock = await getVar(em, minBlockDbKey)
      if (minBlock == null) {
        await setVar(em, minBlockDbKey, min.toString())
      }
    }
  }
}