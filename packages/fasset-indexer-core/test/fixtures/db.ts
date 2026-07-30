import { createOrm } from "../../src/orm"
import { Context } from "../../src/context/context"
import { TestConfigLoader } from "./config"
import type { ORM } from "../../src/orm/interface"


// Building the schema means creating 100+ tables, so tests share a single
// context and wipe rows between cases rather than recreating it per test.
// 'recreate' drops whatever a previous run left behind.
export async function createTestContext(): Promise<Context> {
  const loader = new TestConfigLoader()
  const orm = await createOrm(loader.dbConfig, 'recreate')
  return new Context(loader, orm)
}

// mikro-orm's clearDatabase() truncates one table per round trip, which is 100+
// statements per test. A single TRUNCATE does the same work in one; RESTART
// IDENTITY also keeps autoincrement ids deterministic from one test to the next,
// which the file-per-test sqlite setup used to give us for free.
export async function resetDatabase(orm: ORM): Promise<void> {
  const tables = Object.values(orm.getMetadata().getAll())
    .filter(meta => !meta.abstract && !meta.embeddable && !meta.virtual)
    .map(meta => meta.tableName)
    .filter(name => name != null)
  const quoted = [...new Set(tables)].map(name => `"${name}"`)
  if (quoted.length === 0) return
  // No identity map to clear: tests drive everything through orm.em.fork(), so
  // each case already starts from a fresh context.
  await orm.em.getConnection().execute(
    `TRUNCATE TABLE ${quoted.join(', ')} RESTART IDENTITY CASCADE`
  )
}
