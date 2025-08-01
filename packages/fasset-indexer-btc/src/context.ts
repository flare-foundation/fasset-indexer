import { createOrm, type ORM } from "fasset-indexer-core/orm"
import { BtcClient } from "./client/btc-client"
import { BtcConfigLoader } from "./config/config"
import { FIRST_UNHANDLED_BTC_BLOCK_DB_KEY, MIN_BTC_BLOCK_NUMBER_DB_KEY } from "./config/constants"


export class BtcContext {

  constructor(
    public readonly provider: BtcClient,
    public readonly orm: ORM,
    public readonly firstUnhandledBlockDbKey: string,
    public readonly minBlockNumberDbKey: string,
    public readonly chainName: string
  ) {}

  static async create(config: BtcConfigLoader) {
    const btcClient = new BtcClient(
      config.btcRpcUrl,
      config.btcRpcUser,
      config.btcRpcPassword,
      config.btcRpcApiKey
    )
    const orm = await createOrm(config.dbConfig, config.dbSchemaUpdateType)
    return new BtcContext(btcClient, orm, FIRST_UNHANDLED_BTC_BLOCK_DB_KEY, MIN_BTC_BLOCK_NUMBER_DB_KEY, 'btc')
  }
}