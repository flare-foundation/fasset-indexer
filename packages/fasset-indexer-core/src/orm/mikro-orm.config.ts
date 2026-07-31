import { defineConfig, MikroORM } from "@mikro-orm/core"
import * as Entities from './entities'
import { updateSchema } from "./utils"
import { runDataMigrations } from "./data-migrations"
import { MIN_DATABASE_POOL_CONNECTIONS, MAX_DATABASE_POOL_CONNECTIONS } from "../config/constants"
import type { Options } from "@mikro-orm/core"
import type { AbstractSqlDriver } from "@mikro-orm/knex"
import type { ORM, OrmOptions, SchemaUpdate } from "./interface"

export const ORM_OPTIONS: Options<AbstractSqlDriver> = defineConfig({
  entities: Object.values(Entities),
  pool: {
    min: MIN_DATABASE_POOL_CONNECTIONS,
    max: MAX_DATABASE_POOL_CONNECTIONS
  },
  migrations: { disableForeignKeys: false },
  debug: false
})

// `runMigrations` comes from RUN_DATA_MIGRATIONS and defaults to off, so a
// caller that only reads (the api) never rewrites data by accident.
export async function createOrm(
  options: OrmOptions, update: SchemaUpdate, runMigrations = false
): Promise<ORM> {
  const initOptions = { ...ORM_OPTIONS, ...options }
  const orm = await MikroORM.init(initOptions)
  await updateSchema(orm, update)
  if (!await orm.isConnected())
    throw new Error("Failed to connect to database")
  // After the schema matches the entities, before anything writes: a migration
  // that rewrites ids has to land before the first row is indexed.
  await runDataMigrations(orm, update, runMigrations)
  return orm
}

export default ORM_OPTIONS