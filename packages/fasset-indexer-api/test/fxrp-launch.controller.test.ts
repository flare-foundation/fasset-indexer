import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import { FxrpLaunch } from '../src/controllers/fxrp-launch.controller'
import { FxrpLaunchService } from '../src/services/fxrp-launch.service'
import { ApiHarness, buildController, expectOk, stubReject } from './helpers'


describe('FxrpLaunchController', () => {
  let h: ApiHarness
  let service: any

  beforeEach(async () => {
    h = await buildController(FxrpLaunch, { fxrp: FxrpLaunchService })
    service = h.services.fxrp
  })

  afterEach(async () => { await h.close() })

  describe('GET /api/fxrp-launch/total-minted/:user/:from', () => {
    it('routes user + from path params and forwards them to the service', async () => {
      const spy = sinon.stub().resolves({ FXRP: { value: 1000n } })
      service.mintedByUserFromTimestamp = spy
      const res = await h.request().get('/api/fxrp-launch/total-minted/0xabc/1700000000')
      expectOk(res)
      expect(spy.calledOnceWithExactly('0xabc', '1700000000')).to.equal(true)
    })

    it('serializes bigint values as decimal strings', async () => {
      service.mintedByUserFromTimestamp = async () => ({ FXRP: { value: 12345n } })
      const res = await h.request().get('/api/fxrp-launch/total-minted/0xabc/1700000000')
      const data = expectOk<any>(res)
      expect(data.FXRP.value).to.equal('12345')
    })

    it('wraps service errors in a 500 envelope', async () => {
      stubReject(service, 'mintedByUserFromTimestamp', 'boom')
      const res = await h.request().get('/api/fxrp-launch/total-minted/0xabc/1700000000')
      expect(res.body.status).to.equal(500)
      expect(res.body.error).to.equal('boom')
    })
  })
})
