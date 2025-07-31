import { Entity, Property, ManyToOne } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"
import { FAssetEventBound } from "./_bound"
import { EvmAddress } from "../evm/address"


@Entity()
export class CollateralPoolEntered extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder!: EvmAddress

  @Property({ type: new uint256() })
  amountNatWei!: bigint

  @Property({ type: new uint256() })
  receivedTokensWei!: bigint

  @Property({ type: new uint256() })
  addedFAssetFeeUBA!: bigint

  @Property({ type: new uint256() })
  newFAssetFeeDebt!: bigint

  @Property({ type: 'number' })
  timelockExpiresAt!: number
}

@Entity()
export class CollateralPoolExited extends FAssetEventBound {
  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder!: EvmAddress

  @Property({ type: new uint256() })
  burnedTokensWei!: bigint

  @Property({ type: new uint256() })
  receivedNatWei!: bigint

  @Property({ type: new uint256() })
  receivedFAssetFeesUBA!: bigint

  @Property({ type: new uint256() })
  closedFAssetsUBA!: bigint

  @Property({ type: new uint256() })
  newFAssetFeeDebt!: bigint
}

@Entity()
export class CollateralPoolPaidOut extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  recipient!: EvmAddress

  @Property({ type: new uint256() })
  paidNatWei!: bigint

  @Property({ type: new uint256() })
  burnedTokensWei!: bigint
}

@Entity()
export class CollateralPoolClaimedReward extends FAssetEventBound {

  @Property({ type: new uint256() })
  amountNatWei!: bigint

  @Property({ type: 'number' })
  rewardType!: number
}