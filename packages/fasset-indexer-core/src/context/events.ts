import { Interface, Log, LogDescription, AbiCoder, toUtf8String, getBytes, Result } from "ethers"

type ParsedLog = { name: string, args: Result | unknown[] }
import {
  IAssetManager__latest__factory, IERC20__factory, ICollateralPool__latest__factory,
  IAssetManager__initial__factory, ICollateralPool__initial__factory,
  IPriceChangeEmitter__factory, ICoreVaultManager__factory,
  IMasterAccountController__factory, IPersonalAccount__factory,
  FAssetOFTAdapter__factory, IMintingTagManager__factory
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
import type { FAssetOFTAdapterInterface } from "../../chain/typechain/FAssetOFTAdapter"
import type { IMintingTagManagerInterface } from "../../chain/typechain/IMintingTagManager"


export class EventInterface {
  public interfaces: {
    assetManagerInterface: [IAssetManager__initialInterface, IAssetManager__latestInterface],
    erc20Interface: [IERC20Interface],
    collateralPoolInterface: [ICollateralPool__initialInterface, ICollateralPool__latestInterface],
    priceReader: [IPriceChangeEmitterInterface],
    coreVaultManager: [ICoreVaultManagerInterface],
    masterAccountController: [IMasterAccountControllerInterface],
    personalAccount: [IPersonalAccountInterface],
    oftAdapter: [FAssetOFTAdapterInterface],
    mintingTagManager: [IMintingTagManagerInterface]
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
      ],
      oftAdapter: [
        FAssetOFTAdapter__factory.createInterface()
      ],
      mintingTagManager: [
        IMintingTagManager__factory.createInterface()
      ]
    }
  }

  parseLog(contract: string, log: Log): ParsedLog | null {
    const ifaces = this.contractToIface(contract)
    for (const iface of ifaces) {
      const parsed = iface.parseLog(log)
      if (parsed != null) {
        return this.sanitizeParsedLog(parsed, log.data)
      }
    }
    return null
  }

  /**
   * Ethers v6 throws a deferred error when decoding string fields with
   * invalid UTF-8 (e.g. a raw 0xff byte in a paymentAddress). Since
   * `string` and `bytes` share the same ABI encoding, we re-decode with
   * `bytes` and convert via `toUtf8String` using the replacement character.
   */
  private sanitizeParsedLog(parsed: LogDescription, data: string): ParsedLog {
    const inputs = parsed.fragment.inputs
    const nonIndexedInputs = inputs.filter(i => !i.indexed)
    if (!nonIndexedInputs.some(i => i.type === 'string')) return parsed
    // probe string fields for deferred UTF-8 errors
    let needsFix = false
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].type === 'string' && !inputs[i].indexed) {
        try { void parsed.args[i] } catch { needsFix = true; break }
      }
    }
    if (!needsFix) return parsed
    // re-decode non-indexed params with 'bytes' in place of 'string'
    const bytesTypes = nonIndexedInputs.map(i => i.type === 'string' ? 'bytes' : i.type)
    const decoded = AbiCoder.defaultAbiCoder().decode(bytesTypes, data)
    // rebuild args: indexed from topics (safe), non-indexed from re-decoded data
    const safeArgs: unknown[] = []
    let nonIndexedIdx = 0
    for (const input of inputs) {
      if (input.indexed) {
        safeArgs.push(parsed.args[input.name])
      } else {
        if (input.type === 'string') {
          safeArgs.push(toUtf8String(getBytes(decoded[nonIndexedIdx]), (_reason, offset, _bytes, output) => {
            output.push(0xFFFD)
            return offset + 1
          }))
        } else {
          safeArgs.push(decoded[nonIndexedIdx])
        }
        nonIndexedIdx++
      }
    }
    return { name: parsed.name, args: safeArgs }
  }

  getTopicToIfaceMap(eventNames?: string[]): Map<string, FAssetIface[]> {
    const mp = new Map<string, FAssetIface[]>()
    for (const contractname of Object.keys(EVENTS)) {
      const cname = contractname as FAssetIface
      const iface = this.contractToIface(cname)
      for (const event of Object.values(EVENTS[cname])) {
        if (this.shouldIndexEvent(eventNames, cname, event)) {
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

  private shouldIndexEvent(eventNames: string[] | undefined, contract: FAssetIface, event: string): boolean {
    if (eventNames == null) return true
    return eventNames.includes(`${contract}:${event}`) || eventNames.includes(event)
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
      case "OFT_ADAPTER":
        return this.interfaces.oftAdapter
      case "MINTING_TAG_MANAGER":
        return this.interfaces.mintingTagManager
      default:
        throw new Error(`Unknown interface ${name}`)
    }
  }
}
