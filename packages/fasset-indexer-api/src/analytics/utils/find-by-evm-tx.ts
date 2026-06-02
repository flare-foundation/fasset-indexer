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
// Why raw SQL instead of `em.find(EvmLog, ..., { fields: ['id'] })`:
// a partial-fields find places partial EvmLog entities (id-only) into the
// mikro-orm identity map. When the caller subsequently runs
//   em.find(SomeEvent, { evmLog: { $in: ids } }, { populate: [...] })
// the populate reuses those id-only partial entities for the event's `evmLog`
// relation and never hydrates `name`/`index`/`address`/etc., silently dropping
// columns from the API response. Going through Knex directly leaves the
// identity map untouched, so the subsequent populate loads the full entity.
//
// Returns the list of evm_log ids for the tx (typically <50 even for busy
// transactions). Caller passes the list back as `evmLog: { $in: ids }`.
export async function findEvmLogIdsByTxHash(
  em: EntityManager, hash: string
): Promise<number[]> {
  const knex = em.getConnection('read').getKnex()
  const rows: Array<{ id: number }> = await knex('evm_log as el')
    .join('evm_transaction as et', 'et.id', 'el.transaction_id')
    .where('et.hash', hash)
    .select('el.id')
  return rows.map(r => r.id)
}
