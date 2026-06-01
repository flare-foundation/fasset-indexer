import { describe, it, before, after } from 'mocha'
import { expect } from 'chai'
import { startTestDb, TestDb } from './db-harness'


describe('pglite harness', () => {
  let db: TestDb

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
  })

  after(async () => { if (db) await db.stop() })

  it('connects and runs a trivial query', async () => {
    const knex = db.orm.em.getConnection('read').getKnex()
    const r: any = await knex.raw("SELECT UPPER(SUBSTRING('0xabcdef' FROM 3)) AS v")
    expect(r.rows[0].v).to.equal('ABCDEF')
  })

  it('created the EvmAddress table from entity metadata', async () => {
    const knex = db.orm.em.getConnection('read').getKnex()
    const r: any = await knex.raw(
      "SELECT to_regclass('public.evm_address') AS t"
    )
    expect(r.rows[0].t).to.equal('evm_address')
  })
})
