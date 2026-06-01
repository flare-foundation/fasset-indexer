import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import { FxrpLaunch } from '../src/controllers/fxrp-launch.controller'
import { FxrpLaunchService } from '../src/services/fxrp-launch.service'
import { ApiHarness, ADDR, BAD_ADDR, buildController, expectOk, stubReject } from './helpers'


describe('FxrpLaunchController', () => {
  let h: ApiHarness
  let service: any

  beforeEach(async () => {
    h = await buildController(FxrpLaunch, { fxrp: FxrpLaunchService })
    service = h.services.fxrp
  })

  afterEach(async () => { await h.close() })

  describe('GET /api/fxrp-launch/total-minted/:user/:from', () => {
    it('routes user + from path params and forwards them to the service (user is checksummed)', async () => {
      const spy = sinon.stub().resolves({ FXRP: { value: 1000n } })
      service.mintedByUserFromTimestamp = spy
      const res = await h.request().get(`/api/fxrp-launch/total-minted/${ADDR.USER.toLowerCase()}/1700000000`)
      expectOk(res)
      expect(spy.calledOnceWithExactly(ADDR.USER, '1700000000')).to.equal(true)
    })

    it('serializes bigint values as decimal strings', async () => {
      service.mintedByUserFromTimestamp = async () => ({ FXRP: { value: 12345n } })
      const res = await h.request().get(`/api/fxrp-launch/total-minted/${ADDR.USER}/1700000000`)
      const data = expectOk<any>(res)
      expect(data.FXRP.value).to.equal('12345')
    })

    it('rejects invalid EVM address in the path with 400', async () => {
      const res = await h.request().get(`/api/fxrp-launch/total-minted/${BAD_ADDR}/1700000000`)
      expect(res.status).to.equal(400)
    })

    it('wraps service errors in a 500 envelope', async () => {
      stubReject(service, 'mintedByUserFromTimestamp', 'boom')
      const res = await h.request().get(`/api/fxrp-launch/total-minted/${ADDR.USER}/1700000000`)
      expect(res.body.status).to.equal(500)
      expect(res.body.error).to.equal('boom')
    })
  })
})
