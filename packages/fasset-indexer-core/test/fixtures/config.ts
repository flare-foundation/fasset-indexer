import { ConfigLoader } from "../../src/config/config"
import type { Options } from "@mikro-orm/knex"
import type { SqliteDriver } from "@mikro-orm/sqlite"
import type { PostgreSqlDriver } from "@mikro-orm/postgresql"


// Points at the postgres shipped by .devcontainer/compose.yaml, which sets the
// TEST_DB_* variables. The defaults also let the suite run against any postgres
// reachable on localhost, so it is not devcontainer-only.
export class TestConfigLoader extends ConfigLoader {

  override get chain() {
    return 'coston'
  }

  override get rpcUrl() {
    return 'http://localhost:8545'
  }

  // Tests run sequentially, so the production-sized pool (30) would just hold
  // idle connections open against a shared database.
  override get dbConfig(): Options<SqliteDriver | PostgreSqlDriver> {
    return {
      ...super.dbConfig,
      pool: { min: 1, max: parseInt(process.env.TEST_DB_POOL_MAX ?? '5') }
    }
  }

  protected override get dbType(): string {
    return 'postgres'
  }

  protected override get dbName(): string {
    return process.env.TEST_DB_NAME ?? 'fasset_indexer_test'
  }

  protected override get dbHost(): string {
    return process.env.TEST_DB_HOST ?? 'localhost'
  }

  protected override get dbPort(): number {
    return parseInt(process.env.TEST_DB_PORT ?? '5432')
  }

  protected override get dbUser(): string {
    return process.env.TEST_DB_USER ?? 'fasset'
  }

  protected override get dbPass(): string {
    return process.env.TEST_DB_PASSWORD ?? 'fasset'
  }
}
