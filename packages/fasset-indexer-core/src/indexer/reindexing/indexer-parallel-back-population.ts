import { EventIndexer } from "../indexer"
import { EventIndexerBackPopulation } from "./indexer-back-population"
import type { Context } from "../../context/context"


const BLOCK_INDEX_NUMBER = 92
const NEW_BLOCKS_BEFORE_INDEX = 15

export class EventIndexerParallelBackPopulation {
  readonly backIndexer: EventIndexerBackPopulation
  readonly indexer: EventIndexer

  constructor(
    context: Context,
    backInsertionEvents: string[],
    updateName: string,
    frontInsertionEvents: string[]
  ) {
    this.indexer = new EventIndexer(context, frontInsertionEvents)
    this.backIndexer = new EventIndexerBackPopulation(context, backInsertionEvents, updateName)
  }

  async run(): Promise<EventIndexer | void> {
    // back index first
    const firstUnhandledBlockBack = await this.backIndexer.firstUnhandledBlock()
    const lastBlockToHandleBack = await this.backIndexer.lastBlockToHandle()
    if (firstUnhandledBlockBack <= lastBlockToHandleBack) {
      await this.backIndexer.runHistoric(firstUnhandledBlockBack, firstUnhandledBlockBack + BLOCK_INDEX_NUMBER)
    } else {
      return this.indexer
    }
    // front index
    const firstUnhandledBlock = await this.indexer.firstUnhandledBlock()
    const lastUnhandledBlock = await this.indexer.lastBlockToHandle()
    if (lastUnhandledBlock - firstUnhandledBlock > NEW_BLOCKS_BEFORE_INDEX) {
      await this.indexer.runHistoric(firstUnhandledBlock, firstUnhandledBlock + BLOCK_INDEX_NUMBER)
    }
  }
}