import { sleep } from "../utils/general"
import { CollateralTypeAdded } from "../orm/entities/events/token"
import { AgentVault } from "../orm/entities/agent"
import { FtsoPrice } from "../orm/entities/state/price"
import { isUntrackedAgentVault, updateAgentVaultInfo } from "./utils"
import { Context } from "../context/context"
import { logger } from "../logger"
import type { EntityManager } from "@mikro-orm/knex"
import type { FAssetType } from "../shared"


export class EvmStateWatchdog {

  constructor(public readonly context: Context) {}

  async run(): Promise<void> {
    while (true) {
      try {
        await this.context.orm.em.fork().transactional(async em => {
          await this.watchAgentInfo(em)
          await this.watchFtsoPrices(em)
        })
      } catch (e: any) {
        logger.error(`error in top-level Flare watchdog: ${e}`)
      }
      await sleep(this.context.config.stateFetchCycleSleepMs)
    }
  }

  async watchAgentInfo(em: EntityManager): Promise<void> {
    const agents = await em.find(AgentVault, { destroyed: false }, { populate: ['address'] })
    for (const agent of agents) {
      const agentUntracked = await isUntrackedAgentVault(em, agent.address.hex)
      if (agentUntracked) continue
      try {
        logger.info(`updating agent ${agent.address.hex} info for agent vault`)
        const assetManager = this.context.fAssetTypeToAssetManagerAddress(agent.fasset)
        await updateAgentVaultInfo(this.context, em, assetManager, agent.address.hex)
      } catch (e: any) {
        logger.error(`error updating agent ${agent.address} info: ${e}`)
      }
    }
  }

  async watchFtsoPrices(em: EntityManager): Promise<void> {
    const collateralTypes = await em.findAll(CollateralTypeAdded)
    const collateralSymbols = new Map<string, FAssetType>()
    for (const collateralType of collateralTypes) {
      collateralSymbols.set(collateralType.tokenFtsoSymbol, collateralType.fasset)
      collateralSymbols.set(collateralType.assetFtsoSymbol, collateralType.fasset)
    }
    for (const [symbol] of collateralSymbols) {
      try {
        logger.info(`updating ${symbol} price`)
        const { _price, _priceDecimals, _timestamp } = await this.context.contracts.priceReader.getPrice(symbol)
        em.upsert(FtsoPrice, {
          symbol: symbol,
          price: _price,
          decimals: Number(_priceDecimals),
          timestamp: Number(_timestamp)
        })
      } catch (err: any) {
        logger.error(`error updating ${symbol} price: ${err}`)
      }
    }
  }

}