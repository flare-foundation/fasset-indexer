import { getVar, type ORM } from "fasset-indexer-core/orm"
import { updateDistance } from "fasset-indexer-core/utils"
import { FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY } from "fasset-indexer-core/config"


export class MetadataAnalytics {
  constructor(public readonly orm: ORM) { }

  async currentBlock(): Promise<number | null> {
    const v = await getVar(this.orm.em.fork(), FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY)
    return (v && v.value) ? parseInt(v.value) : null
  }

  async blocksToBackSync(): Promise<[string | null, number | null]> {
    const em = this.orm.em.fork()
    const currentUpdate = await getVar(em, 'current_update')
    if (currentUpdate == null) {
      return [null, null]
    }
    const currentUpdateName = currentUpdate.value!
    const currentUpdateDist = await updateDistance(em, currentUpdateName)
    return [currentUpdateName, currentUpdateDist]
  }
}