import * as core from 'fasset-indexer-core'
import * as Entities from 'fasset-indexer-core/entities'
import { XRP_TRANSACTION_SUCCESS_CODE } from 'fasset-indexer-xrp/constants'
import type { EntityManager } from 'fasset-indexer-core/orm'
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
  // One em.find per resolution kind that actually has any matching requests.
  // The populate list is the same across all five (they all inherit evmLog
  // from EventBound and own redemptionRequested) but each call site lets
  // mikro-orm infer the AutoPath specialisation against the concrete entity,
  // so the populate strings type-check without any cast. Empty bucket → skip
  // the round-trip entirely.
  const performedBucket = byKind.get(RES.PERFORMED) ?? []
  const defaultedBucket = byKind.get(RES.DEFAULTED) ?? []
  const rejectedBucket = byKind.get(RES.REJECTED) ?? []
  const blockedBucket = byKind.get(RES.BLOCKED) ?? []
  const failedBucket = byKind.get(RES.FAILED) ?? []

  // Fasset is fixed across one tx's redemptions (a single AssetManager fires
  // them), so we can use the first row's fasset for the underlying-refs filter.
  const fasset = rrs[0].fasset
  const references = rrs.map(rr => rr.paymentReference)

  const resolutionPopulate = ['evmLog.block', 'evmLog.transaction.source', 'redemptionRequested'] as const

  const [performed, defaulted, rejected, blocked, failed, underlyingRefs] = await Promise.all([
    performedBucket.length === 0 ? Promise.resolve([] as Entities.RedemptionPerformed[]) :
      em.find(Entities.RedemptionPerformed,
        { redemptionRequested: { $in: performedBucket } },
        { populate: resolutionPopulate }),
    defaultedBucket.length === 0 ? Promise.resolve([] as Entities.RedemptionDefault[]) :
      em.find(Entities.RedemptionDefault,
        { redemptionRequested: { $in: defaultedBucket } },
        { populate: resolutionPopulate }),
    rejectedBucket.length === 0 ? Promise.resolve([] as Entities.RedemptionRejected[]) :
      em.find(Entities.RedemptionRejected,
        { redemptionRequested: { $in: rejectedBucket } },
        { populate: resolutionPopulate }),
    blockedBucket.length === 0 ? Promise.resolve([] as Entities.RedemptionPaymentBlocked[]) :
      em.find(Entities.RedemptionPaymentBlocked,
        { redemptionRequested: { $in: blockedBucket } },
        { populate: resolutionPopulate }),
    failedBucket.length === 0 ? Promise.resolve([] as Entities.RedemptionPaymentFailed[]) :
      em.find(Entities.RedemptionPaymentFailed,
        { redemptionRequested: { $in: failedBucket } },
        { populate: resolutionPopulate }),
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
