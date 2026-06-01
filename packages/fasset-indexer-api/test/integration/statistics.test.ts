import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType } from 'fasset-indexer-core'
import { AgentStatistics } from '../../src/analytics/statistics'
import { startTestDb, TestDb } from './db-harness'
import { Fixtures } from './fixtures'


const STAT_LIMIT = 100
const WEEK = 60 * 60 * 24 * 7

// Run inside a single mocha file. Each test refreshes the schema for isolation.
describe('AgentStatistics — broader surface', () => {
  let db: TestDb
  let stats: AgentStatistics

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    stats = new AgentStatistics(db.orm)
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

  describe('mintedByUnderlyingAddressDuring — standard mint branch', () => {
    it('returns ut.value (raw underlying amount) for a CR + ME chain', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a01', 'rAgentVault01')
      await fx.standardMint({
        fasset: FAssetType.FXRP, agentVault: ag,
        minterHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        underlyingSourceText: 'rMinterSource1',
        valueUBA: 1_000_000n,
        underlyingTxValue: 1_234_567n
      })
      const r = await stats.mintedByUnderlyingAddressDuring('rMinterSource1', 0, 2_000_000_000)
      expect(r.FXRP?.value).to.equal(1_234_567n)
    })

    it('sums the standard branch and the direct-mint branch together', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a02', 'rAgentVault02')
      await fx.standardMint({
        fasset: FAssetType.FXRP, agentVault: ag,
        minterHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        underlyingSourceText: 'rSharedSource',
        valueUBA: 1_000_000n, underlyingTxValue: 1_000_000n
      })
      await fx.directMintingExecuted({
        fasset: FAssetType.FXRP,
        targetHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        executorHex: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeEEEE',
        sourceText: 'rSharedSource',
        mintedAmountUBA: 500_000n,
        underlyingTxValue: 500_000n,
        underlyingTxHash: 'ABCD'.repeat(16)
      })
      const r = await stats.mintedByUnderlyingAddressDuring('rSharedSource', 0, 2_000_000_000)
      expect(r.FXRP?.value).to.equal(1_500_000n)
    })
  })

  describe('redeemedByUnderlyingAddressDuring', () => {
    it('returns ut.value for the redeemer-target underlying tx', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a03', 'rAgentVault03')
      await fx.standardRedemption({
        fasset: FAssetType.FXRP, agentVault: ag,
        redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        redeemerUnderlyingText: 'rRedeemerTarget1',
        valueUBA: 800_000n, underlyingTxValue: 750_000n
      })
      const r = await stats.redeemedByUnderlyingAddressDuring('rRedeemerTarget1', 0, 2_000_000_000)
      expect(r.FXRP?.value).to.equal(750_000n)
    })

    it('honours [start, end) window on underlying block timestamp', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a04', 'rAgentVault04')
      await fx.standardRedemption({
        fasset: FAssetType.FXRP, agentVault: ag,
        redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        redeemerUnderlyingText: 'rRedeemerTarget2',
        valueUBA: 100_000n,
        underlyingBlockTimestamp: 1_700_000_500
      })
      const before = await stats.redeemedByUnderlyingAddressDuring('rRedeemerTarget2', 0, 1_700_000_500)
      expect(before.FXRP?.value ?? 0n).to.equal(0n)
      const inside = await stats.redeemedByUnderlyingAddressDuring('rRedeemerTarget2', 0, 1_700_000_501)
      expect(inside.FXRP?.value).to.equal(100_000n)
    })
  })

  describe('underlyingMinterAddresses — regular branch', () => {
    it('returns the payment-reference source for the EVM minter', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a05', 'rAgentVault05')
      const MINTER = '0xddddddddddddddddddddddddddddddddddddDDDD'
      await fx.standardMint({
        fasset: FAssetType.FXRP, agentVault: ag,
        minterHex: MINTER, underlyingSourceText: 'rRegularSource',
        valueUBA: 1n
      })
      const r = await stats.underlyingMinterAddresses(MINTER)
      expect(r).to.include('rRegularSource')
    })

    it('returns the union of regular + direct branches for the same EVM minter', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a06', 'rAgentVault06')
      const MINTER = '0xddddddddddddddddddddddddddddddddddddDDDD'
      await fx.standardMint({
        fasset: FAssetType.FXRP, agentVault: ag,
        minterHex: MINTER, underlyingSourceText: 'rFromRegular',
        valueUBA: 1n
      })
      await fx.directMintingExecuted({
        fasset: FAssetType.FXRP,
        targetHex: MINTER, executorHex: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeEEEE',
        sourceText: 'rFromDirect',
        mintedAmountUBA: 1n,
        underlyingTxHash: '11'.repeat(32)
      })
      const r = await stats.underlyingMinterAddresses(MINTER)
      expect(r.sort()).to.deep.equal(['rFromDirect', 'rFromRegular'])
    })
  })

  describe('minterDefaultCount', () => {
    it('counts MintingPaymentDefault for the given EVM minter', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a07', 'rAgentVault07')
      const MINTER = '0xddddddddddddddddddddddddddddddddddddDDDD'
      const cr1 = await fx.collateralReserved({
        fasset: FAssetType.FXRP, agentVault: ag, minterHex: MINTER,
        paymentAddressText: ag.underlyingAddress.text,
        paymentReference: '0x46' + '0'.repeat(60) + '11',
        valueUBA: 1n,
        collateralReservationId: 100
      })
      const cr2 = await fx.collateralReserved({
        fasset: FAssetType.FXRP, agentVault: ag, minterHex: MINTER,
        paymentAddressText: ag.underlyingAddress.text,
        paymentReference: '0x46' + '0'.repeat(60) + '22',
        valueUBA: 1n,
        collateralReservationId: 101
      })
      await fx.mintingPaymentDefault({ collateralReserved: cr1 })
      await fx.mintingPaymentDefault({ collateralReserved: cr2 })
      const count = await stats.minterDefaultCount(MINTER)
      expect(count).to.equal(2)
    })

    it('returns 0 for a minter with no defaults', async () => {
      const count = await stats.minterDefaultCount('0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead')
      expect(count).to.equal(0)
    })
  })

  describe('redemptionDefaultWA / redemptionTimeWA / redemptionCountWA', () => {
    it('redemptionCountWA reports the number of RedemptionRequested events for a vault', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a08', 'rAgentVault08')
      const now = 1_700_001_000
      for (let i = 0; i < 3; i++) {
        await fx.redemptionRequested({
          fasset: FAssetType.FXRP, agentVault: ag,
          redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
          paymentAddressText: 'rRedeemerForCount',
          paymentReference: '0x52' + i.toString(16).padStart(62, '0'),
          valueUBA: 1n, requestId: 1000 + i,
          blockTimestamp: now - 1000
        })
      }
      const [, total] = await stats.redemptionCountWA(ag.address.hex, now, WEEK, STAT_LIMIT)
      expect(total).to.equal(3)
    })

    it('redemptionDefaultWA totals only rows within the [now-delta, now] window', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a09', 'rAgentVault09')
      const now = 1_700_001_000
      const recent = await fx.redemptionRequested({
        fasset: FAssetType.FXRP, agentVault: ag,
        redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        paymentAddressText: 'rR1', paymentReference: '0x' + 'a'.repeat(64),
        valueUBA: 100n, requestId: 9001, blockTimestamp: now - 100
      })
      const old = await fx.redemptionRequested({
        fasset: FAssetType.FXRP, agentVault: ag,
        redeemerHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        paymentAddressText: 'rR1', paymentReference: '0x' + 'b'.repeat(64),
        valueUBA: 100n, requestId: 9002, blockTimestamp: now - WEEK * 5
      })
      await fx.redemptionDefault({ redemptionRequested: recent, blockTimestamp: now - 90 })
      await fx.redemptionDefault({ redemptionRequested: old, blockTimestamp: now - WEEK * 5 + 10 })
      const [, total] = await stats.redemptionDefaultWA(ag.address.hex, now, WEEK, STAT_LIMIT)
      // Only the in-window default is counted.
      expect(total).to.equal(1)
    })
  })

  describe('liquidatedAmountWA', () => {
    it('reports zero for a vault with no in-window LiquidationPerformed', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a0a', 'rAgentVault0A')
      const [avg, n] = await stats.liquidatedAmountWA(ag.address.hex, 1_700_001_000, WEEK, STAT_LIMIT)
      expect(n).to.equal(0)
      expect(avg).to.equal(0n)
    })

    it('reports rows within the window', async () => {
      const fx = new Fixtures(db.orm.em.fork())
      const ag = await vault(fx, '0x0000000000000000000000000000000000000a0b', 'rAgentVault0B')
      const now = 1_700_001_000
      await fx.liquidationPerformed({
        fasset: FAssetType.FXRP, agentVault: ag,
        liquidatorHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        valueUBA: 5n, blockTimestamp: now - 1000
      })
      await fx.liquidationPerformed({
        fasset: FAssetType.FXRP, agentVault: ag,
        liquidatorHex: '0xddddddddddddddddddddddddddddddddddddDDDD',
        valueUBA: 7n, blockTimestamp: now - 2000
      })
      const [, n] = await stats.liquidatedAmountWA(ag.address.hex, now, WEEK, STAT_LIMIT)
      expect(n).to.equal(2)
    })
  })
})
