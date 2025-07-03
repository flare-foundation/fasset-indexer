import { readFileSync } from "fs"
import { defineConfig, Options } from "@mikro-orm/knex"
import { SqliteDriver } from "@mikro-orm/sqlite"
import { PostgreSqlDriver } from "@mikro-orm/postgresql"
import { getContractInfo } from "./contracts"
import type { ContractInfo } from "./interface"


interface ConfigJson {
  indexEvents: string[]
}

export class ConfigLoader {
  private _configJson: ConfigJson | undefined

  constructor() {
    require('dotenv').config()
  }

  get dbConfig(): Options<SqliteDriver | PostgreSqlDriver> {
    const dbtype = this.dbType
    if (dbtype === 'sqlite') {
      return this.sqliteConfig
    } else if (dbtype === 'postgres') {
      return this.postgresConfig
    } else {
      throw new Error(`Unsupported database type: ${dbtype}`)
    }
  }

  get chain(): string {
    return this.required('CHAIN')
  }

  get rpcUrl(): string {
    return this.required('RPC_URL')
  }

  get rpcApiKey(): string | undefined {
    return process.env.RPC_API_KEY
  }

  get contractInfo(): ContractInfo[] {
    return getContractInfo(this.chain, this.addressesJson)
  }

  get sqliteConfig(): Options<SqliteDriver> {
    return defineConfig({
      driver: SqliteDriver,
      dbName: this.dbName
    })
  }

  get postgresConfig(): Options<PostgreSqlDriver> {
    return defineConfig({
      driver: PostgreSqlDriver,
      dbName: this.dbName,
      host: this.dbHost,
      port: this.dbPort,
      user: this.dbUser,
      password: this.dbPass
    })
  }

  get addressesJson(): string | undefined {
    return process.env.ADDRESSES_JSON
  }

  get minBlock(): number | undefined {
    const minBlock = process.env.MIN_BLOCK_NUMBER
    return minBlock == null ? undefined : parseInt(minBlock)
  }

  get logQueryBatchSize(): number {
    const size = process.env.LOG_QUERY_BATCH_SIZE
    return size == null ? 28 : parseInt(size)
  }

  get indexPrices(): boolean {
    return process.env.INDEX_PRICES === 'true'
  }

  get json(): ConfigJson | undefined {
    if (this._configJson == null) {
      const configPath = process.env.CONFIG_PATH
      if (configPath != null) {
        const file = readFileSync(configPath)
        this._configJson = JSON.parse(file.toString())
      }
    }
    return this._configJson
  }

  protected get dbType(): string {
    return this.required('DB_TYPE')
  }

  protected get dbName(): string {
    return this.required('DB_NAME')
  }

  protected get dbHost(): string {
    return this.required('DB_HOST')
  }

  protected get dbPort(): number {
    const port = this.required('DB_PORT')
    return parseInt(port)
  }

  protected get dbUser(): string {
    return this.required('DB_USER')
  }

  protected get dbPass(): string {
    return this.required('DB_PASSWORD')
  }

  protected required(key: string): string {
    const value = process.env[key]
    if (value == null) {
      throw new Error(`required environment key ${key} has value ${value}`)
    }
    return value
  }
}