import { createOrm, type ORM } from "fasset-indexer-core/orm"
import { XrpClient } from "./client/xrp-client"
import { XrpConfigLoader } from "./config/config"


export class XrpContext {

  constructor(
    public readonly provider: XrpClient,
    public readonly orm: ORM,
    public readonly chainName: string
  ) { }

  static async create(config: XrpConfigLoader) {
    const dogecoin = new XrpClient(config)
    const orm = await createOrm(config.dbConfig, 'safe')
    return new XrpContext(dogecoin, orm, 'xrp')
  }
}