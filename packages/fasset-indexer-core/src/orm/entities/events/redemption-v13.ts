import { Entity, ManyToOne, Property } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"
import { EvmAddress } from "../evm/address"
import { FAssetEventBound } from "./_bound"
import { RedemptionRequested } from "./redemption"

@Entity()
export class RedemptionAmountIncomplete extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  redeemer!: EvmAddress

  @Property({ type: new uint256() })
  remainingAmountUBA!: bigint
}

@Entity()
export class RedemptionWithTagRequested extends RedemptionRequested {

  @Property({ type: new uint256() })
  destinationTag!: bigint
}