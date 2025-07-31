import { Entity, Property, ManyToOne, Unique } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"
import { EvmAddress } from "../evm/address"
import { EventBound, FAssetEventBound } from "./_bound"


@Entity()
@Unique({ properties: ['fasset', 'address'] })
export class CollateralTypeAdded extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  address!: EvmAddress

  @Property({ type: 'number' })
  decimals!: number

  @Property({ type: 'boolean' })
  directPricePair!: boolean

  @Property({ type: 'text' })
  assetFtsoSymbol!: string

  @Property({ type: 'text' })
  tokenFtsoSymbol!: string

  @Property({ type: 'number' })
  collateralClass!: number
}

@Entity()
export class ERC20Transfer extends EventBound {

  @ManyToOne({ entity: () => EvmAddress })
  from!: EvmAddress

  @ManyToOne({ entity: () => EvmAddress })
  to!: EvmAddress

  @Property({ type: new uint256() })
  value!: bigint
}