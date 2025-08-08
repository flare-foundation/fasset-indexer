import { FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY } from "../config"
import { EntityManager, getVar } from "../orm"

// back indexer db vars
export function backUpdateFirstUnhandledBlockName(updateName: string): string {
  return `firstUnhandledEventBlock_${updateName}`
}
export function backUpdateLastBlockName(updateName: string): string {
  return `lastEventBlock_${updateName}`
}

// race indexer db vars
export function raceUpdateFirstUnhandledBlockName(updateName: string): string {
  return `firstUnhandledRaceEventBlock_${updateName}`
}
export function raceIndexerSyncedFlagName(updateName: string): string {
  return `front_indexing_synced_${updateName}`
}

export async function raceIndexerStats(em: EntityManager, updateName: string): Promise<[number, number]> {
  const firstUnhandledRace = await getVar(em, raceUpdateFirstUnhandledBlockName(updateName))
  const firstUnhandledRegular = await getVar(em, FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY)
  return [parseInt(firstUnhandledRace?.value!), parseInt(firstUnhandledRegular?.value!)]
}

export async function raceIndexerSynced(em: EntityManager, updateName: string): Promise<boolean> {
  const synced = await getVar(em, raceIndexerSyncedFlagName(updateName))
  return synced != null && synced.value === "true"
}

export async function backIndexerStats(em: EntityManager, updateName: string): Promise<[number, number]> {
  const firstUnhandled = await getVar(em, backUpdateLastBlockName(updateName))
  const last = await getVar(em, backUpdateFirstUnhandledBlockName(updateName))
  return [parseInt(firstUnhandled?.value!), parseInt(last?.value!)]
}

export async function backIndexerSynced(em: EntityManager, updateName: string): Promise<boolean> {
  const [f, l] = await backIndexerStats(em, updateName)
  return f >= l
}

export async function updateDistance(em: EntityManager, updateName: string): Promise<number | null> {
  const synced = await raceIndexerSynced(em, updateName)
  if (synced) return 0
  const [frace, lrace] = await raceIndexerStats(em, updateName)
  if (!isNaN(frace) && !isNaN(lrace)) return lrace - frace + 1
  const [fback, lback] = await backIndexerStats(em, updateName)
  if (!isNaN(fback) && !isNaN(lback)) return lback - fback + 1
  return null
}