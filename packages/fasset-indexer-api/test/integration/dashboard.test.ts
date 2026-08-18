import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType } from 'fasset-indexer-core'
import { DashboardAnalytics } from '../../src/analytics/dashboard'
import { startTestDb, TestDb } from './db-harness'
import { Fixtures } from './fixtures'


describe('DashboardAnalytics — sql hot paths', () => {
  let db: TestDb
  let dashboard: DashboardAnalytics

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    dashboard = new DashboardAnalytics(db.orm, 'coston2')
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => { await db.orm.schema.refreshDatabase() })

  // Derive a unique pool address per agent vault by flipping the leading byte
  // to 0xcc — addr.slice(0, 40) + 'cc' is *not* unique because two vaults that
  // differ only in the last byte collapse to the same prefix.
  async function vault(fx: Fixtures, addr: string, underlying: string): Promise<any> {
    return fx.agentVault({
      fasset: FAssetType.FXRP,
      addressHex: addr,
      underlyingText: underlying,
      poolHex: `0xcc${addr.slice(4)}`
    })
  }

  describe('mintingExecutedCount', () => {
    it('sums standard + direct + direct-to-SA executions', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000b01', 'rAgentB01')
      await fx.standardMint({
        fasset: FAssetType.FXRP, agentVault: ag,
        minterHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        underlyingSourceText: 'rSrc1', valueUBA: 1n
      })
      await fx.directMintingExecuted({
        fasset: FAssetType.FXRP,
        targetHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        executorHex: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeEEEE',
        sourceText: 'rSrc2', mintedAmountUBA: 1n,
        underlyingTxHash: 'AA'.repeat(32)
      })
      await fx.directMintingExecutedToSmartAccount({
        fasset: FAssetType.FXRP,
        sourceText: 'rSrc3', executorHex: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeEEEE',
        mintedAmountUBA: 1n, underlyingTxHash: 'BB'.repeat(32)
      })
      const r = await dashboard.mintingExecutedCount()
      expect(r.amount).to.equal(3)
    })
  })

  describe('agentMintingExecutedCount', () => {
    it('counts only MintingExecuted rows tied to the given agent vault', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const A1 = await vault(fx, '0x0000000000000000000000000000000000000b02', 'rAgentB02')
      const A2 = await vault(fx, '0x0000000000000000000000000000000000000b03', 'rAgentB03')
      await fx.standardMint({
        fasset: FAssetType.FXRP, agentVault: A1,
        minterHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        underlyingSourceText: 'rS1', valueUBA: 1n
      })
      await fx.standardMint({
        fasset: FAssetType.FXRP, agentVault: A1,
        minterHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        underlyingSourceText: 'rS2', valueUBA: 1n
      })
      await fx.standardMint({
        fasset: FAssetType.FXRP, agentVault: A2,
        minterHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        underlyingSourceText: 'rS3', valueUBA: 1n
      })
      const r = await dashboard.agentMintingExecutedCount(A1.address.hex)
      expect(r.amount).to.equal(2)
    })
  })

  describe('agentRedemptionRequestCount', () => {
    it('counts redemption requests for the agent', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const A = await vault(fx, '0x0000000000000000000000000000000000000b04', 'rAgentB04')
      for (let i = 0; i < 4; i++) {
        await fx.redemptionRequested({
          fasset: FAssetType.FXRP, agentVault: A,
          redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
          paymentAddressText: 'rRedeemerB04',
          paymentReference: `0x${i.toString(16).padStart(64, '0')}`,
          valueUBA: 1n, requestId: 7000 + i
        })
      }
      const r = await dashboard.agentRedemptionRequestCount(A.address.hex)
      expect(r.amount).to.equal(4)
    })
  })

  describe('agentRedemptionPerformedCount', () => {
    it('counts only successfully performed redemptions for the agent', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const A = await vault(fx, '0x0000000000000000000000000000000000000b05', 'rAgentB05')
      const ok = await fx.redemptionRequested({
        fasset: FAssetType.FXRP, agentVault: A,
        redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        paymentAddressText: 'rRdmB05',
        paymentReference: `0x${'a'.repeat(64)}`,
        valueUBA: 1n, requestId: 8001
      })
      await fx.redemptionRequested({
        fasset: FAssetType.FXRP, agentVault: A,
        redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        paymentAddressText: 'rRdmB05',
        paymentReference: `0x${'b'.repeat(64)}`,
        valueUBA: 1n, requestId: 8002
      }) // not performed
      await fx.redemptionPerformed({
        redemptionRequested: ok, transactionHash: `0x${'11'.repeat(32)}`
      })
      const r = await dashboard.agentRedemptionPerformedCount(A.address.hex)
      expect(r.amount).to.equal(1)
    })
  })

  describe('agentLiquidationCount', () => {
    it('counts LiquidationPerformed rows tied to a vault, excluding zero-value rows', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const A = await vault(fx, '0x0000000000000000000000000000000000000b06', 'rAgentB06')
      await fx.liquidationPerformed({
        fasset: FAssetType.FXRP, agentVault: A,
        liquidatorHex: '0xddddddddddddddddddddddddddddddddddddDDDD', valueUBA: 10n
      })
      await fx.liquidationPerformed({
        fasset: FAssetType.FXRP, agentVault: A,
        liquidatorHex: '0xddddddddddddddddddddddddddddddddddddDDDD', valueUBA: 0n
      })
      const r = await dashboard.agentLiquidationCount(A.address.hex)
      expect(r.amount).to.equal(1)
    })
  })

  describe('liquidationCount (system-wide)', () => {
    it('counts only valueUBA > 0 rows', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const A = await vault(fx, '0x0000000000000000000000000000000000000b07', 'rAgentB07')
      await fx.liquidationPerformed({
        fasset: FAssetType.FXRP, agentVault: A,
        liquidatorHex: '0xddddddddddddddddddddddddddddddddddddDDDD', valueUBA: 5n
      })
      await fx.liquidationPerformed({
        fasset: FAssetType.FXRP, agentVault: A,
        liquidatorHex: '0xddddddddddddddddddddddddddddddddddddDDDD', valueUBA: 0n
      })
      const r = await dashboard.liquidationCount()
      expect(r.amount).to.equal(1)
    })
  })

  describe('redemptionDefault (lookup by id + fasset)', () => {
    it('returns the row joined to the request when found, null otherwise', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const A = await vault(fx, '0x0000000000000000000000000000000000000b08', 'rAgentB08')
      const rr = await fx.redemptionRequested({
        fasset: FAssetType.FXRP, agentVault: A,
        redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        paymentAddressText: 'rRedB08',
        paymentReference: `0x${'c'.repeat(64)}`,
        valueUBA: 1n, requestId: 12345
      })
      await fx.redemptionDefault({ redemptionRequested: rr })
      const found = await dashboard.redemptionDefault(12345, FAssetType.FXRP)
      expect(found).to.not.equal(null)
      const missing = await dashboard.redemptionDefault(999999, FAssetType.FXRP)
      expect(missing).to.equal(null)
    })
  })
})
