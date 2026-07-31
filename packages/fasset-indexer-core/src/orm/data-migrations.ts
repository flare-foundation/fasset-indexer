import { existsSync, readdirSync, readFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { getVar } from "./utils"
import { Var } from "./entities/state/var"
import { logger } from "../logger"
import type { ORM, SchemaUpdate } from "./interface"


// One-off SQL under migrations/ that rewrites data, which the schema generator
// cannot do. Applied automatically on startup when DB_SCHEMA_UPDATE_TYPE=full,
// so a deployment where nobody has shell access can still be migrated by setting
// one variable and rolling the image.
//
// Naming: NNN-<slug>.sql is a migration. NNN-verify.sql, if present, runs
// straight after and must raise on anything wrong -- the marker is only written
// once it passes, so a failed verification leaves the migration pending rather
// than silently recorded. NNN-audit.sql is for operators and is never run here.
const APPLIED_VAR_PREFIX = "dataMigration:"
const MIGRATION_FILE = /^\d{3}-.+\.sql$/
const NOT_A_MIGRATION = /-(verify|audit)\.sql$/

export interface DataMigration {
  name: string
  sql: string
  verifySql?: string
}

// Resolve migrations/ relative to the package rather than to __dirname, which
// sits at a different depth under dist/ than it does in src/.
function migrationsDir(): string {
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "migrations"))) {
      return join(dir, "migrations")
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`could not locate the migrations directory from ${__dirname}`)
}

export function discoverDataMigrations(dir = migrationsDir()): DataMigration[] {
  const files = readdirSync(dir)
    .filter(f => MIGRATION_FILE.test(f) && !NOT_A_MIGRATION.test(f))
    .sort()
  return files.map(file => {
    const name = file.replace(/\.sql$/, "")
    const verify = resolve(dir, `${file.slice(0, 3)}-verify.sql`)
    return {
      name,
      sql: readFileSync(resolve(dir, file), "utf8"),
      verifySql: existsSync(verify) ? readFileSync(verify, "utf8") : undefined
    }
  })
}

export async function pendingDataMigrations(orm: ORM): Promise<DataMigration[]> {
  const em = orm.em.fork()
  const pending: DataMigration[] = []
  for (const migration of discoverDataMigrations()) {
    if (await getVar(em, APPLIED_VAR_PREFIX + migration.name) == null) {
      pending.push(migration)
    }
  }
  return pending
}

// Applying is gated on RUN_DATA_MIGRATIONS, not on the schema update type.
// Rewriting millions of rows is a different operation from reconciling the
// schema, and deserves its own decision.
//
// Outstanding work with the switch off still throws. The id encoding is a hard
// cutover: an indexer writing encoded ids into an unmigrated database produces
// exactly the mixed ordering the encoding exists to prevent. Refusing to start
// is the recoverable failure.
export async function runDataMigrations(
  orm: ORM, update: SchemaUpdate, enabled: boolean
): Promise<void> {
  const pending = await pendingDataMigrations(orm)
  if (pending.length === 0) return

  // 'recreate' builds the schema from scratch, so the migrations are no-ops on
  // the empty database -- but they still need recording, or every later start
  // would see them as outstanding.
  const names = pending.map(m => m.name).join(", ")
  if (!enabled && update !== "recreate") {
    throw new Error(
      `${pending.length} data migration(s) not applied: ${names}. `
      + `Start once with RUN_DATA_MIGRATIONS=true to apply them, then unset it. `
      + `Refusing to start against a database they have not run on.`
    )
  }

  const conn = orm.em.getConnection()
  for (const migration of pending) {
    logger.info(`applying data migration ${migration.name}`)
    // Each file carries its own transaction and takes an advisory lock, so
    // concurrent service starts queue rather than collide.
    await conn.execute(migration.sql)
    if (migration.verifySql != null) {
      logger.info(`verifying data migration ${migration.name}`)
      await conn.execute(migration.verifySql)
    }
    // upsert, not setVar: the advisory lock is released when the migration's own
    // transaction commits, so two services starting together can reach this line
    // at once. setVar reads then inserts, which would collide on the primary key
    // and fail one of their startups.
    await orm.em.fork().upsert(Var, {
      key: APPLIED_VAR_PREFIX + migration.name,
      value: new Date().toISOString()
    })
    logger.info(`applied data migration ${migration.name}`)
  }
}
