import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType } from 'fasset-indexer-core'
import { AgentStatistics } from '../../src/analytics/statistics'
import { startTestDb, TestDb } from './db-harness'
import { Fixtures } from './fixtures'


// Locks in the contract for the direct-mint UNION branches added in
// MINTED_BY_UNDERLYING_ADDRESS and UNDERLYING_MINTERS: the JOIN aligns the
// 0x-prefixed lowercase bytes32 stored on the event row with the uppercase
// no-prefix XRPL hash stored on UnderlyingTransaction.
describe('AgentStatistics — direct mints', () => {
  let db: TestDb
  let stats: AgentStatistics

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    stats = new AgentStatistics(db.orm)
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => {
    // Reset schema between tests for isolation. Cheaper than tearing down
    // pglite — drop and recreate from entity metadata.
    await db.orm.schema.refreshDatabase()
  })

  describe('mintedByUnderlyingAddressDuring', () => {
    it('counts a DirectMintingExecuted via the underlying tx hash join', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const SOURCE = 'rXRPSource111111111111111111111111'
      await fx.directMintingExecuted({
        fasset: FAssetType.FXRP,
        targetHex: '0x7570066008Ac4E72b02ac14eBbde5FBe16B6dCC8',
        executorHex: '0x103b384064AE85577127097A7CCadFD6FB13F437',
        sourceText: SOURCE,
        mintedAmountUBA: 1_000_000n,
        underlyingTxValue: 1_500_000n, // sum() reports ut.value, not minted
        underlyingTxHash: 'A1B2C3D4'.padEnd(64, '0'),
        underlyingBlockHeight: 100,
        underlyingBlockTimestamp: 1_700_000_500
      })

      const r = await stats.mintedByUnderlyingAddressDuring(SOURCE, 0, 2_000_000_000)
      expect(r.FXRP).to.exist
      expect(r.FXRP!.value).to.equal(1_500_000n)
    })

    it('counts a DirectMintingExecutedToSmartAccount via stored source_address_id', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const SOURCE = 'rXRPSAsource222222222222222222222222'
      await fx.directMintingExecutedToSmartAccount({
        fasset: FAssetType.FXRP,
        sourceText: SOURCE,
        executorHex: '0x103b384064AE85577127097A7CCadFD6FB13F437',
        mintedAmountUBA: 2_000_000n,
        underlyingTxValue: 2_000_000n,
        underlyingTxHash: 'D4C3B2A1'.padEnd(64, '0'),
        underlyingBlockHeight: 200,
        underlyingBlockTimestamp: 1_700_000_700
      })

      const r = await stats.mintedByUnderlyingAddressDuring(SOURCE, 0, 2_000_000_000)
      expect(r.FXRP).to.exist
      expect(r.FXRP!.value).to.equal(2_000_000n)
    })

    it('excludes rows whose underlying block timestamp is outside [start, end)', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const SOURCE = 'rXRPSource333333333333333333333333'
      await fx.directMintingExecuted({
        fasset: FAssetType.FXRP,
        targetHex: '0x7570066008Ac4E72b02ac14eBbde5FBe16B6dCC8',
        executorHex: '0x103b384064AE85577127097A7CCadFD6FB13F437',
        sourceText: SOURCE,
        mintedAmountUBA: 999_999n,
        underlyingTxValue: 999_999n,
        underlyingTxHash: 'CAFEBABE'.padEnd(64, '0'),
        underlyingBlockHeight: 100,
        underlyingBlockTimestamp: 1_700_000_000
      })

      // Window strictly before the underlying block timestamp
      const before = await stats.mintedByUnderlyingAddressDuring(SOURCE, 0, 1_700_000_000)
      expect(before.FXRP?.value ?? 0n).to.equal(0n)
      // Window strictly after
      const after = await stats.mintedByUnderlyingAddressDuring(SOURCE, 1_700_000_001, 2_000_000_000)
      expect(after.FXRP?.value ?? 0n).to.equal(0n)
      // Window enclosing it
      const ok = await stats.mintedByUnderlyingAddressDuring(SOURCE, 0, 2_000_000_000)
      expect(ok.FXRP?.value).to.equal(999_999n)
    })

    it('returns nothing for a source address with no matching tx', async () => {
      const r = await stats.mintedByUnderlyingAddressDuring(
        'rNobodyNeverMinted', 0, 2_000_000_000
      )
      expect(r.FXRP?.value ?? 0n).to.equal(0n)
    })
  })

  describe('underlyingMinterAddresses', () => {
    it('returns the underlying source for a DirectMintingExecuted to that EVM user', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const TARGET = '0x7570066008Ac4E72b02ac14eBbde5FBe16B6dCC8'
      const SOURCE = 'rXRPSource444444444444444444444444'
      await fx.directMintingExecuted({
        fasset: FAssetType.FXRP,
        targetHex: TARGET,
        executorHex: '0x103b384064AE85577127097A7CCadFD6FB13F437',
        sourceText: SOURCE,
        mintedAmountUBA: 1_000_000n,
        underlyingTxHash: 'A1B2C3D4'.padEnd(64, '0')
      })

      const r = await stats.underlyingMinterAddresses(TARGET)
      expect(r).to.deep.equal([SOURCE])
    })

    it('does NOT include DirectMintingExecutedToSmartAccount sources (no EVM-user column on SA variant)', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const TARGET = '0x7570066008Ac4E72b02ac14eBbde5FBe16B6dCC8'
      const SOURCE = 'rSourceSAonly'
      await fx.directMintingExecutedToSmartAccount({
        fasset: FAssetType.FXRP,
        sourceText: SOURCE,
        executorHex: TARGET, // even if executor matches, SA variant isn't keyed by EVM user
        mintedAmountUBA: 1_000_000n,
        underlyingTxHash: 'B2C3D4E5'.padEnd(64, '0')
      })

      const r = await stats.underlyingMinterAddresses(TARGET)
      expect(r).to.deep.equal([])
    })

    it('deduplicates when the same EVM target direct-mints from the same XRP source twice', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const TARGET = '0x7570066008Ac4E72b02ac14eBbde5FBe16B6dCC8'
      const SOURCE = 'rTwiceFromSameSource'
      await fx.directMintingExecuted({
        fasset: FAssetType.FXRP, targetHex: TARGET, sourceText: SOURCE,
        executorHex: '0x103b384064AE85577127097A7CCadFD6FB13F437',
        mintedAmountUBA: 1_000_000n,
        underlyingTxHash: 'AA'.repeat(32)
      })
      await fx.directMintingExecuted({
        fasset: FAssetType.FXRP, targetHex: TARGET, sourceText: SOURCE,
        executorHex: '0x103b384064AE85577127097A7CCadFD6FB13F437',
        mintedAmountUBA: 2_000_000n,
        underlyingTxHash: 'BB'.repeat(32)
      })
      const r = await stats.underlyingMinterAddresses(TARGET)
      expect(r).to.deep.equal([SOURCE])
    })
  })
})
