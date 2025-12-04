import { getContractInfo } from "../config/contracts"
import { FAssetType } from "../shared"
import { EventInterface } from "./events"
import type { ContractInfo } from "../config/interface"


export class ContractLookup extends EventInterface {
  static singleton: ContractLookup | null = null
  // caches
  private assetManagerToFAsset__cache: Map<string, FAssetType> = new Map()
  private fAssetToAssetManager__cache: Map<FAssetType, string> = new Map()
  private fAssetTokenToFAsset__cache: Map<string, FAssetType> = new Map()
  private fAssetToFAssetToken__cache: Map<FAssetType, string> = new Map()
  private coreVaultToFAsset__cache: Map<string, FAssetType> = new Map()
  private fAssetToCoreVault__cache: Map<FAssetType, string> = new Map()
  private fAssetToMasterAccountController__cache: Map<FAssetType, string> = new Map()
  // public
  public fassetTokens: string[] = []
  public contractInfos!: ContractInfo[]

  constructor(public readonly chain: string, file?: string) {
    if (ContractLookup.singleton !== null) {
      return ContractLookup.singleton
    }
    super()
    this.contractInfos = getContractInfo(chain, file)
    // populate caches for faster lookups
    this.populateFAssetTypeToAssetManagerCache()
    this.populateFAssetTypeToFAssetTokenCache()
    this.populateFAssetTypeToCoreVaultManagerCache()
    this.populateFAssetTypeToSmartAccountContractCache()
    this.fassetTokens = Array.from(this.fAssetTokenToFAsset__cache.keys())
    ContractLookup.singleton = this
  }

  supportsFAsset(fasset: FAssetType): boolean {
    return this.fAssetToAssetManager__cache.has(fasset)
  }

  isAssetManager(address: string): boolean {
    return this.assetManagerToFAsset__cache.has(address)
  }

  isFAssetToken(address: string): boolean {
    return this.fAssetTokenToFAsset__cache.has(address)
  }

  isCoreVaultManager(address: string): boolean {
    return this.coreVaultToFAsset__cache.has(address)
  }

  assetManagerAddressToFAssetType(address: string): FAssetType {
    if (this.assetManagerToFAsset__cache.has(address)) {
      return this.assetManagerToFAsset__cache.get(address)!
    } else {
      throw new Error(`No FAsset found for asset manager ${address}`)
    }
  }

  coreVaultManagerToFAssetType(address: string): FAssetType {
    if (this.coreVaultToFAsset__cache.has(address)) {
      return this.coreVaultToFAsset__cache.get(address)!
    } else {
      throw new Error(`No FAsset found for core vault manager ${address}`)
    }
  }

  fAssetTypeToAssetManagerAddress(type: FAssetType): string {
    if (this.fAssetToAssetManager__cache.has(type)) {
      return this.fAssetToAssetManager__cache.get(type)!
    } else {
      throw new Error(`No AssetManager found for type ${type}`)
    }
  }

  fAssetAddressToFAssetType(address: string): FAssetType {
    if (this.fAssetTokenToFAsset__cache.has(address)) {
      return this.fAssetTokenToFAsset__cache.get(address)!
    } else {
      throw new Error(`No FAsset type found for FAsset token ${address}`)
    }
  }

  fAssetTypeToFAssetAddress(type: FAssetType): string {
    if (this.fAssetToFAssetToken__cache.has(type)) {
      return this.fAssetToFAssetToken__cache.get(type)!
    } else {
      throw new Error(`No FAsset token found for type ${type}`)
    }
  }

  fassetTypeToCoreVaultManagerAddress(type: FAssetType): string {
    if (this.fAssetToCoreVault__cache.get(type)) {
      return this.fAssetToCoreVault__cache.get(type)!
    } else {
      throw new Error(`No core vault manager found for type ${type}`)
    }
  }

  fassetTypeToMasterAccountController(type: FAssetType): string {
    if (this.fAssetToMasterAccountController__cache.has(type)) {
      return this.fAssetToMasterAccountController__cache.get(type)!
    } else {
      throw new Error(`No master account controller found for type ${type}`)
    }
  }

  getContractAddress(name: string): string {
    for (const contract of this.contractInfos) {
      if (contract.name === name)
        return contract.address
    }
    throw new Error(`Contract address not found for ${name}`)
  }

  protected populateFAssetTypeToAssetManagerCache(): void {
    for (const contract of this.contractInfos) {
      const fasset = this.contractNameToFAssetType(contract.name, 'AssetManager_')
      if (fasset == null) continue
      this.assetManagerToFAsset__cache.set(contract.address, fasset)
      this.fAssetToAssetManager__cache.set(fasset, contract.address)
    }
  }

  protected populateFAssetTypeToCoreVaultManagerCache(): void {
    for (const contract of this.contractInfos) {
      const fasset = this.contractNameToFAssetType(contract.name, 'CoreVaultManager_')
      if (fasset == null) continue
      this.coreVaultToFAsset__cache.set(contract.address, fasset)
      this.fAssetToCoreVault__cache.set(fasset, contract.address)
    }
  }

  protected populateFAssetTypeToFAssetTokenCache(): void {
    for (const contract of this.contractInfos) {
      const fasset = this.contractNameToFAssetType(contract.name)
      if (fasset == null) continue
      this.fAssetTokenToFAsset__cache.set(contract.address, fasset)
      this.fAssetToFAssetToken__cache.set(fasset, contract.address)
    }
  }

  protected populateFAssetTypeToSmartAccountContractCache(): void {
    const masteraddr = this.getContractAddress('MasterAccountController')
    this.fAssetToMasterAccountController__cache.set(FAssetType.FXRP, masteraddr)
  }

  protected contractNameToFAssetType(name: string, prefix = ''): FAssetType | null {
    if (name === `${prefix}${this.FXRP}`) {
      return FAssetType.FXRP
    } else if (name === `${prefix}${this.FBTC}`) {
      return FAssetType.FBTC
    } else if (name === `${prefix}${this.FDOGE}`) {
      return FAssetType.FDOGE
    } else if (name === `${prefix}${this.FSIMCOINX}`) {
      return FAssetType.FSIMCOINX
    } else {
      return null
    }
  }

  protected get FXRP(): string {
    return this.chain === 'coston' || this.chain === 'coston2' ? 'FTestXRP' : 'FXRP'
  }
  protected get FDOGE(): string {
    return this.chain === 'coston' || this.chain === 'coston2' ? 'FTestDOGE' : 'FDOGE'
  }
  protected get FBTC(): string {
    return this.chain === 'coston' || this.chain === 'coston2' ? 'FTestBTC' : 'FBTC'
  }
  protected get FSIMCOINX(): string {
    return 'FSimCoinX'
  }

}