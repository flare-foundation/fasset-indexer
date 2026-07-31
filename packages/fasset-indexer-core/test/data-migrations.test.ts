import { describe, before, beforeEach, after, it } from "mocha"
import { use, expect } from "chai"
import chaiAsPromised from "chai-as-promised"
import { discoverDataMigrations, pendingDataMigrations, runDataMigrations } from "../src/orm/data-migrations"
import { getVar, setVar } from "../src/orm/utils"
import { Context } from "../src/context/context"
import { createTestContext, resetDatabase } from "./fixtures/db"

use(chaiAsPromised)

describe("data migrations", () => {

  describe("discovery", () => {

    it("should find the migrations shipped with the package", () => {
      // Also proves the directory resolves from wherever the code is running:
      // migrations/ sits at a different depth under dist/ than under src/.
      const found = discoverDataMigrations()
      expect(found.map(m => m.name)).to.include('001-encode-evm-log-ids')
    })

    it("should pair a migration with its verify script", () => {
      const encode = discoverDataMigrations().find(m => m.name === '001-encode-evm-log-ids')!
      expect(encode.sql).to.contain('pg_advisory_xact_lock')
      expect(encode.verifySql, 'verify script should be picked up').to.be.a('string')
      expect(encode.verifySql!).to.contain('dangling')
    })

    it("should not treat verify or audit scripts as migrations", () => {
      const names = discoverDataMigrations().map(m => m.name)
      expect(names).to.not.include('001-verify')
      expect(names).to.not.include('001-audit')
    })
  })

  describe("application", () => {
    let context: Context

    before(async () => {
      context = await createTestContext()
    })

    beforeEach(async () => {
      await resetDatabase(context.orm)
    })

    after(async () => {
      await context.orm.close(true)
    })

    it("should report every migration as pending on a fresh database", async () => {
      // resetDatabase truncates var, so nothing is recorded
      const pending = await pendingDataMigrations(context.orm)
      expect(pending.map(m => m.name)).to.include('001-encode-evm-log-ids')
    })

    it("should apply and record migrations when the schema update is full", async () => {
      await runDataMigrations(context.orm, 'full')
      expect(await pendingDataMigrations(context.orm)).to.be.empty
      const marker = await getVar(context.orm.em.fork(), 'dataMigration:001-encode-evm-log-ids')
      expect(marker, 'applied marker should be written').to.exist
      expect(marker!.value).to.be.a('string')
    })

    it("should be a no-op once applied", async () => {
      await runDataMigrations(context.orm, 'full')
      const first = await getVar(context.orm.em.fork(), 'dataMigration:001-encode-evm-log-ids')
      await runDataMigrations(context.orm, 'full')
      const second = await getVar(context.orm.em.fork(), 'dataMigration:001-encode-evm-log-ids')
      expect(second!.value, 'marker should not be rewritten').to.equal(first!.value)
    })

    it("should refuse to start when migrations are outstanding and the update is safe", async () => {
      // The dangerous case: encoded ids being written into an unmigrated
      // database. Failing startup is the recoverable outcome.
      await expect(runDataMigrations(context.orm, 'safe'))
        .to.be.rejectedWith(/not applied.*DB_SCHEMA_UPDATE_TYPE=full/s)
    })

    // The production case: the migration was applied by hand, so the database is
    // already encoded but carries no marker. The first automated start has to
    // recognise that as a no-op rather than trying to rewrite anything.
    it("should record a migration that was already applied by hand", async () => {
      const conn = context.orm.em.getConnection()
      const encoded = await conn.execute(
        'SELECT count(*) FILTER (WHERE id <> block_index::bigint * 1048576 + "index") AS wrong FROM evm_log'
      ) as [{ wrong: string }]
      expect(Number(encoded[0].wrong), 'fixture db is already encoded').to.equal(0)

      await runDataMigrations(context.orm, 'full')
      expect(await pendingDataMigrations(context.orm)).to.be.empty
    })

    it("should record the marker atomically, so concurrent starts cannot collide", async () => {
      // Five services start at once on a rolling deploy; the advisory lock only
      // covers the migration's own transaction, not the marker write.
      await Promise.all(Array.from({ length: 5 }, () => runDataMigrations(context.orm, 'full')))
      expect(await pendingDataMigrations(context.orm)).to.be.empty
    })

    it("should start normally with safe once the migration is recorded", async () => {
      await setVar(context.orm.em.fork(), 'dataMigration:001-encode-evm-log-ids', 'already-done')
      await expect(runDataMigrations(context.orm, 'safe')).to.eventually.be.undefined
    })
  })
})
