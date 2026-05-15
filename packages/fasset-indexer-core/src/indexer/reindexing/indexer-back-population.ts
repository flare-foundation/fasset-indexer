import { getVar, setVar } from "../../orm/utils"
import { backUpdateLastBlockName, backUpdateFirstUnhandledBlockName } from "../../utils"
import { EventIndexer } from "../indexer"
import type { Context } from "../../context/context"


export class EventIndexerBackPopulation extends EventIndexer {
  protected lastEventBlockForCurrentUpdateKey: string
  protected firstUnhandledEventBlockForCurrentUpdateKey: string

  constructor(
    context: Context,
    public insertionEvents: string[],
    public updateName: string,
    public readonly startBlock?: number
  ) {
    super(context, insertionEvents)
    this.lastEventBlockForCurrentUpdateKey = backUpdateLastBlockName(updateName)
    this.firstUnhandledEventBlockForCurrentUpdateKey = backUpdateFirstUnhandledBlockName(updateName)
  }

  override async lastBlockToHandle(): Promise<number> {
    const endBlock = await getVar(this.context.orm.em.fork(), this.lastEventBlockForCurrentUpdateKey)
    if (endBlock === null) {
      const endBlock = await super.firstUnhandledBlock()
      await setVar(this.context.orm.em.fork(), this.lastEventBlockForCurrentUpdateKey, endBlock.toString())
      return endBlock
    }
    return parseInt(endBlock.value!)
  }

  override async firstUnhandledBlock(): Promise<number> {
    const firstUnhandled = await getVar(this.context.orm.em.fork(), this.firstUnhandledEventBlockForCurrentUpdateKey)
    if (firstUnhandled !== null) return parseInt(firstUnhandled.value!)
    if (this.startBlock !== undefined) return this.startBlock
    return this.minBlockNumber()
  }

  override async setFirstUnhandledBlock(blockNumber: number): Promise<void> {
    await setVar(this.context.orm.em.fork(), this.firstUnhandledEventBlockForCurrentUpdateKey, blockNumber.toString())
  }
}
