import { createOrm, type ORM } from "fasset-indexer-core/orm"
import { DogeClient } from "./client/doge-client"
import { DogeConfigLoader } from "./config/config"
import { FIRST_UNHANDLED_DOGE_BLOCK_DB_KEY, MIN_DOGE_BLOCK_NUMBER_DB_KEY } from "./config/constants"


export class DogeContext {

  constructor(
    public readonly provider: DogeClient,
    public readonly orm: ORM,
    public readonly firstUnhandledBlockDbKey: string,
    public readonly minBlockNumberDbKey: string,
    public readonly chainName: string
  ) { }

  static async create(config: DogeConfigLoader) {
    const dogecoin = new DogeClient(
      config.dogeRpcUrl,
      config.dogeRpcUser,
      config.dogeRpcPassword,
      config.dogeRpcApiKey
    )
    const orm = await createOrm(config.dbConfig, config.dbSchemaUpdateType)
    return new DogeContext(dogecoin, orm, FIRST_UNHANDLED_DOGE_BLOCK_DB_KEY, MIN_DOGE_BLOCK_NUMBER_DB_KEY, 'doge')
  }
}