import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import { FAssetType } from 'fasset-indexer-core'
import { DashboardController } from '../src/controllers/dashboard.controller'
import { DashboardService } from '../src/services/dashboard.service'
import {
  MAX_TIMESERIES_PTS, MAX_TIMESPAN_PTS, MAX_RETURNED_OBJECTS,
  CP_SCORE_MIN_POOL_COLLATERAL_WEI
} from '../src/config/constants'
import { ApiHarness, ADDR, BAD_ADDR, buildController, expectOk } from './helpers'


describe('DashboardController', () => {
  let h: ApiHarness
  let dashboard: any

  beforeEach(async () => {
    h = await buildController(DashboardController, { dashboard: DashboardService })
    dashboard = h.services.dashboard
  })

  afterEach(async () => { await h.close() })

  // ------------------------------------------------------------- system

  describe('GET /api/dashboard/transaction-count', () => {
    it('returns the count amount', async () => {
      dashboard.transactionCount = async () => ({ amount: 1234 })
      const res = await h.request().get('/api/dashboard/transaction-count')
      const data = expectOk<{ amount: number }>(res)
      expect(data.amount).to.equal(1234)
    })
  })

  describe('GET /api/dashboard/fasset-holder-count', () => {
    it('returns per-fasset counts', async () => {
      dashboard.fAssetholderCount = async () => ({ FXRP: { amount: 10 }, FBTC: { amount: 2 } })
      const res = await h.request().get('/api/dashboard/fasset-holder-count')
      const data = expectOk<any>(res)
      expect(data.FXRP.amount).to.equal(10)
    })
  })

  describe('GET /api/dashboard/performed-liquidation-count', () => {
    it('returns the count amount', async () => {
      dashboard.liquidationCount = async () => ({ amount: 7 })
      const res = await h.request().get('/api/dashboard/performed-liquidation-count')
      expect(expectOk<{amount: number}>(res).amount).to.equal(7)
    })
  })

  describe('GET /api/dashboard/minting-executed-count', () => {
    it('returns the count amount', async () => {
      dashboard.mintingExecutedCount = async () => ({ amount: 99 })
      const res = await h.request().get('/api/dashboard/minting-executed-count')
      expect(expectOk<{amount: number}>(res).amount).to.equal(99)
    })
  })

  describe('GET /api/dashboard/total-redeemed-lots', () => {
    it('returns per-fasset lot counts', async () => {
      dashboard.totalRedeemedLots = async () => ({ FXRP: { amount: 50 } })
      const res = await h.request().get('/api/dashboard/total-redeemed-lots')
      const data = expectOk<any>(res)
      expect(data.FXRP.amount).to.equal(50)
    })
  })

  describe('GET /api/dashboard/redemption-default', () => {
    it('forwards id and FAssetType enum value', async () => {
      const spy = sinon.stub().resolves({ id: 1 })
      dashboard.redemptionDefault = spy
      const res = await h.request().get('/api/dashboard/redemption-default').query({ id: 42, fasset: 'FXRP' })
      expectOk(res)
      expect(spy.firstCall.args[0]).to.equal('42')
      expect(spy.firstCall.args[1]).to.equal(FAssetType.FXRP)
    })

    it('returns null when service returns null', async () => {
      dashboard.redemptionDefault = async () => null
      const res = await h.request().get('/api/dashboard/redemption-default').query({ id: 99, fasset: 'FXRP' })
      expectOk(res)
      expect(res.body.data).to.equal(null)
    })
  })

  describe('GET /api/dashboard/total-tracked-underlying-agent-backing', () => {
    it('returns the FAssetValueResult', async () => {
      dashboard.trackedAgentUnderlyingBacking = async () => ({ FXRP: { value: 100n } })
      const res = await h.request().get('/api/dashboard/total-tracked-underlying-agent-backing')
      const data = expectOk<any>(res)
      expect(data.FXRP.value).to.equal('100')
    })
  })

  // -------------------------------------------------------------- agents

  describe('GET /api/dashboard/agent-minting-executed-count', () => {
    it('forwards the checksummed agent param', async () => {
      const spy = sinon.stub().resolves({ amount: 3 })
      dashboard.agentMintingExecutedCount = spy
      const res = await h.request().get('/api/dashboard/agent-minting-executed-count').query({ agent: ADDR.AGENT.toLowerCase() })
      expectOk(res)
      expect(spy.calledOnceWith(ADDR.AGENT)).to.equal(true)
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/dashboard/agent-minting-executed-count').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/dashboard/agent-redemption-success-rate', () => {
    it('forwards the checksummed agent param', async () => {
      const spy = sinon.stub().resolves({ amount: 0.95 })
      dashboard.agentRedemptionSuccessRate = spy
      const res = await h.request().get('/api/dashboard/agent-redemption-success-rate').query({ agent: ADDR.AGENT.toLowerCase() })
      expectOk(res)
      expect(spy.calledOnceWith(ADDR.AGENT)).to.equal(true)
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/dashboard/agent-redemption-success-rate').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/dashboard/agent-performed-liquidation-count', () => {
    it('forwards the checksummed agent param', async () => {
      const spy = sinon.stub().resolves({ amount: 2 })
      dashboard.agentLiquidationCount = spy
      const res = await h.request().get('/api/dashboard/agent-performed-liquidation-count').query({ agent: ADDR.AGENT.toLowerCase() })
      expectOk(res)
      expect(spy.calledOnceWith(ADDR.AGENT)).to.equal(true)
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/dashboard/agent-performed-liquidation-count').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  // ------------------------------------------------------ collateral pools

  describe('GET /api/dashboard/collateral-pool-transactions-count', () => {
    it('returns the count amount', async () => {
      dashboard.poolTransactionsCount = async () => ({ amount: 555 })
      const res = await h.request().get('/api/dashboard/collateral-pool-transactions-count')
      expect(expectOk<{amount: number}>(res).amount).to.equal(555)
    })
  })

  describe('GET /api/dashboard/best-performing-collateral-pools', () => {
    it('forwards n and parses minNatWei into BigInt', async () => {
      const spy = sinon.stub().resolves({ FXRP: [] })
      dashboard.bestCollateralPools = spy
      const res = await h.request().get('/api/dashboard/best-performing-collateral-pools').query({
        n: 5, minNatWei: '999000000000000000'
      })
      expectOk(res)
      const [n, minNat] = spy.firstCall.args
      expect(n).to.equal(5)
      expect(minNat).to.equal(BigInt('999000000000000000'))
    })

    it('defaults to CP_SCORE_MIN_POOL_COLLATERAL_WEI when minNatWei omitted', async () => {
      const spy = sinon.stub().resolves({ FXRP: [] })
      dashboard.bestCollateralPools = spy
      const res = await h.request().get('/api/dashboard/best-performing-collateral-pools').query({ n: 5 })
      expectOk(res)
      expect(spy.firstCall.args[1]).to.equal(CP_SCORE_MIN_POOL_COLLATERAL_WEI)
    })

    it('rejects n over MAX_RETURNED_OBJECTS', async () => {
      const res = await h.request().get('/api/dashboard/best-performing-collateral-pools').query({
        n: MAX_RETURNED_OBJECTS + 1
      })
      expect(res.body.status).to.equal(400)
      expect(res.body.error).to.match(/Cannot request more than/)
    })
  })

  describe('GET /api/dashboard/user-collateral-pool-token-portfolio', () => {
    it('forwards the checksummed user param', async () => {
      const spy = sinon.stub().resolves({ pools: [] })
      dashboard.userCollateralPoolTokenPortfolio = spy
      const res = await h.request().get('/api/dashboard/user-collateral-pool-token-portfolio').query({ user: ADDR.USER.toLowerCase() })
      expectOk(res)
      expect(spy.calledOnceWith(ADDR.USER)).to.equal(true)
    })

    it('rejects invalid user address with 400', async () => {
      const res = await h.request().get('/api/dashboard/user-collateral-pool-token-portfolio').query({ user: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/dashboard/total-claimed-pool-fees', () => {
    it('forwards both optional filters (checksummed)', async () => {
      const spy = sinon.stub().resolves({ FXRP: { value: 10n } })
      dashboard.totalClaimedPoolFees = spy
      const res = await h.request().get('/api/dashboard/total-claimed-pool-fees').query({
        pool: ADDR.POOL.toLowerCase(), user: ADDR.USER.toLowerCase()
      })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([ADDR.POOL, ADDR.USER])
    })

    it('passes undefined for both when omitted', async () => {
      const spy = sinon.stub().resolves({})
      dashboard.totalClaimedPoolFees = spy
      const res = await h.request().get('/api/dashboard/total-claimed-pool-fees')
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([undefined, undefined])
    })

    it('rejects invalid pool address with 400', async () => {
      const res = await h.request().get('/api/dashboard/total-claimed-pool-fees').query({ pool: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/dashboard/total-deposited-pool-fees', () => {
    it('returns the FAssetValueResult', async () => {
      dashboard.totalDepositedPoolFees = async () => ({ FXRP: { value: 5n } })
      const res = await h.request().get('/api/dashboard/total-deposited-pool-fees')
      const data = expectOk<any>(res)
      expect(data.FXRP.value).to.equal('5')
    })
  })

  // ------------------------------------------------------------ timespans
  // Each timespan endpoint shares the same shape: parse CSV/array of timestamps,
  // enforce MAX_TIMESPAN_PTS, forward to the analytics method.

  function timespanEndpoint(path: string, method: string, extra?: { user?: string, pool?: string }) {
    describe(`GET ${path}`, () => {
      it('parses comma-separated timestamps and forwards them', async () => {
        const spy = sinon.stub().resolves({ FXRP: { timestamps: [], values: [] } })
        dashboard[method] = spy
        const res = await h.request().get(path).query({ timestamps: '1,2,3', ...(extra || {}) })
        expectOk(res)
        expect(spy.firstCall.args[0]).to.deep.equal([1, 2, 3])
      })

      it('parses repeated timestamps query keys', async () => {
        const spy = sinon.stub().resolves({})
        dashboard[method] = spy
        const res = await h.request().get(`${path}?timestamps=10&timestamps=20`)
        expectOk(res)
        expect(spy.firstCall.args[0]).to.deep.equal([10, 20])
      })

      it('rejects timespans over MAX_TIMESPAN_PTS', async () => {
        const ts = Array.from({ length: MAX_TIMESPAN_PTS + 1 }, (_, i) => i + 1).join(',')
        const res = await h.request().get(path).query({ timestamps: ts })
        expect(res.body.status).to.equal(400)
        expect(res.body.error).to.match(/Timespan must be an array of maximum/)
      })
    })
  }

  timespanEndpoint('/api/dashboard/timespan/fasset-supply', 'fAssetSupplyTimespan')
  timespanEndpoint('/api/dashboard/timespan/fasset-tvl', 'fAssetSupplyAggregateTimespan')
  timespanEndpoint('/api/dashboard/timespan/core-vault-inflows', 'coreVaultInflowTimespan')
  timespanEndpoint('/api/dashboard/timespan/core-vault-inflows-usd', 'coreVaultInflowAggregateTimespan')
  timespanEndpoint('/api/dashboard/timespan/core-vault-outflows', 'coreVaultOutflowTimespan')
  timespanEndpoint('/api/dashboard/timespan/core-vault-outflows-usd', 'coreVaultOutflowAggregateTimespan')
  timespanEndpoint('/api/dashboard/timespan/core-vault-balance-usd', 'coreVaultBalanceAggregateTimespan')
  timespanEndpoint('/api/dashboard/timespan/tracked-underlying-backing-ratio', 'trackedUnderlyingBackingRatioTimeSeries')

  describe('GET /api/dashboard/timespan/pool-collateral', () => {
    it('forwards timestamps and the optional checksummed pool', async () => {
      const spy = sinon.stub().resolves({ timestamps: [], values: [] })
      dashboard.poolCollateralTimespan = spy
      const res = await h.request().get('/api/dashboard/timespan/pool-collateral').query({ timestamps: '1,2', pool: ADDR.POOL.toLowerCase() })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([[1, 2], ADDR.POOL])
    })

    it('passes undefined pool when omitted', async () => {
      const spy = sinon.stub().resolves({})
      dashboard.poolCollateralTimespan = spy
      const res = await h.request().get('/api/dashboard/timespan/pool-collateral').query({ timestamps: '1,2' })
      expectOk(res)
      expect(spy.firstCall.args[1]).to.equal(undefined)
    })

    it('rejects over MAX_TIMESPAN_PTS', async () => {
      const ts = Array.from({ length: MAX_TIMESPAN_PTS + 1 }, (_, i) => i).join(',')
      const res = await h.request().get('/api/dashboard/timespan/pool-collateral').query({ timestamps: ts })
      expect(res.body.status).to.equal(400)
    })

    it('rejects invalid pool address with 400', async () => {
      const res = await h.request().get('/api/dashboard/timespan/pool-collateral').query({ timestamps: '1,2', pool: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/dashboard/timespan/claimed-pool-fees', () => {
    it('forwards timestamps and the optional checksummed pool', async () => {
      const spy = sinon.stub().resolves({})
      dashboard.claimedPoolFeesTimespan = spy
      const res = await h.request().get('/api/dashboard/timespan/claimed-pool-fees').query({ timestamps: '1,2,3', pool: ADDR.POOL.toLowerCase() })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([[1, 2, 3], ADDR.POOL])
    })

    it('rejects invalid pool address with 400', async () => {
      const res = await h.request().get('/api/dashboard/timespan/claimed-pool-fees').query({ timestamps: '1,2', pool: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  // ---------------------------------------------------------- timeseries

  function timeseriesEndpoint(path: string, method: string) {
    describe(`GET ${path}`, () => {
      it('forwards (end, npoints, start) to the service', async () => {
        const spy = sinon.stub().resolves({ timestamps: [], values: [] })
        dashboard[method] = spy
        const res = await h.request().get(path).query({ endtime: 2000, npoints: 5, startTime: 1000 })
        expectOk(res)
        expect(spy.firstCall.args).to.deep.equal([2000, 5, 1000])
      })

      it('passes undefined start when omitted', async () => {
        const spy = sinon.stub().resolves({})
        dashboard[method] = spy
        const res = await h.request().get(path).query({ endtime: 2000, npoints: 5 })
        expectOk(res)
        expect(spy.firstCall.args[2]).to.equal(undefined)
      })

      it('rejects npoints > MAX_TIMESERIES_PTS', async () => {
        const res = await h.request().get(path).query({
          endtime: 1000, npoints: MAX_TIMESERIES_PTS + 1
        })
        expect(res.body.status).to.equal(400)
        expect(res.body.error).to.match(/Cannot request more than/)
      })

      it('400 on non-integer required params', async () => {
        const res = await h.request().get(path).query({ endtime: 'oops', npoints: 5 })
        expect(res.status).to.equal(400)
      })
    })
  }

  timeseriesEndpoint('/api/dashboard/timeseries/redeemed', 'redeemedAggregateTimeSeries')
  timeseriesEndpoint('/api/dashboard/timeseries/minted', 'mintedAggregateTimeSeries')
  timeseriesEndpoint('/api/dashboard/timeseries/core-vault-inflow', 'coreVaultInflowAggregateTimeSeries')
  timeseriesEndpoint('/api/dashboard/timeseries/core-vault-outflow', 'coreVaultOutflowAggregateTimeSeries')
  timeseriesEndpoint('/api/dashboard/timeseries/core-vault-tvl', 'coreVaultBalanceAggregateTimeSeries')
})
