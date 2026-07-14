import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType } from 'fasset-indexer-core'
import { VisualiserAnalytics } from '../../src/analytics/visualiser'
import { startTestDb, TestDb } from './db-harness'
import { Fixtures } from './fixtures'


// Covers the direct-minting rolling-window limiter state added to the
// watchdog-polled SystemSettings snapshot: get*LimiterState() → nullable
// columns → /api/visualiser/settings DTO. The caps live alongside the
// consumption, so remaining headroom is limit - mintedInWindow.
describe('VisualiserAnalytics — systemSettings direct-minting limiter state', () => {
  let db: TestDb
  let visualiser: VisualiserAnalytics

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    visualiser = new VisualiserAnalytics(db.orm, 'coston2')
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => {
    await db.orm.schema.refreshDatabase()
  })

  it('round-trips hourly/daily limit caps together with live window consumption', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await fx.systemSettings({
      fasset: FAssetType.FXRP,
      directMintingHourlyLimitUBA: 1_000_000n,
      directMintingDailyLimitUBA: 10_000_000n,
      directMintingHourlyMintedUBA: 250_000n,
      directMintingHourlyWindowStart: 1_700_003_600,
      directMintingDailyMintedUBA: 4_000_000n,
      directMintingDailyWindowStart: 1_700_000_000
    })

    const [entry] = await visualiser.systemSettings({ fasset: 'FXRP' })
    expect(entry).to.exist
    expect(entry.directMintingHourlyLimitUBA).to.equal(1_000_000n)
    expect(entry.directMintingDailyLimitUBA).to.equal(10_000_000n)
    expect(entry.directMintingHourlyMintedUBA).to.equal(250_000n)
    expect(entry.directMintingHourlyWindowStart).to.equal(1_700_003_600)
    expect(entry.directMintingDailyMintedUBA).to.equal(4_000_000n)
    expect(entry.directMintingDailyWindowStart).to.equal(1_700_000_000)
    // remaining headroom the frontend derives
    expect(entry.directMintingHourlyLimitUBA - entry.directMintingHourlyMintedUBA!).to.equal(750_000n)
  })

  it('leaves limiter-state fields null for a pre-upgrade asset manager (getters reverted)', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    // Only the static caps were read; the watchdog's limiter-state try/catch
    // swallowed the revert, so those columns were never set.
    await fx.systemSettings({
      fasset: FAssetType.FXRP,
      directMintingHourlyLimitUBA: 1_000_000n,
      directMintingDailyLimitUBA: 10_000_000n
    })

    const [entry] = await visualiser.systemSettings({ fasset: 'FXRP' })
    expect(entry).to.exist
    expect(entry.directMintingHourlyLimitUBA).to.equal(1_000_000n)
    expect(entry.directMintingHourlyMintedUBA ?? null).to.equal(null)
    expect(entry.directMintingHourlyWindowStart ?? null).to.equal(null)
    expect(entry.directMintingDailyMintedUBA ?? null).to.equal(null)
    expect(entry.directMintingDailyWindowStart ?? null).to.equal(null)
  })
})
