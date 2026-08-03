import { getContractInfo } from "../config/contracts"
import { FAssetType } from "../shared"
import { EventInterface } from "./events"
import type { FAssetIface } from "../shared"
import type { ContractInfo } from "../config/interface"


export class ContractLookup extends EventInterface {
  static singleton: ContractLookup | null = null
  // caches
  private contractNameToAddress: Map<string, string> = new Map<string, string>
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

  constructor(public readonly chain: string, file?: string, deployment?: string) {
    if (ContractLookup.singleton !== null) {
      return ContractLookup.singleton
    }
    super()
    this.contractInfos = getContractInfo(chain, file, deployment)
    // populate caches for faster lookups
    this.populateContractMap()
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

  oftAdapterAddress(): string {
    return this.requireContractAddress('FAssetOFTAdapter')
  }

  mintingTagManagerAddress(): string {
    return this.requireContractAddress('MintingTagManager')
  }

  contractAddress(name: string): string | null {
    return this.contractNameToAddress.get(name) ?? null
  }

  requireContractAddress(name: string): string {
    const address = this.contractAddress(name)
    if (address == null) {
      throw new Error(`Contract address not found for ${name}`)
    }
    return address
  }

  /**
   * Every address a log of the given interfaces can legitimately come from, or
   * null when at least one of them has no statically known source set.
   *
   * This is what lets the scraper narrow an eth_getLogs request; null means
   * "cannot narrow, fetch everything". COLLATERAL_POOL and ERC20 are what force
   * that: EventParser resolves collateral pools and pool tokens out of
   * agent_vault, so their address set grows as agent vaults are created —
   * including inside the very block range a request is fetching, whose events an
   * address list computed beforehand would silently drop.
   *
   * A contract missing from the deployment degrades to null for the same reason,
   * as does an empty set: a narrowed request must never be stricter than what
   * EventParser would accept, and eth_getLogs has no way to spell "no address".
   */
  eventSourceAddresses(ifaces: Iterable<FAssetIface>): string[] | null {
    const addresses = new Set<string>()
    for (const iface of ifaces) {
      const sources = this.staticEventSourceAddresses(iface)
      if (sources == null) return null
      for (const source of sources) {
        addresses.add(source)
      }
    }
    return addresses.size > 0 ? Array.from(addresses) : null
  }

  protected staticEventSourceAddresses(iface: FAssetIface): string[] | null {
    switch (iface) {
      case 'ASSET_MANAGER':
        return Array.from(this.assetManagerToFAsset__cache.keys())
      case 'CORE_VAULT_MANAGER':
        return Array.from(this.coreVaultToFAsset__cache.keys())
      case 'MASTER_ACCOUNT_CONTROLLER':
        return Array.from(this.fAssetToMasterAccountController__cache.values())
      case 'PRICE_READER':
        return this.deployedAt('PriceReader')
      case 'OFT_ADAPTER':
        return this.deployedAt('FAssetOFTAdapter')
      case 'MINTING_TAG_MANAGER':
        return this.deployedAt('MintingTagManager')
      // ERC20 and COLLATERAL_POOL are resolved against the database at parse
      // time, so their sources are not knowable before the request.
      default:
        return null
    }
  }

  private deployedAt(name: string): string[] | null {
    const address = this.contractAddress(name)
    return address == null ? null : [address]
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
    const masteraddr = this.requireContractAddress('MasterAccountController')
    this.fAssetToMasterAccountController__cache.set(FAssetType.FXRP, masteraddr)
  }

  protected populateContractMap(): void {
    for (const contract of this.contractInfos) {
      this.contractNameToAddress.set(contract.name, contract.address)
    }
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