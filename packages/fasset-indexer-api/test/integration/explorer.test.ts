import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType, RedemptionResolution } from 'fasset-indexer-core'
import { ExplorerAnalytics } from '../../src/analytics/explorer'
import { TransactionType } from '../../src/analytics/types'
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
      poolHex: `0xcc${addr.slice(4)}`
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
    const refs = [`0x${'a'.repeat(64)}`, `0x${'b'.repeat(64)}`, `0x${'c'.repeat(64)}`,
                  `0x${'d'.repeat(64)}`, `0x${'e'.repeat(64)}`]
    const rr: any[] = []
    for (let i = 0; i < 5; i++) {
      rr.push(await fx.redemptionRequested({
        fasset: FAssetType.FXRP, agentVault: ag,
        redeemerHex: REDEEMER, paymentAddressText: `rRedC01${i}`,
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
      redemptionRequested: rr[0], transactionHash: `0x${'01'.repeat(32)}`,
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
      transactionHash: `0x${'02'.repeat(32)}`, spentUnderlyingUBA: 0n
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
      `0x${'deadbeef'.padEnd(64, '0')}`
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
    const refPlain = `0x${'11'.repeat(32)}`
    const refTagged = `0x${'22'.repeat(32)}`
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
      redemptionRequested: rrPlain, transactionHash: `0x${'01'.repeat(32)}`,
      blockTimestamp: SHARED_TS + 100
    })
    await fx.redemptionPerformed({
      redemptionRequested: rrTagged, transactionHash: `0x${'02'.repeat(32)}`,
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

// The asset manager's DirectMintingExecutedToSmartAccount carries no mint
// target — it mints to the smart account manager, which forwards to a personal
// account derived from the XRPL source address. The DirectMint union arm
// resolves that target through personal_account. Before this, the arm
// hardcoded NULL as user_id, so these mints showed a blank user and were
// dropped entirely from any ?user= filtered listing.
describe('ExplorerAnalytics.transactions — smart-account direct mint target', () => {
  let db: TestDb
  let explorer: ExplorerAnalytics

  const XRPL_SOURCE = 'rSmartAccountSource11111111111111'
  const PA_HEX = '0x00000000000000000000000000000000000000a1'
  const EXECUTOR = '0x103b384064AE85577127097A7CCadFD6FB13F437'
  const TS = 1_700_030_000

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    explorer = new ExplorerAnalytics(db.orm, 'coston2')
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => { await db.orm.schema.refreshDatabase() })

  const DIRECT_MINT_ONLY = [TransactionType.DirectMint]

  it('reports the personal account as the user', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await fx.personalAccount({
      fasset: FAssetType.FXRP, addressHex: PA_HEX, underlyingText: XRPL_SOURCE
    })
    await fx.directMintingExecutedToSmartAccount({
      fasset: FAssetType.FXRP, sourceText: XRPL_SOURCE, executorHex: EXECUTOR,
      mintedAmountUBA: 3_000_000n, blockIndex: 7000, blockTimestamp: TS
    })

    const r = await explorer.transactions(10, 0, undefined, undefined, TS - 10, TS + 10,
      false, undefined, DIRECT_MINT_ONLY)

    expect(r.count).to.equal(1)
    expect(r.transactions).to.have.length(1)
    expect(r.transactions[0].name).to.equal('DirectMint')
    expect(r.transactions[0].user).to.equal(PA_HEX)
    // minted_amount_uba, i.e. pre-executor-fee. See the caveat on the union arm.
    expect(r.transactions[0].value).to.equal(3_000_000n)
  })

  it('returns the mint when filtering by the personal account address', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await fx.personalAccount({
      fasset: FAssetType.FXRP, addressHex: PA_HEX, underlyingText: XRPL_SOURCE
    })
    await fx.directMintingExecutedToSmartAccount({
      fasset: FAssetType.FXRP, sourceText: XRPL_SOURCE, executorHex: EXECUTOR,
      mintedAmountUBA: 3_000_000n, blockIndex: 7001, blockTimestamp: TS
    })

    const hit = await explorer.transactions(10, 0, PA_HEX, undefined, TS - 10, TS + 10,
      false, undefined, DIRECT_MINT_ONLY)
    expect(hit.count).to.equal(1)
    expect(hit.transactions[0].user).to.equal(PA_HEX)

    // The XRPL source's own executor is not the minter — must not match.
    const miss = await explorer.transactions(10, 0, EXECUTOR, undefined, TS - 10, TS + 10,
      false, undefined, DIRECT_MINT_ONLY)
    expect(miss.count).to.equal(0)
  })

  // A PA whose PersonalAccountCreated predates the indexed range has no
  // personal_account row. The LEFT JOIN must still list the mint (with no
  // user) rather than drop it from the unfiltered listing.
  it('still lists the mint when the personal account mapping is missing', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await fx.directMintingExecutedToSmartAccount({
      fasset: FAssetType.FXRP, sourceText: 'rUnmappedSource2222222222222222',
      executorHex: EXECUTOR, mintedAmountUBA: 500n,
      blockIndex: 7002, blockTimestamp: TS
    })

    const r = await explorer.transactions(10, 0, undefined, undefined, TS - 10, TS + 10,
      false, undefined, DIRECT_MINT_ONLY)

    expect(r.count).to.equal(1)
    expect(r.transactions[0].user).to.equal(null)
  })

  // The mapping is keyed on the XRPL address, and one PA maps to exactly one
  // XRPL address (underlying_address_id is unique). Two mints from different
  // sources must not cross-attribute.
  it('does not cross-attribute mints from different XRPL sources', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    const OTHER_PA = '0x00000000000000000000000000000000000000b2'
    const OTHER_SOURCE = 'rOtherSource33333333333333333333'
    await fx.personalAccount({
      fasset: FAssetType.FXRP, addressHex: PA_HEX, underlyingText: XRPL_SOURCE
    })
    await fx.personalAccount({
      fasset: FAssetType.FXRP, addressHex: OTHER_PA, underlyingText: OTHER_SOURCE
    })
    await fx.directMintingExecutedToSmartAccount({
      fasset: FAssetType.FXRP, sourceText: XRPL_SOURCE, executorHex: EXECUTOR,
      mintedAmountUBA: 111n, blockIndex: 7003, blockTimestamp: TS
    })
    await fx.directMintingExecutedToSmartAccount({
      fasset: FAssetType.FXRP, sourceText: OTHER_SOURCE, executorHex: EXECUTOR,
      mintedAmountUBA: 222n, blockIndex: 7004, blockTimestamp: TS
    })

    const r = await explorer.transactions(10, 0, PA_HEX, undefined, TS - 10, TS + 10,
      false, undefined, DIRECT_MINT_ONLY)
    expect(r.count).to.equal(1)
    expect(r.transactions[0].value).to.equal(111n)
  })

  // The non-smart-account arm reads target_address_id straight off the event
  // and must be unaffected by the added join.
  it('leaves the plain DirectMintingExecuted arm intact', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    const TARGET = '0x7570066008Ac4E72b02ac14eBbde5FBe16B6dCC8'
    await fx.directMintingExecuted({
      fasset: FAssetType.FXRP, targetHex: TARGET, executorHex: EXECUTOR,
      sourceText: 'rPlainSource444444444444444444', mintedAmountUBA: 999n,
      blockIndex: 7005, blockTimestamp: TS,
      underlyingTxHash: 'C'.repeat(64)
    })

    const r = await explorer.transactions(10, 0, TARGET, undefined, TS - 10, TS + 10,
      false, undefined, DIRECT_MINT_ONLY)
    expect(r.count).to.equal(1)
    expect(r.transactions[0].user).to.equal(TARGET)
    expect(r.transactions[0].value).to.equal(999n)
  })
})

