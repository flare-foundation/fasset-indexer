import { join, raceIndexerSyncedFlagName, raceUpdateFirstUnhandledBlockName } from "../../utils"
import { getVar, setVar } from "../../orm/utils"
import { EventIndexer } from "../indexer"
import type { Context } from "../../context/context"


const BLOCK_INDEX_BATCH_NUMBER = 92
const NEW_BLOCKS_BEFORE_INDEX = 15

export class EventIndexerParallelRacePopulation {
  readonly frontIndexer: EventIndexer
  readonly backIndexer: EventIndexer
  readonly indexer: EventIndexer
  protected readonly updateSynced: string

  constructor(
    context: Context,
    backInsertionEvents: string[],
    updateName: string,
    frontInsertionEvents: string[]
  ) {
    this.frontIndexer = new EventIndexer(context, frontInsertionEvents)
    const firstUnhandledEventBlockName = raceUpdateFirstUnhandledBlockName(updateName)
    this.backIndexer = new EventIndexer(context, backInsertionEvents, firstUnhandledEventBlockName)
    this.indexer = new EventIndexer(context, join(frontInsertionEvents, backInsertionEvents))
    this.updateSynced = raceIndexerSyncedFlagName(updateName)
  }

  async run(): Promise<EventIndexer | void> {
    // check if sync was already achieved
    const synced = await getVar(this.frontIndexer.context.orm.em.fork(), this.updateSynced)
    if (synced?.value === "true") {
      return this.indexer
    }
    // try to catch front-indexer with back-indexer's limited steps
    let firstUnhandledBlockBack = await this.backIndexer.firstUnhandledBlock()
    const firstUnhandledBlockFront = await this.frontIndexer.firstUnhandledBlock()
    if (firstUnhandledBlockBack < firstUnhandledBlockFront) {
      const endblock = Math.min(firstUnhandledBlockBack + BLOCK_INDEX_BATCH_NUMBER, firstUnhandledBlockFront)
      await this.backIndexer.runHistoric(firstUnhandledBlockBack, endblock - 1)
    }
    firstUnhandledBlockBack = await this.backIndexer.firstUnhandledBlock()
    if (firstUnhandledBlockBack >= firstUnhandledBlockFront) {
      await setVar(this.frontIndexer.context.orm.em.fork(), this.updateSynced, 'true')
      return this.indexer
    }
    // continue front-indexing
    const lastUnhandledBlockFront = await this.frontIndexer.lastBlockToHandle()
    if (lastUnhandledBlockFront - firstUnhandledBlockFront > NEW_BLOCKS_BEFORE_INDEX) {
      await this.frontIndexer.runHistoric(firstUnhandledBlockFront, firstUnhandledBlockFront + BLOCK_INDEX_BATCH_NUMBER)
    }
  }

}