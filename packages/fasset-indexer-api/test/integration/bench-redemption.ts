// One-off benchmark: original per-redemption flow vs the batched flow with
// N RedemptionRequested events in a single EVM tx. Runs against pglite, so
// network latency is excluded — production Postgres will amplify the gap
// (every saved round-trip is one fewer real TCP-and-pg-parse cycle).
//
//   yarn ts-node test/integration/bench-redemption.ts
import { ExplorerAnalytics } from '../../src/analytics/explorer'
import { startTestDb } from './db-harness'
import { Fixtures } from './fixtures'
import { FAssetType, RedemptionResolution } from 'fasset-indexer-core'
import * as Entities from 'fasset-indexer-core/entities'


const N_REDEMPTIONS = 5
const WARMUP = 20
const ITERS = 200

async function buildScenario(fx: Fixtures) {
  const ag = await fx.agentVault({
    fasset: FAssetType.FXRP,
    addressHex: '0x0000000000000000000000000000000000000c01',
    underlyingText: 'rAgentBench',
    poolHex: '0xcc' + '0000000000000000000000000000000000000c01'.slice(0)
  })
  const SHARED_BLOCK = 5000
  const SHARED_TS = 1_700_010_000
  const refs: string[] = []
  const rrs: any[] = []
  for (let i = 0; i < N_REDEMPTIONS; i++) {
    const ref = '0x' + (i + 1).toString(16).padStart(64, '0')
    refs.push(ref)
    rrs.push(await fx.redemptionRequested({
      fasset: FAssetType.FXRP, agentVault: ag,
      redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
      paymentAddressText: 'rRedBench' + i,
      paymentReference: ref, valueUBA: BigInt(100 + i), requestId: 9000 + i,
      blockIndex: SHARED_BLOCK, blockTimestamp: SHARED_TS
    }))
  }
  // Mix the resolution kinds across the 5 to exercise every branch.
  const stamps: Array<[number, RedemptionResolution]> = [
    [0, RedemptionResolution.PERFORMED],
    [1, RedemptionResolution.DEFAULTED],
    [2, RedemptionResolution.REJECTED],
    [3, RedemptionResolution.BLOCKED],
    [4, RedemptionResolution.PERFORMED]
  ]
  for (const [i, kind] of stamps) {
    rrs[i].resolution = kind
  }
  await fx['em'].flush()

  await fx.redemptionPerformed({
    redemptionRequested: rrs[0], transactionHash: '0x' + '01'.repeat(32),
    blockTimestamp: SHARED_TS + 100
  })
  await fx.redemptionDefault({
    redemptionRequested: rrs[1], blockTimestamp: SHARED_TS + 100
  })
  // Rejected + Blocked inline.
  const rejectedLog = await fx.logAt({
    name: 'RedemptionRejected',
    addressHex: '0x00000000000000000000000000000000000000ff',
    blockIndex: SHARED_BLOCK + 1, blockTimestamp: SHARED_TS + 200
  })
  const blockedLog = await fx.logAt({
    name: 'RedemptionPaymentBlocked',
    addressHex: '0x00000000000000000000000000000000000000ff',
    blockIndex: SHARED_BLOCK + 2, blockTimestamp: SHARED_TS + 300
  })
  const em2 = fx['em'].fork()
  em2.create(Entities.RedemptionRejected, {
    evmLog: rejectedLog, fasset: FAssetType.FXRP, redemptionRequested: rrs[2]
  })
  em2.create(Entities.RedemptionPaymentBlocked, {
    evmLog: blockedLog, fasset: FAssetType.FXRP, redemptionRequested: rrs[3],
    transactionHash: '0x' + '02'.repeat(32), spentUnderlyingUBA: 0n
  })
  await em2.flush()
  await fx.redemptionPerformed({
    redemptionRequested: rrs[4], transactionHash: '0x' + '03'.repeat(32),
    blockTimestamp: SHARED_TS + 100
  })

  const evmTxHash = `0x${SHARED_BLOCK.toString(16).padStart(64, '0')}`
  return { evmTxHash, refs }
}

function ns(): bigint { return process.hrtime.bigint() }
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
function p(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * q))]
}

async function main() {
  console.log(`Booting pglite + mikro-orm…`)
  const db = await startTestDb()
  try {
    const explorer = new ExplorerAnalytics(db.orm, 'coston2')
    const fx = new Fixtures(db.orm.em.fork())
    const { evmTxHash } = await buildScenario(fx)

    // Sanity: both shapes should agree on flow count and resolution presence.
    const ref = await explorer.redemptionTransactionDetails(evmTxHash)
    console.log(`Built scenario: ${ref.flows.length} flows for the tx`)

    // The unbatched comparison hits the unchanged redemptionEventDetails path:
    // re-fetch the redemption requests from a fresh em and map over them.
    const runUnbatched = async () => {
      const em = db.orm.em.fork()
      const rrs = await em.find(Entities.RedemptionRequested,
        { evmLog: { transaction: { hash: evmTxHash } } },
        { populate: [
          'evmLog.block', 'evmLog.transaction.source',
          'agentVault.address', 'agentVault.underlyingAddress', 'agentVault.owner.manager',
          'redeemer', 'paymentAddress', 'executor'
        ] })
      return Promise.all(rrs.map(rr => (explorer as any).redemptionEventDetails(em, rr)))
    }
    const runBatched = async () => explorer.redemptionTransactionDetails(evmTxHash)

    // Warmup both paths so JIT + connection pool settle.
    for (let i = 0; i < WARMUP; i++) { await runUnbatched(); await runBatched() }

    const unbatched: number[] = []
    const batched: number[] = []
    for (let i = 0; i < ITERS; i++) {
      const a = ns(); await runUnbatched(); const b = ns()
      unbatched.push(Number(b - a) / 1e6)
      const c = ns(); await runBatched(); const d = ns()
      batched.push(Number(d - c) / 1e6)
    }

    const fmt = (xs: number[]) =>
      `median=${median(xs).toFixed(2)}ms  p90=${p(xs, 0.9).toFixed(2)}ms  p99=${p(xs, 0.99).toFixed(2)}ms`
    console.log()
    console.log(`N=${N_REDEMPTIONS} redemptions, ${ITERS} iters (after ${WARMUP} warmup)`)
    console.log(`  unbatched: ${fmt(unbatched)}`)
    console.log(`  batched  : ${fmt(batched)}`)
    const speedup = median(unbatched) / median(batched)
    console.log(`  speedup (median): ${speedup.toFixed(2)}x   (saved ~${(median(unbatched) - median(batched)).toFixed(2)}ms / call)`)
  } finally {
    await db.stop()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
