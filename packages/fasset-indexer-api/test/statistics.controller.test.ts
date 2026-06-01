import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import { StatisticsController } from '../src/controllers/statistics.controller'
import { StatisticsService } from '../src/services/statistics.service'
import { DashboardService } from '../src/services/dashboard.service'
import { ApiHarness, buildController, expectOk } from './helpers'


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
    it('forwards the pool and uses raw 500 envelope (sanitize=false)', async () => {
      const spy = sinon.stub().resolves(42n)
      stats.collateralPoolScore = spy
      const res = await h.request().get('/api/statistics/collateral-pool-score').query({ pool: '0xpool' })
      expectOk(res)
      const [pool, , delta, limit] = spy.firstCall.args
      expect(pool).to.equal('0xpool')
      expect(delta).to.equal(DELTA)
      expect(limit).to.equal(STAT_LIMIT)
    })

    it('keeps raw error string in envelope (sanitize=false)', async () => {
      stats.collateralPoolScore = async () => { throw new Error('boom-detail') }
      const res = await h.request().get('/api/statistics/collateral-pool-score').query({ pool: '0xpool' })
      expect(res.body.status).to.equal(500)
      expect(res.body.error).to.match(/Error: boom-detail/)
    })
  })

  function avgEndpoint(path: string, method: string) {
    describe(`GET ${path}`, () => {
      it('wraps service [avg, count] into StatisticAverage with delta/limit/now', async () => {
        stats[method] = sinon.stub().resolves([7n, 12])
        const res = await h.request().get(path).query({ vault: '0xv' })
        const data = expectOk<any>(res)
        expect(data.average).to.equal('7')
        expect(data.total).to.equal(12)
        expect(data.delta).to.equal(DELTA)
        expect(data.limit).to.equal(STAT_LIMIT)
        expect(data.now).to.be.a('number')
      })
    })
  }

  avgEndpoint('/api/statistics/redemption-default-wa', 'redemptionDefaultWA')
  avgEndpoint('/api/statistics/redemption-time-wa', 'redemptionTimeWA')
  avgEndpoint('/api/statistics/liquidated-amount-wa', 'liquidatedAmountWA')
  avgEndpoint('/api/statistics/liquidated-duration-wa', 'liquidationDurationWA')
  avgEndpoint('/api/statistics/redemption-frequency-wa', 'redemptionCountWA')

  describe('GET /api/statistics/timeseries/user-minted', () => {
    it('rejects npoints > 1 with an error envelope', async () => {
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 1000, npoints: 2, user: '0xu'
      })
      expect(res.body.status).to.equal(500)
      expect(res.body.error).to.equal('Server error')
    })

    it('forwards (end, npoints, start, user) to dashboard.mintedTimeSeries', async () => {
      const spy = sinon.stub().resolves({ FXRP: { timestamps: [], values: [] } })
      dashboard.mintedTimeSeries = spy
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 1000, npoints: 1, user: '0xu', startTime: 500
      })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([1000, 1, 500, '0xu'])
    })

    it('passes undefined start when omitted', async () => {
      const spy = sinon.stub().resolves({})
      dashboard.mintedTimeSeries = spy
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 1000, npoints: 1, user: '0xu'
      })
      expectOk(res)
      expect(spy.firstCall.args[2]).to.equal(undefined)
    })

    it('rejects non-integer endtime with 400', async () => {
      const res = await h.request().get('/api/statistics/timeseries/user-minted').query({
        endtime: 'oops', npoints: 1, user: '0xu'
      })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/statistics/timeseries/user-redeemed', () => {
    it('rejects npoints > 1', async () => {
      const res = await h.request().get('/api/statistics/timeseries/user-redeemed').query({
        endtime: 1000, npoints: 5, user: '0xu'
      })
      expect(res.body.status).to.equal(500)
      expect(res.body.error).to.equal('Server error')
    })

    it('forwards (end, npoints, start, user) to dashboard.redeemedTimeSeries', async () => {
      const spy = sinon.stub().resolves({})
      dashboard.redeemedTimeSeries = spy
      const res = await h.request().get('/api/statistics/timeseries/user-redeemed').query({
        endtime: 2000, npoints: 1, user: '0xu', startTime: 1500
      })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([2000, 1, 1500, '0xu'])
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
    it('returns the array of underlying addresses', async () => {
      stats.underlyingMinterAddresses = async () => ['rA', 'rB']
      const res = await h.request().get('/api/statistics/underlying-minter-addresses').query({ user: '0xu' })
      const data = expectOk<string[]>(res)
      expect(data).to.deep.equal(['rA', 'rB'])
    })
  })

  describe('GET /api/statistics/minter-default-count', () => {
    it('returns the scalar count', async () => {
      const spy = sinon.stub().resolves(3)
      stats.minterDefaultCount = spy
      const res = await h.request().get('/api/statistics/minter-default-count').query({ user: '0xu' })
      expect(expectOk<number>(res)).to.equal(3)
      expect(spy.firstCall.args[0]).to.equal('0xu')
    })
  })
})
