import { Interface, Log, LogDescription } from "ethers"
import {
  IAssetManager__factory, IERC20__factory, ICollateralPool__factory,
  IPriceChangeEmitter__factory, ICoreVaultManager__factory,
  IAssetManagerPreUpgrade__factory, ICollateralPoolPreUpgrade__factory
} from "../../chain/typechain"
import { EVENTS } from "../config/constants"
import type { IAssetManagerInterface } from "../../chain/typechain/IAssetManager"
import type { ICollateralPoolInterface } from "../../chain/typechain/ICollateralPool"
import type { IPriceChangeEmitterInterface } from "../../chain/typechain/IPriceChangeEmitter"
import type { IERC20Interface } from "../../chain/typechain/IERC20"
import type { FAssetIface } from "../shared"
import type { ICoreVaultManagerInterface } from "../../chain/typechain/ICoreVaultManager"
// deprecated due to upgrades
import type { IAssetManagerPreUpgradeInterface } from "../../chain/typechain/IAssetManagerPreUpgrade"
import type { ICollateralPoolPreUpgradeInterface } from "../../chain/typechain/ICollateralPoolPreUpgrade"


export class EventInterface {
  public interfaces: {
    assetManagerInterface: [IAssetManagerPreUpgradeInterface, IAssetManagerInterface],
    erc20Interface: [IERC20Interface],
    collateralPoolInterface: [ICollateralPoolPreUpgradeInterface, ICollateralPoolInterface],
    priceReader: [IPriceChangeEmitterInterface],
    coreVaultManager: [ICoreVaultManagerInterface]
  }

  constructor() {
    this.interfaces = {
      assetManagerInterface: [
        IAssetManagerPreUpgrade__factory.createInterface(),
        IAssetManager__factory.createInterface()
      ],
      erc20Interface: [
        IERC20__factory.createInterface()
      ],
      collateralPoolInterface: [
        ICollateralPoolPreUpgrade__factory.createInterface(),
        ICollateralPool__factory.createInterface()
      ],
      priceReader: [
        IPriceChangeEmitter__factory.createInterface()
      ],
      coreVaultManager: [
        ICoreVaultManager__factory.createInterface()
      ]
    }
  }

  parseLog(contract: string, log: Log): LogDescription | null {
    const ifaces = this.contractToIface(contract)
    for (const iface of ifaces) {
      const parsed = iface.parseLog(log)
      if (parsed != null) {
        return parsed
      }
    }
    return null
  }

  getTopicToIfaceMap(eventNames?: string[]): Map<string, FAssetIface> {
    const mp = new Map<string, FAssetIface>()
    for (const contractname of Object.keys(EVENTS)) {
      const cname = contractname as keyof typeof EVENTS
      const iface = this.contractToIface(contractname)
      for (const event of Object.values(EVENTS[cname])) {
        if (eventNames?.includes(event) !== false) {
          const topics = this.getEventTopics(event, iface)
          for (const topic of topics) {
            mp.set(topic, cname)
          }
        }
      }
    }
    return mp
  }

  getEventTopics(eventName: string, ifaces: Interface[]): string[] {
    const topics = new Set<string>()
    for (const iface of ifaces) {
      const parsed = iface.getEvent(eventName)
      if (parsed != null) {
        topics.add(parsed.topicHash)
      }
    }
    if (topics.size == 0) {
       new Error(`Event ${eventName} not found in interface`)
    }
    return Array.from(topics)
  }

  contractToIface(name: string): Interface[] {
    switch (name) {
      case "ERC20":
        return this.interfaces.erc20Interface
      case "ASSET_MANAGER":
        return this.interfaces.assetManagerInterface
      case "COLLATERAL_POOL":
        return this.interfaces.collateralPoolInterface
      case "PRICE_READER":
        return this.interfaces.priceReader
      case "CORE_VAULT_MANAGER":
        return this.interfaces.coreVaultManager
      default:
        throw new Error(`Unknown interface ${name}`)
    }
  }
}
