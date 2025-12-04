import { AgentVault } from "../../orm/entities/agent"
import { Context } from "../../context/context"
import { FAssetType, type FAssetIface } from "../../shared"
import type { EntityManager } from "@mikro-orm/knex"
import type { Log } from "ethers"
import type { Block, Transaction, Event } from "./types"



export class EventParser {
  private topicToIfaces = new Map<string, FAssetIface[]>()
  private blockCache: Block | null = null
  private transactionCache: Transaction | null = null

  constructor(public readonly context: Context, public readonly eventnames?: string[]) {
    this.topicToIfaces = this.context.getTopicToIfaceMap(eventnames)
  }

  async logToEvent(log: Log): Promise<Event | null> {
    const topic = log.topics[0]
    const iface = this.topicToIfaces.get(topic)
    if (iface == null || iface.length == 0) return null
    const source = await this.logSource(iface, log.address)
    if (source == null) return null
    const parsed = this.context.parseLog(iface[0], log)
    if (parsed == null) return null
    const block = await this.getBlock(log.blockNumber)
    const transaction = await this.getTransaction(log.transactionHash)
    return {
      name: parsed.name,
      topic,
      args: parsed.args,
      source: log.address,
      sourcename: source,
      index: log.index,
      transaction: transaction,
      block: block,
    }
  }

  async logSource(ifaces: FAssetIface[], source: string): Promise<FAssetIface | null> {
    if (ifaces.includes('ASSET_MANAGER')) {
      if (this.context.isAssetManager(source)) {
        return 'ASSET_MANAGER'
      }
    }
    if (ifaces.includes('ERC20')) {
      const em = this.context.orm.em.fork()
      if (this.context.isFAssetToken(source)) {
        return 'ERC20'
      } else if (await this.isCollateralPoolToken(em, source)) {
        return 'COLLATERAL_POOL'
      }
    }
    if (ifaces.includes('COLLATERAL_POOL')) {
      const em = this.context.orm.em.fork()
      if (await this.isCollateralPool(em, source)) {
        return 'COLLATERAL_POOL'
      }
    }
    if (ifaces.includes('PRICE_READER')) {
      if (await this.isPriceReader(source)) {
        return 'PRICE_READER'
      }
    }
    if (ifaces.includes('CORE_VAULT_MANAGER')) {
      if (this.context.isCoreVaultManager(source)) {
        return 'CORE_VAULT_MANAGER'
      }
    }
    if (ifaces.includes('MASTER_ACCOUNT_CONTROLLER')) {
      if (this.context.fassetTypeToMasterAccountController(FAssetType.FXRP) == source) {
        return 'MASTER_ACCOUNT_CONTROLLER'
      }
    }
    return null
  }

  protected async isCollateralPool(em: EntityManager, address: string): Promise<boolean> {
    const pool = await em.findOne(AgentVault, { collateralPool: { hex: address } })
    return pool !== null
  }

  protected async isCollateralPoolToken(em: EntityManager, address: string): Promise<boolean> {
    const pool = await em.findOne(AgentVault, { collateralPoolToken: { hex: address } })
    return pool !== null
  }

  protected async isAgentVault(em: EntityManager, address: string): Promise<boolean> {
    const vault = await em.findOne(AgentVault, { address: { hex: address }})
    return vault !== null
  }

  protected async isPriceReader(address: string): Promise<boolean> {
    return address === await this.context.contracts.priceReader.getAddress()
  }

  protected async getBlock(blockNumber: number): Promise<Block> {
    if (this.blockCache === null || this.blockCache.index !== blockNumber) {
      const block = await this.context.provider.getBlock(blockNumber)
      if (block === null) {
        throw new Error(`Failed to fetch block ${blockNumber}`)
      }
      this.blockCache = {
        index: block.number,
        timestamp: block.timestamp
      }
    }
    return this.blockCache
  }

  protected async getTransaction(transactionHash: string): Promise<Transaction> {
    if (this.transactionCache === null || this.transactionCache.hash !== transactionHash) {
      const transaction = await this.context.provider.getTransaction(transactionHash)
      const receipt = await this.context.provider.getTransactionReceipt(transactionHash)
      if (transaction == null || receipt == null) {
        throw new Error(`Failed to fetch transaction ${transactionHash}`)
      }
      this.transactionCache = {
        hash: transactionHash,
        source: transaction.from,
        target: transaction.to ?? receipt.to,
        gasUsed: receipt.gasUsed,
        gasPrice: transaction.gasPrice,
        gasLimit: transaction.gasLimit,
        type: transaction.type,
        value: transaction.value,
        nonce: transaction.nonce,
        index: transaction.index
      }
    }
    return this.transactionCache
  }

}