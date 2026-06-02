import * as Entities from 'fasset-indexer-core/entities'
import type { EntityManager } from 'fasset-indexer-core/orm'


// Look up the EvmLog ids belonging to a given EVM transaction hash.
//
// Why this helper exists: the natural mikro-orm filter
//   em.find(SomeEvent, { evmLog: { transaction: { hash } } }, { populate: [...] })
// reaches the `hash = $1` predicate through a duplicate evm_log → evm_transaction
// join chain that the Postgres planner can't push down past the populate joins.
// On a database with ~20k SomeEvent rows that turns into a seq scan + cross-join
// of every populated relation, with the WHERE applied as a deferred Join Filter
// — measured ~2s on a 5-row result set. Pre-fetching the small log-id list lets
// the populated query filter on `evm_log_id IN (...)` which hits the PK index;
// total cost drops to <100ms.
//
// Returns the list of evm_log ids for the tx (typically <50 even for busy
// transactions). Caller passes the list back as `evmLog: { $in: ids }`.
export async function findEvmLogIdsByTxHash(
  em: EntityManager, hash: string
): Promise<number[]> {
  const logs = await em.find(Entities.EvmLog,
    { transaction: { hash } },
    { fields: ['id'] }
  )
  return logs.map(l => l.id)
}
