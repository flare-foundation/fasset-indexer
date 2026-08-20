import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType, RedemptionResolution } from 'fasset-indexer-core'
import { ExplorerAnalytics } from '../../src/analytics/explorer'
import { TransactionType } from '../../src/analytics/types'
import { EXPLORER_DEFAULT_LOOKBACK_SECONDS } from '../../src/config/constants'
import { startTestDb, TestDb } from './db-harness'
import { Fixtures } from './fixtures'


// The default lookback exists to bound how much of the union an *unqualified*
// open-ended request scans. Applied on top of a user/agent/status filter it only
// truncates, and it truncates silently: a status whose every row predates the
// window comes back as an empty list, which reads as "there are none" rather
// than "there are none recently". That is what made the explorer report zero
// blocked redemptions while eight sat in the database.
describe('ExplorerAnalytics.transactions — default window vs. narrowing filters', () => {
  let db: TestDb
  let explorer: ExplorerAnalytics

  const AGENT = '0x0000000000000000000000000000000000000c01'
  const OTHER_AGENT = '0x0000000000000000000000000000000000000d01'
  const REDEEMER = '0x03Ea4d9dC4F96FA2c6DE159327760199204d04bc'
  const OTHER_REDEEMER = '0x0000000000000000000000000000000000000e01'

  const now = Math.floor(Date.now() / 1000)
  // Comfortably outside the lookback, and comfortably inside it.
  const OLD_TS = now - EXPLORER_DEFAULT_LOOKBACK_SECONDS - 30 * 24 * 60 * 60
  const RECENT_TS = now - 10 * 24 * 60 * 60
  const OLD_BLOCK = 1_000_000
  const RECENT_BLOCK = 2_000_000

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    explorer = new ExplorerAnalytics(db.orm, 'coston2')
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => {
    await db.orm.schema.refreshDatabase()
    await seed()
  })

  // One blocked redemption older than the lookback, one performed redemption
  // inside it — the shape that produced the bug on Flare.
  async function seed(): Promise<void> {
    const fx = new Fixtures(db.orm.em.fork())
    const agentVault = await fx.agentVault({
      fasset: FAssetType.FXRP, addressHex: AGENT,
      underlyingText: 'rAgentBlocked', poolHex: '0x0000000000000000000000000000000000000c02'
    })
    const otherVault = await fx.agentVault({
      fasset: FAssetType.FXRP, addressHex: OTHER_AGENT,
      underlyingText: 'rAgentOther', poolHex: '0x0000000000000000000000000000000000000d02'
    })
    await stampedRedemption(fx, {
      agentVault, redeemerHex: REDEEMER, reference: `0x${'a'.repeat(64)}`,
      requestId: 664464, blockIndex: OLD_BLOCK, blockTimestamp: OLD_TS,
      resolution: RedemptionResolution.BLOCKED
    })
    await stampedRedemption(fx, {
      agentVault, redeemerHex: REDEEMER, reference: `0x${'b'.repeat(64)}`,
      requestId: 700000, blockIndex: RECENT_BLOCK, blockTimestamp: RECENT_TS,
      resolution: RedemptionResolution.PERFORMED
    })
    // A second old row under a different agent+redeemer, so the agent and user
    // filters have something to exclude rather than trivially matching everything.
    await stampedRedemption(fx, {
      agentVault: otherVault, redeemerHex: OTHER_REDEEMER, reference: `0x${'c'.repeat(64)}`,
      requestId: 700001, blockIndex: OLD_BLOCK + 1, blockTimestamp: OLD_TS + 1,
      resolution: RedemptionResolution.BLOCKED
    })
  }

  async function stampedRedemption(fx: Fixtures, opts: {
    agentVault: any, redeemerHex: string, reference: string, requestId: number,
    blockIndex: number, blockTimestamp: number, resolution: RedemptionResolution
  }): Promise<void> {
    const rr = await fx.redemptionRequested({
      fasset: FAssetType.FXRP, agentVault: opts.agentVault,
      redeemerHex: opts.redeemerHex, paymentAddressText: `rRed${opts.requestId}`,
      paymentReference: opts.reference, valueUBA: 10_000_000_000n,
      requestId: opts.requestId,
      blockIndex: opts.blockIndex, blockTimestamp: opts.blockTimestamp
    })
    // resolution is stamped by the storer as later events arrive, not at create.
    const em = db.orm.em.fork()
    const persisted = await em.findOneOrFail((rr as any).constructor, { evmLog: rr.evmLog })
    ;(persisted as any).resolution = opts.resolution
    await em.flush()
  }

  const REDEEM = [TransactionType.Redeem]

  it('finds a blocked redemption older than the lookback when status is given', async () => {
    const r = await explorer.transactions(
      25, 0, undefined, undefined, undefined, undefined, false,
      RedemptionResolution.BLOCKED, REDEEM
    )
    expect(r.count).to.equal(2)
    expect(r.transactions.map(t => t.resolution)).to.deep.equal(['BLOCKED', 'BLOCKED'])
  })

  it('still bounds a request with no narrowing filter to the lookback', async () => {
    const r = await explorer.transactions(
      25, 0, undefined, undefined, undefined, undefined, false, undefined, REDEEM
    )
    expect(r.count).to.equal(1)
    expect(r.transactions[0].resolution).to.equal('PERFORMED')
  })

  it('finds an old row when only the agent is given', async () => {
    const r = await explorer.transactions(
      25, 0, undefined, AGENT, undefined, undefined, false, undefined, REDEEM
    )
    expect(r.count).to.equal(2)
    expect(r.transactions.every(t => t.agentVault === AGENT)).to.equal(true)
  })

  it('finds an old row when only the user is given', async () => {
    const r = await explorer.transactions(
      25, 0, REDEEMER, undefined, undefined, undefined, false, undefined, REDEEM
    )
    expect(r.count).to.equal(2)
    expect(r.transactions.every(t => t.user === REDEEMER)).to.equal(true)
  })

  it('applies user and agent together instead of failing the query', async () => {
    const both = await explorer.transactions(
      25, 0, REDEEMER, AGENT, undefined, undefined, false, undefined, REDEEM
    )
    expect(both.count).to.equal(2)
    // The pair has to intersect, not fall back to whichever address was bound.
    const crossed = await explorer.transactions(
      25, 0, REDEEMER, OTHER_AGENT, undefined, undefined, false, undefined, REDEEM
    )
    expect(crossed.count).to.equal(0)
  })

  it('honours an explicit window over the filters', async () => {
    const r = await explorer.transactions(
      25, 0, undefined, undefined, RECENT_TS - 10, RECENT_TS + 10, false,
      undefined, REDEEM
    )
    expect(r.count).to.equal(1)
    expect(r.transactions[0].resolution).to.equal('PERFORMED')
  })
})
