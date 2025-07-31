import { Entity, ManyToOne, Property } from "@mikro-orm/core"
import { FAssetEventBound } from "./_bound"
import { EvmAddress } from "../evm/address"
import { CollateralTypeAdded } from "./token"
import { uint256, uint64 } from "../../custom/uint"


@Entity()
export class CurrentUnderlyingBlockUpdated extends FAssetEventBound {

  @Property({ type: 'number' })
  underlyingBlockNumber!: number

  @Property({ type: 'number' })
  underlyingBlockTimestamp!: number

  @Property({ type: 'number' })
  updatedAt!: number
}

@Entity()
export class ContractChanged extends FAssetEventBound {

  @Property({ type: 'text' })
  name!: string

  @ManyToOne({ entity: () => EvmAddress })
  value!: EvmAddress
}

@Entity()
export class CollateralRatiosChanged extends FAssetEventBound {

  @ManyToOne({ entity: () => CollateralTypeAdded })
  collateralToken!: CollateralTypeAdded

  @Property({ type: new uint64() })
  minCollateralRatioBIPS!: bigint

  @Property({ type: new uint64() })
  safetyMinCollateralRatioBIPS!: bigint
}