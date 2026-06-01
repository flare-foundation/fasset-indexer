import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import { FAssetType } from 'fasset-indexer-core'
import { ExplorerController } from '../src/controllers/explorer.controller'
import { ExplorerService } from '../src/services/explorer.service'
import { DashboardService } from '../src/services/dashboard.service'
import { TransactionType } from '../src/analytics/types'
import { MAX_TIMESERIES_PTS } from '../src/config/constants'
import { ApiHarness, ADDR, BAD_ADDR, buildController, expectOk } from './helpers'


describe('ExplorerController', () => {
  let h: ApiHarness
  let explorer: any
  let dashboard: any

  beforeEach(async () => {
    h = await buildController(ExplorerController, {
      explorer: ExplorerService,
      dashboard: DashboardService
    })
    explorer = h.services.explorer
    dashboard = h.services.dashboard
  })

  afterEach(async () => { await h.close() })

  describe('GET /api/explorer/statistics', () => {
    it('passes optional start/end through', async () => {
      const spy = sinon.stub().resolves({ mint: {}, redeem: {} })
      explorer.statistics = spy
      const res = await h.request().get('/api/explorer/statistics').query({ start: 100, end: 200 })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([100, 200])
    })

    it('passes undefined when start/end omitted', async () => {
      const spy = sinon.stub().resolves({ mint: {}, redeem: {} })
      explorer.statistics = spy
      const res = await h.request().get('/api/explorer/statistics')
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([undefined, undefined])
    })

    it('400 on non-integer start', async () => {
      const res = await h.request().get('/api/explorer/statistics').query({ start: 'oops' })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/explorer/transactions', () => {
    it('forwards required + optional args; user and agent are checksummed', async () => {
      const spy = sinon.stub().resolves({ transactions: [], count: 0 })
      explorer.transactions = spy
      const res = await h.request().get('/api/explorer/transactions').query({
        limit: 10, offset: 0, user: ADDR.USER.toLowerCase(), agent: ADDR.AGENT.toLowerCase(),
        start: 100, end: 200, asc: 'true', status: 1
      })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([10, 0, ADDR.USER, ADDR.AGENT, 100, 200, true, 1, undefined])
    })

    it('rejects invalid user address with 400', async () => {
      const res = await h.request().get('/api/explorer/transactions').query({
        limit: 10, offset: 0, user: BAD_ADDR
      })
      expect(res.status).to.equal(400)
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/explorer/transactions').query({
        limit: 10, offset: 0, agent: BAD_ADDR
      })
      expect(res.status).to.equal(400)
    })

    it('wraps a single types string into an array of TransactionType', async () => {
      const spy = sinon.stub().resolves({ transactions: [], count: 0 })
      explorer.transactions = spy
      const res = await h.request().get('/api/explorer/transactions').query({
        limit: 10, offset: 0, types: 'Mint'
      })
      expectOk(res)
      const passedTypes = spy.firstCall.args[8]
      expect(passedTypes).to.deep.equal([TransactionType.Mint])
    })

    it('parses array of types', async () => {
      const spy = sinon.stub().resolves({ transactions: [], count: 0 })
      explorer.transactions = spy
      const res = await h.request()
        .get('/api/explorer/transactions?limit=10&offset=0&types=Mint&types=DirectMint')
      expectOk(res)
      expect(spy.firstCall.args[8]).to.deep.equal([TransactionType.Mint, TransactionType.DirectMint])
    })

    it('400 when required limit is missing', async () => {
      const res = await h.request().get('/api/explorer/transactions').query({ offset: 0 })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/explorer/transaction-classification', () => {
    it('forwards hash', async () => {
      const spy = sinon.stub().resolves({ type: 'Mint' })
      explorer.transactionClassification = spy
      const res = await h.request().get('/api/explorer/transaction-classification').query({ hash: '0xdead' })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal(['0xdead'])
    })
  })

  function detailEndpoint(path: string, method: string) {
    describe(`GET ${path}`, () => {
      it('forwards hash to the service', async () => {
        const spy = sinon.stub().resolves({ events: { original: { id: 1 } } })
        explorer[method] = spy
        const res = await h.request().get(path).query({ hash: '0xabc' })
        expectOk(res)
        expect(spy.calledOnceWith('0xabc')).to.equal(true)
      })
    })
  }

  detailEndpoint('/api/explorer/transactions-details/minting', 'mintingTransactionDetails')
  detailEndpoint('/api/explorer/transactions-details/redemption', 'redemptionTransactionDetails')
  detailEndpoint('/api/explorer/transactions-details/transfer-to-core-vault', 'transferToCoreVaultTransactionDetails')
  detailEndpoint('/api/explorer/transactions-details/return-from-core-vault', 'returnFromCoreVaultTransactionDetails')
  detailEndpoint('/api/explorer/transaction-details/direct-mint', 'directMintTransactionDetails')
  detailEndpoint('/api/explorer/transaction-details/self-mint', 'selfMintTransactionDetails')
  detailEndpoint('/api/explorer/transaction-details/agent-balance-topup', 'underlyingBalanceToppedUpTransactionDetails')
  detailEndpoint('/api/explorer/transaction-details/agent-balance-withdrawal', 'underlyingWithdrawalTransactionDetails')

  describe('GET /api/explorer/timeseries/redeemed', () => {
    it('returns the FXRP slice of dashboard.redeemedTimeSeries', async () => {
      const spy = sinon.stub().resolves({
        [FAssetType[FAssetType.FXRP]]: { timestamps: [1], values: [5n] },
        [FAssetType[FAssetType.FBTC]]: { timestamps: [], values: [] }
      })
      dashboard.redeemedTimeSeries = spy
      const res = await h.request().get('/api/explorer/timeseries/redeemed').query({ endtime: 1000, npoints: 1 })
      const data = expectOk<any>(res)
      expect(data).to.deep.equal({ timestamps: [1], values: ['5'] })
    })

    it('rejects npoints over the cap', async () => {
      const res = await h.request().get('/api/explorer/timeseries/redeemed').query({
        endtime: 1000, npoints: MAX_TIMESERIES_PTS + 1
      })
      expect(res.body.status).to.equal(400)
      expect(res.body.error).to.match(/Cannot request more than/)
    })
  })

  describe('GET /api/explorer/timeseries/minted', () => {
    it('returns the FXRP slice of dashboard.mintedTimeSeries', async () => {
      const spy = sinon.stub().resolves({
        [FAssetType[FAssetType.FXRP]]: { timestamps: [10], values: [99n] }
      })
      dashboard.mintedTimeSeries = spy
      const res = await h.request().get('/api/explorer/timeseries/minted').query({ endtime: 2000, npoints: 1, startTime: 1000 })
      const data = expectOk<any>(res)
      expect(data).to.deep.equal({ timestamps: [10], values: ['99'] })
      expect(spy.firstCall.args).to.deep.equal([2000, 1, 1000])
    })

    it('rejects npoints over the cap', async () => {
      const res = await h.request().get('/api/explorer/timeseries/minted').query({
        endtime: 1000, npoints: MAX_TIMESERIES_PTS + 1
      })
      expect(res.body.status).to.equal(400)
    })
  })
})
