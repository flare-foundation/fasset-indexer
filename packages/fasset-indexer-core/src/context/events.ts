import { Interface, Log, LogDescription } from "ethers"
import {
  IAssetManager__latest__factory, IERC20__factory, ICollateralPool__latest__factory,
  IAssetManager__initial__factory, ICollateralPool__initial__factory,
  IPriceChangeEmitter__factory, ICoreVaultManager__factory,
  IMasterAccountController__factory, IPersonalAccount__factory
} from "../../chain/typechain"
import { EVENTS } from "../config/constants"
import type { IAssetManager__latestInterface } from "../../chain/typechain/assetManager/IAssetManager__latest"
import type { ICollateralPool__latestInterface } from "../../chain/typechain/collateralPool/ICollateralPool__latest"
import type { IPriceChangeEmitterInterface } from "../../chain/typechain/IPriceChangeEmitter"
import type { IERC20Interface } from "../../chain/typechain/IERC20"
import type { FAssetIface } from "../shared"
import type { ICoreVaultManagerInterface } from "../../chain/typechain/ICoreVaultManager"
// deprecated due to upgrades
import type { IAssetManager__initialInterface } from "../../chain/typechain/assetManager/IAssetManager__initial"
import type { ICollateralPool__initialInterface } from "../../chain/typechain/collateralPool/ICollateralPool__initial"
// smart accounts
import type { IPersonalAccountInterface } from "../../chain/typechain/smartAccount/IPersonalAccount"
import type { IMasterAccountControllerInterface } from "../../chain/typechain/smartAccount/IMasterAccountController"


export class EventInterface {
  public interfaces: {
    assetManagerInterface: [IAssetManager__initialInterface, IAssetManager__latestInterface],
    erc20Interface: [IERC20Interface],
    collateralPoolInterface: [ICollateralPool__initialInterface, ICollateralPool__latestInterface],
    priceReader: [IPriceChangeEmitterInterface],
    coreVaultManager: [ICoreVaultManagerInterface],
    masterAccountController: [IMasterAccountControllerInterface],
    personalAccount: [IPersonalAccountInterface]
  }

  constructor() {
    this.interfaces = {
      assetManagerInterface: [
        IAssetManager__initial__factory.createInterface(),
        IAssetManager__latest__factory.createInterface()
      ],
      erc20Interface: [
        IERC20__factory.createInterface()
      ],
      collateralPoolInterface: [
        ICollateralPool__initial__factory.createInterface(),
        ICollateralPool__latest__factory.createInterface()
      ],
      priceReader: [
        IPriceChangeEmitter__factory.createInterface()
      ],
      coreVaultManager: [
        ICoreVaultManager__factory.createInterface()
      ],
      masterAccountController: [
        IMasterAccountController__factory.createInterface()
      ],
      personalAccount: [
        IPersonalAccount__factory.createInterface()
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

  getTopicToIfaceMap(eventNames?: string[]): Map<string, FAssetIface[]> {
    const mp = new Map<string, FAssetIface[]>()
    for (const contractname of Object.keys(EVENTS)) {
      const cname = contractname as FAssetIface
      const iface = this.contractToIface(cname)
      for (const event of Object.values(EVENTS[cname])) {
        if (eventNames?.includes(event) !== false) {
          const topics = this.getEventTopics(event, iface)
          for (const topic of topics) {
            if (mp.get(topic) == null) {
              mp.set(topic, [])
            }
            mp.get(topic)!.push(cname)
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
      case "MASTER_ACCOUNT_CONTROLLER":
        return this.interfaces.masterAccountController
      case "PERSONAL_ACCOUNT":
        return this.interfaces.personalAccount
      default:
        throw new Error(`Unknown interface ${name}`)
    }
  }
}
