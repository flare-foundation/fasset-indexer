import { readFileSync } from "fs"
import { defineConfig, Options } from "@mikro-orm/knex"
import { SqliteDriver } from "@mikro-orm/sqlite"
import { PostgreSqlDriver } from "@mikro-orm/postgresql"
import { getContractInfo } from "./contracts"
import { SchemaUpdate } from "../orm/interface"
import {
  EVENT_NAMES,
  DEFAULT_EVM_BLOCK_HEIGHT_OFFSET,
  DEFAULT_EVM_LOG_FETCH_BLOCK_BATCH_SIZE,
  DEFAULT_EVM_LOG_FETCH_SLEEP_MS,
  DEFAULT_EVM_STATE_UPDATE_SLEEP_MS
} from "./constants"
import type { ContractInfo, ConfigJson, ReindexConfig } from "./interface"


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

  get dbSchemaUpdateType(): SchemaUpdate {
    let type = process.env.DB_SCHEMA_UPDATE_TYPE
    if (this.isNull(type)) {
      return 'safe'
    }
    if (
      type == 'safe'
      || type == 'none'
      || type == 'full'
      || type == 'recreate'
    ) {
      return type
    }
    throw new Error(`invalid DB_SCHEMA_UPDATE_TYPE value ${type}`)
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
    return this.isNull(minBlock) ? undefined : parseInt(minBlock!)
  }

  get evmLogFetchBlockBatchSize(): number {
    const def = DEFAULT_EVM_LOG_FETCH_BLOCK_BATCH_SIZE
    const val = this.json?.events.logFetchBlockBatchSize
    return val == null ? def : val
  }

  get evmLogFetchCycleSleepMs(): number {
    const def = DEFAULT_EVM_LOG_FETCH_SLEEP_MS
    const val = this.json?.events.logFetchCycleSleepMs
    return val == null ? def : val
  }

  get evmLogFetchBlockHeightOffset(): number {
    const def = DEFAULT_EVM_BLOCK_HEIGHT_OFFSET
    const val = this.json?.events.logFetchBlockHeightOffset
    return val == null ? def : val
  }

  get stateFetchCycleSleepMs(): number {
    const def = DEFAULT_EVM_STATE_UPDATE_SLEEP_MS
    const val = this.json?.watchdog.cycleSleepMs
    return val == null ? def : val
  }

  get indexEvents(): string[] {
    return this.json?.indexEvents ?? EVENT_NAMES
  }

  get reindexing(): ReindexConfig | null {
    const type = process.env.REINDEX_TYPE
    if (this.isNull(type)) return null
    if (type !== 'back' && type !== 'race') {
      throw new Error(`REINDEX_TYPE cab be either "back" or "race"`)
    }
    const diff = this.required('REINDEX_DIFF')
    const name = this.required('REINDEX_NAME')
    return { type, diff: diff.split(','), name }
  }

  protected get json(): ConfigJson | undefined {
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
    if (this.isNull(value)) {
      throw new Error(`required environment key ${key} has value ${value}`)
    }
    return value!
  }

  protected isNull(value: string | undefined): boolean {
    return value == '' || value == null
  }
}