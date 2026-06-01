import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import { StatisticsController } from '../src/controllers/statistics.controller'
import { StatisticsService } from '../src/services/statistics.service'
import { DashboardService } from '../src/services/dashboard.service'
import { ApiHarness, ADDR, BAD_ADDR, buildController, expectOk } from './helpers'


const STAT_LIMIT = 100
const DELTA = 60 * 60 * 24 * 7

describe('StatisticsController', () => {
  let h: ApiHarness
  let stats: any
  let dashboard: any

  beforeEach(async () => {
    h = await buildController(StatisticsController, {
      stats: StatisticsService,
      dashboard: DashboardService
    })
    stats = h.services.stats
    dashboard = h.services.dashboard
  })

  afterEach(async () => { await h.close() })

  describe('GET /api/statistics/collateral-pool-score', () => {
    it('forwards the checksummed pool and uses raw 500 envelope (sanitize=false)', async () => {
      const spy = sinon.stub().resolves(42n)
      stats.collateralPoolScore = spy
      const res = await h.request().get('/api/statistics/collateral-pool-score').query({ pool: ADDR.POOL.toLowerCase() })
      expectOk(res)
      const [pool, , delta, limit] = spy.firstCall.args
      expect(pool).to.equal(ADDR.POOL)
      expect(delta).to.equal(DELTA)
      expect(limit).to.equal(STAT_LIMIT)
    })

    it('keeps raw error string in envelope (sanitize=false)', async () => {
      stats.collateralPoolScore = async () => { throw new Error('boom-detail') }
      const res = await h.request().get('/api/statistics/collateral-pool-score').query({ pool: ADDR.POOL })
      expect(res.body.status).to.equal(500)
      expect(res.body.error).to.match(/Error: boom-detail/)
    })

    it('rejects invalid pool address with 400', async () => {
      const res = await h.request().get('/api/statistics/collateral-pool-score').query({ pool: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  function avgEndpoint(path: string, method: string) {
    describe(`GET ${path}`, () => {
      it('wraps service [avg, count] into StatisticAverage with delta/limit/now (vault checksummed)', async () => {
        const spy = sinon.stub().resolves([7n, 12])
        stats[method] = spy
        const res = await h.request().get(path).query({ vault: ADDR.VAULT.toLowerCase() })
        const data = expectOk<any>(res)
        expect(data.average).to.equal('7')
        expect(data.total).to.equal(12)
        expect(data.delta).to.equal(DELTA)
        expect(data.limit).to.equal(STAT_LIMIT)
        expect(data.now).to.be.a('number')
        expect(spy.firstCall.args[0]).to.equal(ADDR.VAULT)
      })

      it('rejects invalid vault address with 400', async () => {
        const res = await h.request().get(path).query({ vault: BAD_ADDR })
        expect(res.status).to.equal(400)
      })
    })
  }

  avgEndpoint('/api/statistics/redemption-default-wa', 'redemptionDefaultWA')
  avgEndpoint('/api/statistics/redemption-time-wa', 'redemptionTimeWA')
  avgEndpoint('/api/statistics/liquidated-amount-wa', 'liquidatedAmountWA')
  avgEndpoint('/api/statistics/liquidated-duration-wa', 'liquidationDurationWA')
  avgEndpoint('/api/statistics/redemption-frequency-wa', 'redemptionCountWA')

  describe('GET /api/statistics/timeseries/user-minted', () => {
    it('rejects npoints > 1 with a 400 envelope', async () => {
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 1000, npoints: 2, user: ADDR.USER
      })
      expect(res.body.status).to.equal(400)
      expect(res.body.error).to.equal('at most one point allowed')
    })

    it('forwards (end, npoints, start, user) with user checksummed', async () => {
      const spy = sinon.stub().resolves({ FXRP: { timestamps: [], values: [] } })
      dashboard.mintedTimeSeries = spy
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 1000, npoints: 1, user: ADDR.USER.toLowerCase(), startTime: 500
      })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([1000, 1, 500, ADDR.USER])
    })

    it('passes undefined start when omitted', async () => {
      const spy = sinon.stub().resolves({})
      dashboard.mintedTimeSeries = spy
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 1000, npoints: 1, user: ADDR.USER
      })
      expectOk(res)
      expect(spy.firstCall.args[2]).to.equal(undefined)
    })

    it('rejects non-integer endtime with 400', async () => {
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 'oops', npoints: 1, user: ADDR.USER
      })
      expect(res.status).to.equal(400)
    })

    it('rejects invalid user address with 400', async () => {
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 1000, npoints: 1, user: BAD_ADDR
      })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/statistics/timeseries/user-redeemed', () => {
    it('rejects npoints > 1', async () => {
      const res = await h.request().get('/api/statistics/timeseries/user-redeemed').query({
        endtime: 1000, npoints: 5, user: ADDR.USER
      })
      expect(res.body.status).to.equal(400)
      expect(res.body.error).to.equal('at most one point allowed')
    })

    it('forwards (end, npoints, start, user) with user checksummed', async () => {
      const spy = sinon.stub().resolves({})
      dashboard.redeemedTimeSeries = spy
      const res = await h.request().get('/api/statistics/timeseries/user-redeemed').query({
        endtime: 2000, npoints: 1, user: ADDR.USER.toLowerCase(), startTime: 1500
      })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([2000, 1, 1500, ADDR.USER])
    })

    it('rejects invalid user address with 400', async () => {
      const res = await h.request().get('/api/statistics/timeseries/user-redeemed').query({
        endtime: 2000, npoints: 1, user: BAD_ADDR
      })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/statistics/underlying-user-minted', () => {
    it('forwards (user, start, end) to mintedByUnderlyingAddressDuring', async () => {
      const spy = sinon.stub().resolves({ FXRP: { value: 10n } })
      stats.mintedByUnderlyingAddressDuring = spy
      const res = await h.request().get('/api/statistics/underlying-user-minted').query({
        user: 'rXYZ', startTime: 100, endtime: 200
      })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal(['rXYZ', 100, 200])
    })

    it('rejects non-integer startTime with 400', async () => {
      const res = await h.request().get('/api/statistics/underlying-user-minted').query({
        user: 'rXYZ', startTime: 'x', endtime: 200
      })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/statistics/underlying-user-redeemed', () => {
    it('forwards (user, start, end) to redeemedByUnderlyingAddressDuring', async () => {
      const spy = sinon.stub().resolves({})
      stats.redeemedByUnderlyingAddressDuring = spy
      const res = await h.request().get('/api/statistics/underlying-user-redeemed').query({
        user: 'rXYZ', startTime: 100, endtime: 200
      })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal(['rXYZ', 100, 200])
    })
  })

  describe('GET /api/statistics/underlying-minter-addresses', () => {
    it('returns the array of underlying addresses; user is checksummed', async () => {
      const spy = sinon.stub().resolves(['rA', 'rB'])
      stats.underlyingMinterAddresses = spy
      const res = await h.request().get('/api/statistics/underlying-minter-addresses').query({ user: ADDR.USER.toLowerCase() })
      const data = expectOk<string[]>(res)
      expect(data).to.deep.equal(['rA', 'rB'])
      expect(spy.firstCall.args[0]).to.equal(ADDR.USER)
    })

    it('rejects invalid user address with 400', async () => {
      const res = await h.request().get('/api/statistics/underlying-minter-addresses').query({ user: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/statistics/minter-default-count', () => {
    it('returns the scalar count; user is checksummed', async () => {
      const spy = sinon.stub().resolves(3)
      stats.minterDefaultCount = spy
      const res = await h.request().get('/api/statistics/minter-default-count').query({ user: ADDR.USER.toLowerCase() })
      expect(expectOk<number>(res)).to.equal(3)
      expect(spy.firstCall.args[0]).to.equal(ADDR.USER)
    })

    it('rejects invalid user address with 400', async () => {
      const res = await h.request().get('/api/statistics/minter-default-count').query({ user: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })
})
