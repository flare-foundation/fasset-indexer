import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { createOrm } from 'fasset-indexer-core/orm'
import type { ORM } from 'fasset-indexer-core/orm'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'


// Resolve @mikro-orm/postgresql from fasset-indexer-core's node_modules so the
// PostgreSqlDriver class shares its @mikro-orm/core internals (raw token,
// MetadataStorage, QueryBuilder) with the entity decorators and analytics
// code, which all import via fasset-indexer-core. Mixing instances breaks
// orderBy(raw(...)) and entity discovery.
const coreRequire = createRequire(require.resolve('fasset-indexer-core/orm'))
const { PostgreSqlDriver } = coreRequire('@mikro-orm/postgresql')


export interface TestDb {
  orm: ORM
  stop: () => Promise<void>
}

// Spin up an in-process Postgres (pglite) on a random TCP port, then connect
// a fresh mikro-orm to it via core's createOrm — using core's mikro-orm
// instance so the entity metadata registers in the same place it's looked up.
// Schema is built from entity metadata, so every test gets a clean DB.
export async function startTestDb(): Promise<TestDb> {
  const db = await PGlite.create()
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' })
  await server.start()
  const port = (((server as unknown) as { server: { address: () => AddressInfo } }).server.address()).port

  const orm = await createOrm({
    driver: PostgreSqlDriver,
    host: '127.0.0.1',
    port,
    dbName: 'postgres',
    user: 'postgres',
    password: 'postgres',
    debug: false,
    pool: { min: 1, max: 1 }
  } as any, 'recreate')

  return {
    orm,
    async stop() {
      await orm.close(true)
      await server.stop()
      await db.close()
    }
  }
}
