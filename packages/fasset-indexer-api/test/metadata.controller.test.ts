import { describe, beforeEach, afterEach, it } from 'mocha'
import { expect } from 'chai'
import { MetadataController } from '../src/controllers/metadata.controller'
import { MetadataService } from '../src/services/metadata.service'
import { ApiHarness, buildController, expectOk, stubResolve, stubReject } from './helpers'


describe('MetadataController', () => {
  let h: ApiHarness
  let metadata: any

  beforeEach(async () => {
    h = await buildController(MetadataController, { metadata: MetadataService })
    metadata = h.services.metadata
  })

  afterEach(async () => { await h.close() })

  describe('GET /api/metadata/cache', () => {
    it('returns the list of cache keys (no api envelope)', async () => {
      stubResolve(metadata, 'keys', ['k1', 'k2', 'k3'])
      const res = await h.request().get('/api/metadata/cache')
      expect(res.status).to.equal(200)
      expect(res.body).to.deep.equal(['k1', 'k2', 'k3'])
    })

    it('propagates an empty cache as []', async () => {
      stubResolve(metadata, 'keys', [])
      const res = await h.request().get('/api/metadata/cache')
      expect(res.status).to.equal(200)
      expect(res.body).to.deep.equal([])
    })
  })

  describe('GET /api/metadata/current-block', () => {
    it('wraps the current block number in the api envelope', async () => {
      stubResolve(metadata, 'currentBlock', 1234567)
      const res = await h.request().get('/api/metadata/current-block')
      expect(expectOk<number>(res)).to.equal(1234567)
    })

    it('returns null inside data when indexer has not advanced yet', async () => {
      stubResolve(metadata, 'currentBlock', null)
      const res = await h.request().get('/api/metadata/current-block')
      expect(res.status).to.equal(200)
      expect(res.body.status).to.equal(200)
      expect(res.body.data).to.equal(null)
    })

    it('returns a 500 envelope on service error', async () => {
      stubReject(metadata, 'currentBlock', new Error('db down'))
      const res = await h.request().get('/api/metadata/current-block')
      expect(res.status).to.equal(200)
      expect(res.body.status).to.equal(500)
      expect(res.body.error).to.equal('db down')
    })
  })

  describe('GET /api/metadata/blocks-for-current-update-sync', () => {
    it('returns the back-sync tuple', async () => {
      stubResolve(metadata, 'blocksToBackSync', ['indexerKey', 9999])
      const res = await h.request().get('/api/metadata/blocks-for-current-update-sync')
      const data = expectOk<[string | null, number | null]>(res)
      expect(data).to.deep.equal(['indexerKey', 9999])
    })

    it('handles both fields being null', async () => {
      stubResolve(metadata, 'blocksToBackSync', [null, null])
      const res = await h.request().get('/api/metadata/blocks-for-current-update-sync')
      const data = expectOk<[string | null, number | null]>(res)
      expect(data).to.deep.equal([null, null])
    })
  })
})
