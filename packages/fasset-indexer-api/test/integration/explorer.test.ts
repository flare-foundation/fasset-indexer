import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType, RedemptionResolution } from 'fasset-indexer-core'
import { ExplorerAnalytics } from '../../src/analytics/explorer'
import { startTestDb, TestDb } from './db-harness'
import { Fixtures } from './fixtures'


// Locks in the shape of redemptionTransactionDetails when one EVM tx fires
// multiple RedemptionRequested events. The batched path must:
//   - return one flow entry per RedemptionRequested, in find order;
//   - attach the correct resolution row (or none) per request;
//   - attach the matching UnderlyingReference rows per payment reference,
//     applying the same success-preferring rule as getUnderlyingTransaction.
describe('ExplorerAnalytics.redemptionTransactionDetails — batched per-tx', () => {
  let db: TestDb
  let explorer: ExplorerAnalytics

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    explorer = new ExplorerAnalytics(db.orm, 'coston2')
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => { await db.orm.schema.refreshDatabase() })

  async function vault(fx: Fixtures, addr: string, underlying: string): Promise<any> {
    return fx.agentVault({
      fasset: FAssetType.FXRP,
      addressHex: addr,
      underlyingText: underlying,
      poolHex: '0xcc' + addr.slice(4)
    })
  }

  it('returns one flow per RedemptionRequested sharing the same EVM tx, with correct resolutions', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    const ag = await vault(fx, '0x0000000000000000000000000000000000000c01', 'rAgentC01')
    const SHARED_BLOCK = 5000
    const SHARED_TS = 1_700_010_000
    const REDEEMER = '0xddddddddddddddddddddddddddddddddddddDDDD'

    // Five requests in the same tx (same blockIndex → same EvmTransaction via
    // the fixture's findOrCreate). Resolutions: PERFORMED, DEFAULTED, REJECTED,
    // BLOCKED, FAILED-but-still-NONE (unresolved).
    const refs = ['0x' + 'a'.repeat(64), '0x' + 'b'.repeat(64), '0x' + 'c'.repeat(64),
                  '0x' + 'd'.repeat(64), '0x' + 'e'.repeat(64)]
    const rr: any[] = []
    for (let i = 0; i < 5; i++) {
      rr.push(await fx.redemptionRequested({
        fasset: FAssetType.FXRP, agentVault: ag,
        redeemerHex: REDEEMER, paymentAddressText: 'rRedC01' + i,
        paymentReference: refs[i], valueUBA: BigInt(100 + i), requestId: 5000 + i,
        blockIndex: SHARED_BLOCK, blockTimestamp: SHARED_TS
      }))
    }
    // Stamp resolutions on the four resolved requests.
    const em = db.orm.em.fork()
    const stamps: Array<[number, RedemptionResolution]> = [
      [0, RedemptionResolution.PERFORMED],
      [1, RedemptionResolution.DEFAULTED],
      [2, RedemptionResolution.REJECTED],
      [3, RedemptionResolution.BLOCKED]
    ]
    for (const [i, kind] of stamps) {
      const persisted = await em.findOneOrFail((rr[i] as any).constructor, { evmLog: rr[i].evmLog })
      ;(persisted as any).resolution = kind
      await em.flush()
    }
    // Create the matching resolution rows.
    await fx.redemptionPerformed({
      redemptionRequested: rr[0], transactionHash: '0x' + '01'.repeat(32),
      blockTimestamp: SHARED_TS + 100
    })
    await fx.redemptionDefault({
      redemptionRequested: rr[1], blockTimestamp: SHARED_TS + 100
    })
    // RedemptionRejected and RedemptionPaymentBlocked don't have fixture helpers
    // yet; create them inline.
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
    const em2 = db.orm.em.fork()
    const Entities = require('fasset-indexer-core/entities')
    em2.create(Entities.RedemptionRejected, {
      evmLog: rejectedLog, fasset: FAssetType.FXRP, redemptionRequested: rr[2]
    })
    em2.create(Entities.RedemptionPaymentBlocked, {
      evmLog: blockedLog, fasset: FAssetType.FXRP, redemptionRequested: rr[3],
      transactionHash: '0x' + '02'.repeat(32), spentUnderlyingUBA: 0n
    })
    await em2.flush()

    // Drop a matching underlying tx + reference for the PERFORMED one so the
    // success-preferring branch of pickUnderlying fires; leave the others
    // without an underlying ref.
    const ub = await fx.underlyingBlock(20_000_000, SHARED_TS + 50)
    const agentUnd = await fx.underlyingAddress(ag.underlyingAddress.text)
    const targetUnd = await fx.underlyingAddress('rRedC010')
    const utx = await fx.underlyingTransaction({
      hash: 'F'.repeat(64), block: ub, source: agentUnd, target: targetUnd, value: 100n
    })
    // tesSUCCESS marker
    ;(utx as any).result = 'tesSUCCESS'
    await db.orm.em.fork().persistAndFlush(utx)
    await fx.underlyingReference({
      fasset: FAssetType.FXRP, reference: refs[0],
      transaction: utx, address: targetUnd, block: ub
    })

    const evmTxHash = `0x${SHARED_BLOCK.toString(16).padStart(64, '0')}`
    const result = await explorer.redemptionTransactionDetails(evmTxHash)

    expect(result.flows).to.have.length(5)
    // Order matches the order returned by the initial em.find on RR.
    const byRef = new Map(result.flows.map(f => [f.events.original.paymentReference, f]))

    // 0: PERFORMED + underlying tx attached
    const f0 = byRef.get(refs[0])!
    expect(f0.events.resolution?.constructor.name).to.equal('RedemptionPerformed')
    expect(f0.underlyingTransaction).to.not.equal(null)

    // 1: DEFAULTED, no underlying ref
    const f1 = byRef.get(refs[1])!
    expect(f1.events.resolution?.constructor.name).to.equal('RedemptionDefault')
    expect(f1.underlyingTransaction).to.equal(null)

    // 2: REJECTED
    const f2 = byRef.get(refs[2])!
    expect(f2.events.resolution?.constructor.name).to.equal('RedemptionRejected')

    // 3: BLOCKED
    const f3 = byRef.get(refs[3])!
    expect(f3.events.resolution?.constructor.name).to.equal('RedemptionPaymentBlocked')

    // 4: unresolved — no resolution attached
    const f4 = byRef.get(refs[4])!
    expect(f4.events.resolution).to.equal(undefined)
  })

  it('returns empty flows when the tx has no RedemptionRequested events', async () => {
    const result = await explorer.redemptionTransactionDetails(
      '0x' + 'deadbeef'.padEnd(64, '0')
    )
    expect(result.flows).to.deep.equal([])
    expect(result.flags).to.deep.equal([])
  })

  // Locks in field-level completeness on `events.original` (the populated
  // entity returned to API consumers). The prior "shape" test only asserted
  // resolution-class names and underlying-tx presence — that let two real
  // production bugs slip through: (a) discriminator-populate dropping the
  // resolution for tagged redemptions, (b) partial-fields shortcut on the
  // log-id lookup polluting the identity map and silently stripping
  // evmLog.name / .index / .address from the API response. Both are pinned
  // here against the actual API contract.
  it('preserves every populated field on events.original and events.resolution', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    const ag = await vault(fx, '0x0000000000000000000000000000000000000d01', 'rAgentD01')
    const refPlain = '0x' + '11'.repeat(32)
    const refTagged = '0x' + '22'.repeat(32)
    const SHARED_BLOCK = 6000
    const SHARED_TS = 1_700_020_000
    const rrPlain = await fx.redemptionRequested({
      fasset: FAssetType.FXRP, agentVault: ag,
      redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
      paymentAddressText: 'rRedD01plain', paymentReference: refPlain,
      valueUBA: 100n, requestId: 6001,
      blockIndex: SHARED_BLOCK, blockTimestamp: SHARED_TS
    })
    const rrTagged = await fx.redemptionRequested({
      fasset: FAssetType.FXRP, agentVault: ag,
      redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
      paymentAddressText: 'rRedD01tagged', paymentReference: refTagged,
      valueUBA: 200n, requestId: 6002, kind: 'tagged',
      blockIndex: SHARED_BLOCK, blockTimestamp: SHARED_TS
    })
    // Mark both PERFORMED, attach resolution rows.
    const em = db.orm.em.fork()
    for (const rr of [rrPlain, rrTagged]) {
      const persisted = await em.findOneOrFail((rr as any).constructor, { evmLog: rr.evmLog })
      ;(persisted as any).resolution = RedemptionResolution.PERFORMED
    }
    await em.flush()
    await fx.redemptionPerformed({
      redemptionRequested: rrPlain, transactionHash: '0x' + '01'.repeat(32),
      blockTimestamp: SHARED_TS + 100
    })
    await fx.redemptionPerformed({
      redemptionRequested: rrTagged, transactionHash: '0x' + '02'.repeat(32),
      blockTimestamp: SHARED_TS + 100
    })

    const evmTxHash = `0x${SHARED_BLOCK.toString(16).padStart(64, '0')}`
    const result = await explorer.redemptionTransactionDetails(evmTxHash)

    expect(result.flows).to.have.length(2)
    const byRef = new Map(result.flows.map(f => [f.events.original.paymentReference, f]))

    for (const [label, ref, expectedKind] of [
      ['plain', refPlain, 'plain'] as const,
      ['tagged', refTagged, 'tagged'] as const
    ]) {
      const flow = byRef.get(ref)
      expect(flow, `${label} flow missing`).to.exist
      const original = flow!.events.original
      // discriminator subclass actually got returned with the right kind
      expect(original.kind, `${label}: original.kind`).to.equal(expectedKind)
      // evmLog must be fully hydrated — name/index/address were the columns
      // silently dropped by the partial-fields identity-map pollution bug.
      // `address` is the FK integer here (not populated as a relation), which
      // matches what the API contract returns to consumers.
      expect(original.evmLog.id, `${label}: evmLog.id`).to.be.a('number')
      expect(original.evmLog.name, `${label}: evmLog.name`).to.equal('RedemptionRequested')
      expect(original.evmLog.index, `${label}: evmLog.index`).to.be.a('number')
      // address is the FK integer (consumed verbatim in the JSON response)
      expect(original.evmLog.address, `${label}: evmLog.address (FK)`).to.satisfy(
        (v: unknown) => typeof v === 'number' || (typeof v === 'object' && v != null)
      )
      expect(original.evmLog.block.timestamp, `${label}: evmLog.block.timestamp`).to.equal(SHARED_TS)
      expect(original.evmLog.transaction.hash, `${label}: evmLog.transaction.hash`).to.equal(evmTxHash)
      expect(original.evmLog.transaction.source.hex, `${label}: evmLog.transaction.source.hex`).to.match(/^0x/)
      // populated relations the controller hands back to the bridge
      expect(original.agentVault.address.hex, `${label}: agentVault.address.hex`).to.equal(ag.address.hex)
      expect(original.agentVault.underlyingAddress.text, `${label}: agentVault.underlyingAddress.text`).to.equal(ag.underlyingAddress.text)
      expect(original.agentVault.owner.manager, `${label}: agentVault.owner.manager`).to.exist
      expect(original.redeemer.hex, `${label}: redeemer.hex`).to.match(/^0x/)
      expect(original.paymentAddress.text, `${label}: paymentAddress.text`).to.match(/^r/)
      expect(original.executor.hex, `${label}: executor.hex`).to.match(/^0x/)
      // resolution attached — this is what broke for tagged in production
      expect(flow!.events.resolution, `${label}: events.resolution`).to.exist
      expect(flow!.events.resolution!.constructor.name, `${label}: resolution class`).to.equal('RedemptionPerformed')
      const resLog = (flow!.events.resolution as any).evmLog
      expect(resLog.name, `${label}: resolution.evmLog.name`).to.equal('RedemptionPerformed')
      expect(resLog.block.timestamp, `${label}: resolution.evmLog.block.timestamp`).to.equal(SHARED_TS + 100)
    }
  })

  it('keeps RedemptionRequestIncomplete flags separate from flows', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    const SHARED_BLOCK = 5100
    const SHARED_TS = 1_700_010_500
    const redeemer = await fx.evmAddress('0xddddddddddddddddddddddddddddddddddddDDDD')
    const incompleteLog = await fx.logAt({
      name: 'RedemptionRequestIncomplete',
      addressHex: '0x00000000000000000000000000000000000000ff',
      blockIndex: SHARED_BLOCK, blockTimestamp: SHARED_TS
    })
    const em = db.orm.em.fork()
    const Entities = require('fasset-indexer-core/entities')
    em.create(Entities.RedemptionRequestIncomplete, {
      evmLog: incompleteLog, fasset: FAssetType.FXRP,
      redeemer, remainingLots: 3n
    })
    await em.flush()
    const evmTxHash = `0x${SHARED_BLOCK.toString(16).padStart(64, '0')}`
    const result = await explorer.redemptionTransactionDetails(evmTxHash)
    expect(result.flows).to.deep.equal([])
    expect(result.flags).to.have.length(1)
  })
})
