import { JsonRpcProvider, FetchRequest } from "ethers"
import { createOrm } from "../orm/mikro-orm.config"
import { ContractLookup } from "./lookup"
import { IAssetManager__factory, IERC20__factory, IAgentOwnerRegistry__factory, IPriceReader__factory, ICoreVaultManager__factory } from "../../chain/typechain"
import type { IAssetManager, IERC20, IAgentOwnerRegistry, IPriceReader, ICoreVaultManager } from "../../chain/typechain"
import type { ORM } from "../orm/interface"
import type { ConfigLoader } from "../config/config"


export class Context extends ContractLookup {
  public provider: JsonRpcProvider
  public contracts: {
    agentOwnerRegistry: IAgentOwnerRegistry
    priceReader: IPriceReader
  }

  constructor(public config: ConfigLoader, public orm: ORM) {
    super(config.chain, config.addressesJson)
    this.provider = this.getEthersApiProvider(config.rpcUrl, config.rpcApiKey)
    this.contracts = {
      agentOwnerRegistry: this.getAgentOwnerRegistryContract(),
      priceReader: this.getPriceReaderContract()
    }
  }

  static async create(loader: ConfigLoader): Promise<Context> {
    const orm = await createOrm(loader.dbConfig, loader.dbSchemaUpdateType)
    return new Context(loader, orm)
  }

  getAssetManagerContract(address: string): IAssetManager {
    return IAssetManager__factory.connect(address, this.provider)
  }

  getCoreVaultManagerContract(address: string): ICoreVaultManager {
    return ICoreVaultManager__factory.connect(address, this.provider)
  }

  getERC20(address: string): IERC20 {
    return IERC20__factory.connect(address, this.provider)
  }

  private getEthersApiProvider(rpcUrl: string, apiKey?: string): JsonRpcProvider {
    const connection = new FetchRequest(rpcUrl)
    if (apiKey !== undefined) {
      connection.setHeader('x-api-key', apiKey)
      connection.setHeader('x-apikey', apiKey)
    }
    return new JsonRpcProvider(connection)
  }

  private getAgentOwnerRegistryContract(): IAgentOwnerRegistry {
    const address = this.getContractAddress("AgentOwnerRegistry")
    return IAgentOwnerRegistry__factory.connect(address, this.provider)
  }

  private getPriceReaderContract(): IPriceReader {
    const address = this.getContractAddress("PriceReader")
    return IPriceReader__factory.connect(address, this.provider)
  }

}