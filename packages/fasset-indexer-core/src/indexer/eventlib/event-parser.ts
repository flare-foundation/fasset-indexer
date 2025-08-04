import { AgentVault } from "../../orm/entities/agent"
import { Context } from "../../context/context"
import type { EntityManager } from "@mikro-orm/knex"
import type { Log } from "ethers"
import type { Event } from "./event-scraper"
import type { FAssetIface } from "../../shared"


interface Block {
  index: number
  timestamp: number
}

interface Transaction {
  hash: string
  source: string
  target: string | null
}

export class EventParser {
  private topicToIface = new Map<string, FAssetIface>()
  private blockCache: Block | null = null
  private transactionCache: Transaction | null = null

  constructor(public readonly context: Context, public readonly eventnames?: string[]) {
    this.topicToIface = this.context.getTopicToIfaceMap(eventnames)
  }

  async logToEvent(log: Log): Promise<Event | null> {
    const iface = this.topicToIface.get(log.topics[0])
    if (iface == null) return null
    const valid = await this.validLogSource(iface, log.address)
    if (!valid) return null
    const parsed = this.context.parseLog(iface, log)
    if (parsed == null) return null
    const block = await this.getBlock(log.blockNumber)
    const transaction = await this.getTransaction(log.transactionHash)
    return {
      name: parsed.name,
      args: parsed.args,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.index,
      source: log.address,
      blockTimestamp: block.timestamp,
      transactionHash: log.transactionHash,
      transactionSource: transaction.source,
      transactionTarget: transaction.target,
      topic: log.topics[0]
    }
  }

  async validLogSource(iface: FAssetIface, source: string): Promise<boolean> {
    if (iface === 'ASSET_MANAGER') {
      if (this.context.isAssetManager(source)) {
        return true
      }
    } else if (iface === 'ERC20') {
      const em = this.context.orm.em.fork()
      if (this.context.isFAssetToken(source)) {
        return true
      } else if (await this.isCollateralPoolToken(em, source)) {
        return true
      }
    } else if (iface === 'COLLATERAL_POOL') {
      const em = this.context.orm.em.fork()
      if (await this.isCollateralPool(em, source)) {
        return true
      }
    } else if (iface === 'PRICE_READER') {
      if (await this.isPriceReader(source)) {
        return true
      }
    } else if (iface === 'CORE_VAULT_MANAGER') {
      if (this.context.isCoreVaultManager(source)) {
        return true
      }
    } else {
      return false
    }
    return false
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
        index: blockNumber,
        timestamp: block.timestamp
      }
    }
    return this.blockCache
  }

  protected async getTransaction(transactionHash: string): Promise<Transaction> {
    if (this.transactionCache === null || this.transactionCache.hash !== transactionHash) {
      const transaction = await this.context.provider.getTransaction(transactionHash)
      if (transaction === null) {
        throw new Error(`Failed to fetch transaction ${transactionHash}`)
      }
      this.transactionCache = {
        hash: transactionHash,
        source: transaction.from,
        target: transaction.to
      }
    }
    return this.transactionCache
  }

}