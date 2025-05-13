import { createOrm, type ORM } from "fasset-indexer-core/orm"
import { XrpClient } from "./client/xrp-client"
import { XrpConfigLoader } from "./config/config"
import { FIRST_UNHANDLED_XRP_BLOCK_DB_KEY, MIN_XRP_BLOCK_NUMBER_DB_KEY } from "./config/constants"


export class XrpContext {

  constructor(
    public readonly provider: XrpClient,
    public readonly orm: ORM,
    public readonly firstUnhandledBlockDbKey: string,
    public readonly minBlockNumberDbKey: string,
    public readonly chainName: string
  ) { }

  static async create(config: XrpConfigLoader) {
    const dogecoin = new XrpClient(config)
    const orm = await createOrm(config.dbConfig, 'safe')
    return new XrpContext(dogecoin, orm, FIRST_UNHANDLED_XRP_BLOCK_DB_KEY, MIN_XRP_BLOCK_NUMBER_DB_KEY, 'xrp')
  }
}