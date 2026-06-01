import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import { FAssetType } from 'fasset-indexer-core'
import { NotificationController } from '../src/controllers/notification.controller'
import { NotificationService } from '../src/services/notification.service'
import { ApiHarness, ADDR, BAD_ADDR, buildController, expectOk, stubResolve, stubReject } from './helpers'


describe('NotificationController', () => {
  let h: ApiHarness
  let service: any

  beforeEach(async () => {
    h = await buildController(NotificationController, { notification: NotificationService })
    service = h.services.notification
  })

  afterEach(async () => { await h.close() })

  describe('GET /api/notification/redemption-payment-status', () => {
    it('forwards redemptionId and the FAssetType enum value', async () => {
      const spy = sinon.stub().resolves({ paid: true })
      service.getRedemptionPaymentStatus = spy
      const res = await h.request().get('/api/notification/redemption-payment-status').query({ redemptionId: 42, fasset: 'FXRP' })
      expectOk(res)
      expect(spy.calledOnce).to.equal(true)
      const [redemptionId, fassetArg] = spy.firstCall.args
      expect(redemptionId).to.equal('42')
      expect(fassetArg).to.equal(FAssetType.FXRP)
    })

    it('passes through undefined for an unknown FAsset symbol', async () => {
      const spy = sinon.stub().resolves(null)
      service.getRedemptionPaymentStatus = spy
      const res = await h.request().get('/api/notification/redemption-payment-status').query({ redemptionId: 1, fasset: 'BOGUS' })
      expectOk(res)
      expect(spy.firstCall.args[1]).to.equal(undefined)
    })
  })

  describe('GET /api/notification/unhandled-redemptions', () => {
    it('returns the service payload wrapped in api envelope', async () => {
      stubResolve(service, 'unhandledDogeRedemptions', [{ id: 1 }, { id: 2 }])
      const res = await h.request().get('/api/notification/unhandled-redemptions').query({ startTime: 100 })
      const data = expectOk<any[]>(res)
      expect(data).to.have.length(2)
    })

    it('reports service errors via the envelope', async () => {
      stubReject(service, 'unhandledDogeRedemptions', 'kaboom')
      const res = await h.request().get('/api/notification/unhandled-redemptions').query({ startTime: 100 })
      expect(res.body.status).to.equal(500)
      expect(res.body.error).to.equal('kaboom')
    })
  })

  describe('GET /api/notification/last-collateral-pool-withdrawal', () => {
    it('returns the timestamp scalar with checksummed pool', async () => {
      const spy = sinon.stub().resolves(1700001234)
      service.lastCollateralPoolClaim = spy
      const res = await h.request().get('/api/notification/last-collateral-pool-withdrawal').query({ pool: ADDR.POOL.toLowerCase() })
      expect(expectOk<number>(res)).to.equal(1700001234)
      expect(spy.firstCall.args[0]).to.equal(ADDR.POOL)
    })

    it('rejects invalid pool address with 400', async () => {
      const res = await h.request().get('/api/notification/last-collateral-pool-withdrawal').query({ pool: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/notification/events-per-interval', () => {
    it('returns the events-per-interval scalar', async () => {
      const spy = sinon.stub().resolves(7)
      service.eventsPerInterval = spy
      const res = await h.request().get('/api/notification/events-per-interval').query({ seconds: 60 })
      expect(expectOk<number>(res)).to.equal(7)
      expect(spy.firstCall.args[0]).to.equal('60')
    })
  })

  describe('GET /api/notification/total-free-lots', () => {
    it('returns lot counts as decimal strings (bigint serialisation)', async () => {
      stubResolve(service, 'totalFreeLots', {
        publicLots: 100n,
        privateLots: 50n,
        liquidationLots: 5n,
        normalLots: 145n
      })
      const res = await h.request().get('/api/notification/total-free-lots')
      const data = expectOk<any>(res)
      expect(data).to.deep.equal({
        publicLots: '100',
        privateLots: '50',
        liquidationLots: '5',
        normalLots: '145'
      })
    })
  })

  describe('GET /api/notification/agents-in-liquidation', () => {
    it('reshapes the service tuple into named totals', async () => {
      stubResolve(service, 'agentsInLiquidation', [3, 20])
      const res = await h.request().get('/api/notification/agents-in-liquidation')
      const data = expectOk<{ totalAgents: number, agentsInLiquidation: number }>(res)
      expect(data).to.deep.equal({ totalAgents: 20, agentsInLiquidation: 3 })
    })
  })

  describe('GET /api/notification/full-liquidation-reason', () => {
    it('forwards the checksummed agent address', async () => {
      const spy = sinon.stub().resolves({ reason: 'underlying-too-low' })
      service.fullLiquidationReason = spy
      const res = await h.request().get('/api/notification/full-liquidation-reason').query({ agent: ADDR.AGENT.toLowerCase() })
      expectOk(res)
      expect(spy.calledOnceWith(ADDR.AGENT)).to.equal(true)
    })

    it('returns null payload as null inside data', async () => {
      stubResolve(service, 'fullLiquidationReason', null)
      const res = await h.request().get('/api/notification/full-liquidation-reason').query({ agent: ADDR.AGENT })
      expectOk(res)
      expect(res.body.data).to.equal(null)
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/notification/full-liquidation-reason').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })
})