// personal_account is populated from MASTER_ACCOUNT_CONTROLLER:PersonalAccountCreated,
// which the explorer config only started indexing alongside the join above. Every
// deployment therefore passes through a window where the table is empty (pre-backfill)
// or partially filled (PAs created before the backfill start block). The join must
// degrade to exactly the old behaviour there: same rows, same count, same order, with
// user simply absent — never a dropped row, never a duplicated one.
describe('ExplorerAnalytics.transactions — DirectMint parity with no personal_account rows', () => {
  let db: TestDb
  let explorer: ExplorerAnalytics

  const EXECUTOR = '0x103b384064AE85577127097A7CCadFD6FB13F437'
  const PLAIN_TARGET = '0x7570066008Ac4E72b02ac14eBbde5FBe16B6dCC8'
  const MINTER = '0xcccccccccccccccccccccccccccccccccccccCCC'
  const TS = 1_700_040_000

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    explorer = new ExplorerAnalytics(db.orm, 'coston2')
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => { await db.orm.schema.refreshDatabase() })

  // Three smart-account mints, one plain direct mint, one standard mint — none
  // of them with a personal_account row anywhere in the database.
  async function seedUnmapped(fx: Fixtures): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await fx.directMintingExecutedToSmartAccount({
        fasset: FAssetType.FXRP,
        sourceText: `rUnmapped${i}`.padEnd(30, 'x'),
        executorHex: EXECUTOR,
        mintedAmountUBA: BigInt(100 + i),
        blockIndex: 8000 + i, blockTimestamp: TS,
        underlyingTxHash: `E${i}`.padEnd(64, '0')
      })
    }
    await fx.directMintingExecuted({
      fasset: FAssetType.FXRP, targetHex: PLAIN_TARGET, executorHex: EXECUTOR,
      sourceText: 'rPlainParitySource', mintedAmountUBA: 777n,
      blockIndex: 8010, blockTimestamp: TS,
      underlyingTxHash: 'F'.repeat(64)
    })
    const ag = await fx.agentVault({
      fasset: FAssetType.FXRP,
      addressHex: '0x0000000000000000000000000000000000000e01',
      underlyingText: 'rAgentE01',
      poolHex: '0xcc0000000000000000000000000000000000e01'
    })
    await fx.collateralReserved({
      fasset: FAssetType.FXRP, agentVault: ag, minterHex: MINTER,
      paymentAddressText: 'rPayE01', paymentReference: `0x${'33'.repeat(32)}`,
      valueUBA: 555n, blockIndex: 8011, blockTimestamp: TS
    })
  }

  async function assertNoPersonalAccounts(): Promise<void> {
    const Entities = require('fasset-indexer-core/entities')
    const n = await db.orm.em.fork().count(Entities.PersonalAccount, {})
    expect(n, 'guard: fixtures must not create personal_account rows').to.equal(0)
  }

  it('lists every smart-account mint with an absent user and no row loss', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await seedUnmapped(fx)
    await assertNoPersonalAccounts()

    const r = await explorer.transactions(50, 0, undefined, undefined, TS - 10, TS + 10,
      true, undefined, [TransactionType.DirectMint])

    // 3 smart-account + 1 plain = 4 rows, exactly as the pre-join query returned.
    expect(r.count).to.equal(4)
    expect(r.transactions).to.have.length(4)
    // count and page agree — a fan-out in the join would inflate one but not the other.
    expect(r.count).to.equal(r.transactions.length)

    const smartAccount = r.transactions.filter(t => t.value !== 777n)
    expect(smartAccount).to.have.length(3)
    for (const t of smartAccount) {
      expect(t.name).to.equal('DirectMint')
      expect(t.user).to.equal(null)
      // everything else on the row still resolves
      expect(t.hash).to.match(/^0x/)
      expect(t.timestamp).to.equal(TS)
      expect(t.origin).to.match(/^0x/)
    }
    // values preserved and distinct — no collapsing of the three rows into one
    expect(smartAccount.map(t => t.value).sort()).to.deep.equal([100n, 101n, 102n])

    // the plain arm is untouched
    const plain = r.transactions.find(t => t.value === 777n)!
    expect(plain.user).to.equal(PLAIN_TARGET)
  })

  it('leaves a mixed all-types listing unchanged', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await seedUnmapped(fx)
    await assertNoPersonalAccounts()

    // Default types = every arm, so a regression in the DirectMint arm would
    // show up as a wrong total here too.
    const r = await explorer.transactions(50, 0, undefined, undefined, TS - 10, TS + 10, true)

    expect(r.count).to.equal(5) // 3 SA + 1 plain direct + 1 standard mint
    expect(r.transactions).to.have.length(5)
    expect(r.transactions.filter(t => t.name === 'DirectMint')).to.have.length(4)
    const standard = r.transactions.find(t => t.name === 'Mint')!
    expect(standard.user).to.equal(MINTER)
    // ascending on-chain order preserved across the union
    const timestamps = r.transactions.map(t => t.timestamp)
    expect(timestamps).to.deep.equal([...timestamps].sort((a, b) => a - b))
  })

  it('excludes unmapped smart-account mints from every user filter', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await seedUnmapped(fx)
    await assertNoPersonalAccounts()

    // The executor and the asset manager are the only EVM addresses on an
    // unmapped smart-account row; neither may surface it as a user match.
    for (const addr of [EXECUTOR, '0x00000000000000000000000000000000000000ff']) {
      const r = await explorer.transactions(50, 0, addr, undefined, TS - 10, TS + 10,
        true, undefined, [TransactionType.DirectMint])
      expect(r.count, `user=${addr}`).to.equal(0)
      expect(r.transactions, `user=${addr}`).to.have.length(0)
    }

    // The plain arm still filters correctly with the table empty.
    const plain = await explorer.transactions(50, 0, PLAIN_TARGET, undefined, TS - 10, TS + 10,
      true, undefined, [TransactionType.DirectMint])
    expect(plain.count).to.equal(1)
    expect(plain.transactions[0].value).to.equal(777n)
  })

  // Partial backfill: some PAs mapped, some not. Both kinds must coexist in one
  // listing, and the filter must return only the mapped one.
  it('handles a partially backfilled personal_account table', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await seedUnmapped(fx)
    const MAPPED_PA = '0x00000000000000000000000000000000000000c3'
    const MAPPED_SOURCE = 'rMappedParitySource'
    await fx.personalAccount({
      fasset: FAssetType.FXRP, addressHex: MAPPED_PA, underlyingText: MAPPED_SOURCE
    })
    await fx.directMintingExecutedToSmartAccount({
      fasset: FAssetType.FXRP, sourceText: MAPPED_SOURCE, executorHex: EXECUTOR,
      mintedAmountUBA: 4242n, blockIndex: 8020, blockTimestamp: TS,
      underlyingTxHash: 'AB'.repeat(32)
    })

    const all = await explorer.transactions(50, 0, undefined, undefined, TS - 10, TS + 10,
      true, undefined, [TransactionType.DirectMint])
    expect(all.count).to.equal(5) // 3 unmapped SA + 1 mapped SA + 1 plain
    expect(all.transactions.filter(t => t.user == null)).to.have.length(3)

    const mapped = await explorer.transactions(50, 0, MAPPED_PA, undefined, TS - 10, TS + 10,
      true, undefined, [TransactionType.DirectMint])
    expect(mapped.count).to.equal(1)
    expect(mapped.transactions[0].value).to.equal(4242n)
  })
})
