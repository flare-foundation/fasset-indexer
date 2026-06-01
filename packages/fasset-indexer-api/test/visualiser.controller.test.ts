import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import { VisualiserController } from '../src/controllers/visualiser.controller'
import { VisualiserService } from '../src/services/visualiser.service'
import { ApiHarness, ADDR, BAD_ADDR, buildController, expectOk } from './helpers'


describe('VisualiserController', () => {
  let h: ApiHarness
  let service: any

  beforeEach(async () => {
    h = await buildController(VisualiserController, { vis: VisualiserService })
    service = h.services.vis
  })

  afterEach(async () => { await h.close() })

  describe('GET /api/visualiser/overview', () => {
    it('returns the bundled scene snapshot', async () => {
      const spy = sinon.stub().resolves({ chain: 'coston2', supportedFAssets: ['FXRP'] })
      service.systemOverview = spy
      const res = await h.request().get('/api/visualiser/overview')
      const data = expectOk<any>(res)
      expect(data.chain).to.equal('coston2')
      expect(spy.calledOnce).to.equal(true)
    })
  })

  describe('GET /api/visualiser/scene', () => {
    it('returns the full scene snapshot', async () => {
      const spy = sinon.stub().resolves({ overview: {}, agents: [], activeMintings: [], activeRedemptions: [] })
      service.scene = spy
      const res = await h.request().get('/api/visualiser/scene')
      const data = expectOk<any>(res)
      expect(data).to.have.all.keys('overview', 'agents', 'activeMintings', 'activeRedemptions')
    })
  })

  describe('GET /api/visualiser/emergency-pause', () => {
    it('returns the per-fasset pause array', async () => {
      service.emergencyPauseStatus = async () => [
        { fasset: 'FXRP', paused: false, externalPauseLevel: 0, externalPausedUntil: 0, governancePauseLevel: 0, governancePausedUntil: 0 }
      ]
      const res = await h.request().get('/api/visualiser/emergency-pause')
      const data = expectOk<any[]>(res)
      expect(data).to.have.length(1)
      expect(data[0].fasset).to.equal('FXRP')
    })
  })

  describe('GET /api/visualiser/settings', () => {
    it('passes optional fasset filter through', async () => {
      const spy = sinon.stub().resolves([])
      service.systemSettings = spy
      const res = await h.request().get('/api/visualiser/settings').query({ fasset: 'FXRP' })
      expectOk(res)
      expect(spy.firstCall.args[0]).to.deep.equal({ fasset: 'FXRP' })
    })

    it('passes undefined fasset when omitted', async () => {
      const spy = sinon.stub().resolves([])
      service.systemSettings = spy
      const res = await h.request().get('/api/visualiser/settings')
      expectOk(res)
      expect(spy.firstCall.args[0]).to.deep.equal({ fasset: undefined })
    })
  })

  describe('GET /api/visualiser/agents', () => {
    it('forwards filter triple', async () => {
      const spy = sinon.stub().resolves([])
      service.agents = spy
      const res = await h.request().get('/api/visualiser/agents').query({
        fasset: 'FXRP', status: 2, available: 'true'
      })
      expectOk(res)
      expect(spy.firstCall.args[0]).to.deep.equal({ fasset: 'FXRP', status: 2, available: true })
    })

    it('passes undefined for all optional filters when omitted', async () => {
      const spy = sinon.stub().resolves([])
      service.agents = spy
      const res = await h.request().get('/api/visualiser/agents')
      expectOk(res)
      expect(spy.firstCall.args[0]).to.deep.equal({ fasset: undefined, status: undefined, available: undefined })
    })

    it('400 on non-integer status', async () => {
      const res = await h.request().get('/api/visualiser/agents').query({ status: 'oops' })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/visualiser/agents/by-vault', () => {
    it('forwards checksummed vault query param', async () => {
      const spy = sinon.stub().resolves({ vaultAddress: ADDR.VAULT })
      service.agent = spy
      const res = await h.request().get('/api/visualiser/agents/by-vault').query({ vault: ADDR.VAULT.toLowerCase() })
      expectOk(res)
      expect(spy.calledOnceWith(ADDR.VAULT)).to.equal(true)
    })

    it('returns null when agent is unknown', async () => {
      service.agent = async () => null
      const res = await h.request().get('/api/visualiser/agents/by-vault').query({ vault: ADDR.VAULT })
      expectOk(res)
      expect(res.body.data).to.equal(null)
    })

    it('rejects invalid vault address with 400', async () => {
      const res = await h.request().get('/api/visualiser/agents/by-vault').query({ vault: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/visualiser/agents/:vault/state', () => {
    it('uses :vault path param (checksummed)', async () => {
      const spy = sinon.stub().resolves({ overview: {}, activeMintings: [], activeRedemptions: [], activeTickets: [] })
      service.agentState = spy
      const res = await h.request().get(`/api/visualiser/agents/${ADDR.VAULT.toLowerCase()}/state`)
      expectOk(res)
      expect(spy.calledOnceWith(ADDR.VAULT)).to.equal(true)
    })

    it('rejects invalid vault path param with 400', async () => {
      const res = await h.request().get(`/api/visualiser/agents/${BAD_ADDR}/state`)
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/visualiser/prices', () => {
    it('returns the price tick array', async () => {
      service.prices = async () => [{ symbol: 'XRP', value: 1n, decimals: 5, timestamp: 100 }]
      const res = await h.request().get('/api/visualiser/prices')
      const data = expectOk<any[]>(res)
      expect(data[0].symbol).to.equal('XRP')
    })
  })

  describe('GET /api/visualiser/redemption-tickets/active', () => {
    it('forwards fasset, checksummed agent, limit (defaulting limit to 200)', async () => {
      const spy = sinon.stub().resolves([])
      service.activeRedemptionTickets = spy
      const res = await h.request().get('/api/visualiser/redemption-tickets/active').query({ fasset: 'FXRP', agent: ADDR.AGENT.toLowerCase() })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal(['FXRP', ADDR.AGENT, 200])
    })

    it('honours an explicit limit', async () => {
      const spy = sinon.stub().resolves([])
      service.activeRedemptionTickets = spy
      const res = await h.request().get('/api/visualiser/redemption-tickets/active').query({ limit: 10 })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([undefined, undefined, 10])
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/visualiser/redemption-tickets/active').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/visualiser/mintings/active', () => {
    it('forwards fasset, agent, limit (defaulting limit to 200)', async () => {
      const spy = sinon.stub().resolves([])
      service.activeMintings = spy
      const res = await h.request().get('/api/visualiser/mintings/active').query({ fasset: 'FBTC' })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal(['FBTC', undefined, 200])
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/visualiser/mintings/active').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/visualiser/redemptions/active', () => {
    it('forwards fasset, agent, limit (defaulting limit to 200)', async () => {
      const spy = sinon.stub().resolves([])
      service.activeRedemptions = spy
      const res = await h.request().get('/api/visualiser/redemptions/active').query({ limit: 5 })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([undefined, undefined, 5])
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/visualiser/redemptions/active').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/visualiser/liquidations/active', () => {
    it('returns the active-liquidation rows', async () => {
      service.activeLiquidations = async () => [{ vault: '0xv', status: 2 }]
      const res = await h.request().get('/api/visualiser/liquidations/active')
      const data = expectOk<any[]>(res)
      expect(data).to.have.length(1)
    })
  })

  describe('GET /api/visualiser/challenges', () => {
    it('uses defaults of limit=100 / offset=0', async () => {
      const spy = sinon.stub().resolves([])
      service.challenges = spy
      const res = await h.request().get('/api/visualiser/challenges')
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([100, 0])
    })

    it('forwards explicit limit/offset', async () => {
      const spy = sinon.stub().resolves([])
      service.challenges = spy
      const res = await h.request().get('/api/visualiser/challenges').query({ limit: 10, offset: 20 })
      expectOk(res)
      expect(spy.firstCall.args).to.deep.equal([10, 20])
    })
  })

  describe('GET /api/visualiser/flows/active', () => {
    it('forwards the filter object with checksummed agent', async () => {
      const spy = sinon.stub().resolves([])
      service.activeFlows = spy
      const res = await h.request().get('/api/visualiser/flows/active').query({ fasset: 'FXRP', agent: ADDR.AGENT.toLowerCase() })
      expectOk(res)
      expect(spy.firstCall.args[0]).to.deep.equal({ fasset: 'FXRP', agentVault: ADDR.AGENT })
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/visualiser/flows/active').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/visualiser/flows', () => {
    it('defaults since to ~now-300 and limit to 200; passes through other filters', async () => {
      const spy = sinon.stub().resolves({ flows: [], cursor: { timestamp: 0, blockIndex: 0 } })
      service.flowsSince = spy
      const res = await h.request().get('/api/visualiser/flows').query({ fasset: 'FXRP' })
      expectOk(res)
      const [sinceTs, limit, opts] = spy.firstCall.args
      const now = Math.floor(Date.now() / 1000)
      expect(sinceTs).to.be.within(now - 305, now - 295)
      expect(limit).to.equal(200)
      expect(opts).to.deep.equal({ fasset: 'FXRP', agentVault: undefined, sinceBlock: undefined })
    })

    it('honours since + since_block + limit; checksums agent', async () => {
      const spy = sinon.stub().resolves({ flows: [], cursor: { timestamp: 1000, blockIndex: 7 } })
      service.flowsSince = spy
      const res = await h.request().get('/api/visualiser/flows').query({
        since: 1000, since_block: 7, limit: 50, agent: ADDR.AGENT.toLowerCase()
      })
      expectOk(res)
      expect(spy.firstCall.args[0]).to.equal(1000)
      expect(spy.firstCall.args[1]).to.equal(50)
      expect(spy.firstCall.args[2]).to.deep.equal({ fasset: undefined, agentVault: ADDR.AGENT, sinceBlock: 7 })
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/visualiser/flows').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })

  describe('GET /api/visualiser/flows/:flowId', () => {
    it('forwards the flowId path param verbatim', async () => {
      const spy = sinon.stub().resolves(null)
      service.flowById = spy
      const res = await h.request().get('/api/visualiser/flows/mint:FXRP:12345')
      expectOk(res)
      expect(spy.calledOnceWith('mint:FXRP:12345')).to.equal(true)
    })
  })

  describe('GET /api/visualiser/underlying-payments', () => {
    it('defaults since to ~now-300 and limit to 200', async () => {
      const spy = sinon.stub().resolves({ payments: [], cursor: { timestamp: 0, blockHeight: 0 } })
      service.underlyingPaymentsSince = spy
      const res = await h.request().get('/api/visualiser/underlying-payments')
      expectOk(res)
      const [sinceTs, limit, opts] = spy.firstCall.args
      expect(limit).to.equal(200)
      const now = Math.floor(Date.now() / 1000)
      expect(sinceTs).to.be.within(now - 305, now - 295)
      expect(opts).to.deep.equal({ fasset: undefined, sinceHeight: undefined })
    })

    it('honours since + since_height + fasset', async () => {
      const spy = sinon.stub().resolves({ payments: [], cursor: { timestamp: 0, blockHeight: 0 } })
      service.underlyingPaymentsSince = spy
      const res = await h.request().get('/api/visualiser/underlying-payments').query({
        since: 100, since_height: 7, fasset: 'FXRP'
      })
      expectOk(res)
      expect(spy.firstCall.args[0]).to.equal(100)
      expect(spy.firstCall.args[2]).to.deep.equal({ fasset: 'FXRP', sinceHeight: 7 })
    })
  })

  describe('GET /api/visualiser/events', () => {
    it('parses comma-separated kinds and trims whitespace', async () => {
      const spy = sinon.stub().resolves({ events: [], cursor: { timestamp: 0, blockIndex: 0 } })
      service.eventsSince = spy
      const res = await h.request().get('/api/visualiser/events').query({
        kind: 'MintingExecuted, RedemptionPerformed,,'
      })
      expectOk(res)
      const opts = spy.firstCall.args[2]
      expect(opts.kinds).to.deep.equal(['MintingExecuted', 'RedemptionPerformed'])
    })

    it('passes kinds as undefined when kind omitted', async () => {
      const spy = sinon.stub().resolves({ events: [], cursor: { timestamp: 0, blockIndex: 0 } })
      service.eventsSince = spy
      const res = await h.request().get('/api/visualiser/events')
      expectOk(res)
      expect(spy.firstCall.args[2].kinds).to.equal(undefined)
    })

    it('honours since + since_block + limit + agent + fasset; checksums agent', async () => {
      const spy = sinon.stub().resolves({ events: [], cursor: { timestamp: 0, blockIndex: 0 } })
      service.eventsSince = spy
      const res = await h.request().get('/api/visualiser/events').query({
        since: 1000, since_block: 5, limit: 50, agent: ADDR.AGENT.toLowerCase(), fasset: 'FXRP'
      })
      expectOk(res)
      const [sinceTs, limit, opts] = spy.firstCall.args
      expect(sinceTs).to.equal(1000)
      expect(limit).to.equal(50)
      expect(opts.agentVault).to.equal(ADDR.AGENT)
      expect(opts.fasset).to.equal('FXRP')
      expect(opts.sinceBlock).to.equal(5)
    })

    it('rejects invalid agent address with 400', async () => {
      const res = await h.request().get('/api/visualiser/events').query({ agent: BAD_ADDR })
      expect(res.status).to.equal(400)
    })
  })
})
