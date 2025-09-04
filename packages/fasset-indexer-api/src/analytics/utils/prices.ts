import { FAssetType } from "fasset-indexer-core"
import { CollateralTypeAdded, FtsoPrice } from "fasset-indexer-core/entities"
import { PRICE_FACTOR } from "../../config/constants"
import type { EntityManager } from "fasset-indexer-core/orm"


export class FAssetPriceLoader {
  private cache: Map<FAssetType, [bigint, bigint]> = new Map()

  async getFAssetToUsdPrice(em: EntityManager, fasset: FAssetType): Promise<[mul: bigint, div: bigint]> {
    if (!this.cache.has(fasset)) {
      const price = await this.fassetToUsdPrice(em, fasset)
      this.cache.set(fasset, price)
    }
    return this.cache.get(fasset)
  }

  // doesn't need caching yet
  async fassetToUsd(em: EntityManager, fasset: FAssetType, amount: bigint): Promise<bigint> {
    const [mul, div] = await this.fassetToUsdPrice(em, fasset)
    return PRICE_FACTOR * amount * mul / div
  }

  // doens't need caching yet
  async tokenToUsd(em: EntityManager, address: string, amount: bigint): Promise<bigint> {
    const [mul, div] = await this.tokenToUsdPrice(em, address)
    return PRICE_FACTOR * amount * mul / div
  }

  protected fassetDecimals(fasset: FAssetType): number {
    if (fasset == FAssetType.FXRP) {
      return 6
    } else if (fasset == FAssetType.FBTC) {
      return 8
    } else if (fasset == FAssetType.FDOGE) {
      return 8
    } else if (fasset == FAssetType.FLTC) {
      return 8
    } else if (fasset == FAssetType.FALG) {
      return 6
    } else {
      throw new Error(`Decimals not known for fasset ${FAssetType[fasset]}`)
    }
  }

  protected async fassetToUsdPrice(em: EntityManager, fasset: FAssetType): Promise<[mul: bigint, div: bigint]> {
    if (fasset == FAssetType.FSIMCOINX || fasset == FAssetType.FLTC || fasset == FAssetType.FALG) {
      return [ BigInt(0), BigInt(1) ]
    }
    const fassetToken = await em.findOneOrFail(CollateralTypeAdded, { fasset })
    const fassetPrice = await em.findOneOrFail(FtsoPrice, { symbol: fassetToken.assetFtsoSymbol })
    const fassetTokenDecimals = this.fassetDecimals(fasset)
    return [ fassetPrice.price, BigInt(10) ** BigInt(fassetPrice.decimals + fassetTokenDecimals) ]
  }

  protected async tokenToUsdPrice(em: EntityManager, address: string): Promise<[mul: bigint, div: bigint]> {
    const token = await em.findOneOrFail(CollateralTypeAdded, { address: { hex: address }})
    const price = await em.findOneOrFail(FtsoPrice, { symbol: token.tokenFtsoSymbol })
    return [ price.price, BigInt(10) ** BigInt(price.decimals + token.decimals) ]
  }
}