import * as core from 'fasset-indexer-core'
import * as Entities from 'fasset-indexer-core/entities'
import { XRP_TRANSACTION_SUCCESS_CODE } from 'fasset-indexer-xrp/constants'
import type { EntityManager } from 'fasset-indexer-core/orm'
import type { FilterQuery } from '@mikro-orm/core'
import type * as ExplorerType from '../types'


// Low-level: build the per-flow detail payload for N RedemptionRequested
// events that share one EVM tx, with O(1) round-trips instead of O(N).
//
// Why this lives in utils/ and not on the ExplorerAnalytics class:
//   - It is a database-shape optimisation, not analytics policy. Whoever
//     edits it needs to think about query plans, populate fan-out, mikro-orm
//     identity-map semantics, and the (fasset, block, reference, transaction)
//     uniqueness contract on UnderlyingReference.
//   - Other event-detail endpoints (mint, transfer-to-core-vault,
//     return-from-core-vault, balance topup, withdrawal) have the same
//     "N events in one tx → N round-trips" shape and can move here as
//     sibling helpers without touching the analytics class hierarchy.
//
// Output is bit-for-bit identical to mapping the original
// redemptionEventDetails over the input array.
export async function batchedRedemptionEventDetails(
  em: EntityManager,
  rrs: Entities.RedemptionRequested[]
): Promise<ExplorerType.RedeemEventDetails[]> {
  if (rrs.length === 0) return []

  const RES = core.RedemptionResolution
  const resolutionPopulate: string[] = ['evmLog.block', 'evmLog.transaction.source', 'redemptionRequested']

  // Bucket requests by resolution kind, then issue one find per kind that
  // actually has any requests. Each find populates redemptionRequested so the
  // returned rows can be keyed back to entries in `rrs` via the identity map.
  const byKind = new Map<core.RedemptionResolution, Entities.RedemptionRequested[]>()
  for (const rr of rrs) {
    if (rr.resolution == null || rr.resolution === RES.NONE) continue
    const bucket = byKind.get(rr.resolution)
    if (bucket) bucket.push(rr)
    else byKind.set(rr.resolution, [rr])
  }
  // Constraint pins T to entities that own a `redemptionRequested` field —
  // i.e. the five resolution rows — so the filter object below type-checks
  // through `FilterQuery<T>` without an unsound cast.
  const findResolution = <T extends { redemptionRequested: Entities.RedemptionRequested }>(
    kind: core.RedemptionResolution, entity: Parameters<typeof em.find<T>>[0]
  ): Promise<T[]> => {
    const bucket = byKind.get(kind)
    if (!bucket) return Promise.resolve([])
    return em.find<T>(entity,
      { redemptionRequested: { $in: bucket } } as FilterQuery<T>,
      { populate: resolutionPopulate as any }
    )
  }

  // Fasset is fixed across one tx's redemptions (a single AssetManager fires
  // them), so we can use the first row's fasset for the underlying-refs filter.
  const fasset = rrs[0].fasset
  const references = rrs.map(rr => rr.paymentReference)

  const [performed, defaulted, rejected, blocked, failed, underlyingRefs] = await Promise.all([
    findResolution<Entities.RedemptionPerformed>(RES.PERFORMED, Entities.RedemptionPerformed),
    findResolution<Entities.RedemptionDefault>(RES.DEFAULTED, Entities.RedemptionDefault),
    findResolution<Entities.RedemptionRejected>(RES.REJECTED, Entities.RedemptionRejected),
    findResolution<Entities.RedemptionPaymentBlocked>(RES.BLOCKED, Entities.RedemptionPaymentBlocked),
    findResolution<Entities.RedemptionPaymentFailed>(RES.FAILED, Entities.RedemptionPaymentFailed),
    // Bare `WHERE fasset = ? AND reference IN (...)` — hits the reference
    // index. Intentionally NO `transaction: { source, target }` filter here:
    // underlying_transaction's source_id/target_id are not indexed, and
    // putting that filter in the SQL forces a seq-scan over the full
    // underlying_transaction table per request. The match is done in JS over
    // the small batched result set below, which is effectively free.
    em.find(Entities.UnderlyingReference,
      { fasset, reference: { $in: references } },
      { populate: ['transaction.block', 'transaction.source', 'transaction.target'],
        orderBy: { block: { timestamp: 'DESC' } } }
    )
  ])

  // Index resolutions by the underlying RedemptionRequested entity instance.
  // Mikro-orm's identity map keeps the same RR object reachable from both the
  // initial fetch and the resolution's populated `redemptionRequested`, so
  // strict-equal map keying works (no need to dive into PK columns).
  const resolutionByRr = new Map<Entities.RedemptionRequested, ExplorerType.RedeemEventDetails['events']['resolution']>()
  for (const r of [...performed, ...defaulted, ...rejected, ...blocked, ...failed]) {
    resolutionByRr.set(r.redemptionRequested, r)
  }

  // Group underlying refs by their payment reference, then per RR narrow to
  // refs whose underlying tx actually flowed from the agent's underlying
  // address to the redeemer's payment address — same correctness guard
  // the original getUnderlyingTransaction applied via its
  // `transaction: { source, target }` filter, only now in JS.
  const refsByPaymentRef = new Map<string, Entities.UnderlyingReference[]>()
  for (const ref of underlyingRefs) {
    const list = refsByPaymentRef.get(ref.reference)
    if (list) list.push(ref)
    else refsByPaymentRef.set(ref.reference, [ref])
  }
  const pickUnderlying = (
    rr: Entities.RedemptionRequested
  ): Entities.UnderlyingReference | Entities.UnderlyingReference[] | null => {
    const bucket = refsByPaymentRef.get(rr.paymentReference)
    if (!bucket || bucket.length === 0) return null
    const agentUnderlyingId = rr.agentVault.underlyingAddress.id
    const redeemerPaymentId = rr.paymentAddress.id
    const matching = bucket.filter(x =>
      x.transaction.source?.id === agentUnderlyingId &&
      x.transaction.target?.id === redeemerPaymentId
    )
    if (matching.length === 0) return null
    const successful = matching.filter(x => x.transaction.result === XRP_TRANSACTION_SUCCESS_CODE)
    if (successful.length > 0) return successful.length > 1 ? successful : successful[0]
    return matching.length > 1 ? matching : matching[0]
  }

  return rrs.map(rr => {
    const events: ExplorerType.RedeemEventDetails['events'] = { original: rr }
    const resolution = resolutionByRr.get(rr)
    if (resolution != null) events.resolution = resolution
    return { events, underlyingTransaction: pickUnderlying(rr) }
  })
}
