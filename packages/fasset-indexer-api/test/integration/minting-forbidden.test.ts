import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType } from 'fasset-indexer-core'
import * as E from 'fasset-indexer-core/entities'
import { VisualiserAnalytics } from '../../src/analytics/visualiser'
import { ExplorerAnalytics } from '../../src/analytics/explorer'
import { startTestDb, TestDb } from './db-harness'
import { Fixtures } from './fixtures'


// A reservation the agent released with releaseMintingWithForbiddenPayment
// (MintingPaymentForbidden) is finalized: it leaves the active flows and the
// visualiser folds it into 'defaulted', since fees are paid as on a default.
describe('MintingPaymentForbidden — reservation finalization', () => {
  let db: TestDb
  let visualiser: VisualiserAnalytics
  let explorer: ExplorerAnalytics

  const AGENT = '0x00000000000000000000000000000000000000a7'
  const MINTER = '0x00000000000000000000000000000000000000c3'
  const RESERVED_AT = 1_700_040_000
  const RELEASED_AT = 1_700_040_900

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    visualiser = new VisualiserAnalytics(db.orm, 'coston2')
    explorer = new ExplorerAnalytics(db.orm, 'coston2')
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => { await db.orm.schema.refreshDatabase() })

  async function releasedReservation(): Promise<{ cr: E.CollateralReserved, forbidden: E.MintingPaymentForbidden }> {
    const fx = new Fixtures(db.orm.em.fork())
    const agentVault = await fx.agentVault({
      fasset: FAssetType.FXRP, addressHex: AGENT,
      underlyingText: 'rAgentUnderlying1111111111111111', poolHex: '0x00000000000000000000000000000000000000b1'
    })
    const cr = await fx.collateralReserved({
      fasset: FAssetType.FXRP, agentVault, minterHex: MINTER,
      paymentAddressText: agentVault.underlyingAddress.text,
      paymentReference: `0x${'46'.repeat(32)}`, valueUBA: 10_000_000n,
      collateralReservationId: 4242, blockTimestamp: RESERVED_AT
    })
    const forbidden = await fx.mintingPaymentForbidden({ collateralReserved: cr, blockTimestamp: RELEASED_AT })
    return { cr, forbidden }
  }

  it('drops the reservation from active flows and active mintings', async () => {
    await releasedReservation()
    expect(await visualiser.activeFlows({ fasset: 'FXRP' })).to.have.length(0)
    expect(await visualiser.activeMintings('FXRP')).to.have.length(0)
  })

  it('reports the flow as defaulted by id', async () => {
    await releasedReservation()
    const flow = await visualiser.flowById('mint:FXRP:4242')
    expect(flow).to.exist
    expect(flow!.status).to.equal('defaulted')
  })

  it('emits the release as the flow\'s finalization in the flows feed', async () => {
    const { forbidden } = await releasedReservation()
    const feed = await visualiser.flowsSince(RESERVED_AT - 1)
    const flow = feed.flows.find(f => f.flowId === 'mint:FXRP:4242')
    expect(flow).to.exist
    expect(flow!.status).to.equal('defaulted')
    expect(flow!.resolvedAtTimestamp).to.equal(RELEASED_AT)
    expect(flow!.resolvedTxHash).to.equal(forbidden.evmLog.transaction.hash)
  })

  it('attaches the release as the reservation\'s resolution in the explorer', async () => {
    const { cr } = await releasedReservation()
    const details = await explorer.mintingTransactionDetails(cr.evmLog.transaction.hash)
    expect(details.flows).to.have.length(1)
    const resolution = details.flows[0].events.resolution as E.MintingPaymentForbidden
    expect(resolution).to.exist
    expect(resolution.evmLog.block.timestamp).to.equal(RELEASED_AT)
    expect(resolution.transactionId).to.equal(`0x${'ab'.repeat(32)}`)
  })

  it('classifies the release transaction as pointing at the reservation transaction', async () => {
    const { cr, forbidden } = await releasedReservation()
    const classified = await explorer.transactionClassification(forbidden.evmLog.transaction.hash)
    expect(classified).to.deep.equal([
      { eventName: 'MintingPaymentForbidden', transactionHash: cr.evmLog.transaction.hash }
    ])
  })
})
