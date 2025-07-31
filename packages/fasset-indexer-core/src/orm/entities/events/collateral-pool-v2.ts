import { Entity, ManyToOne, Property } from "@mikro-orm/core"
import { uint256, uint64 } from "../../custom/uint"
import { FAssetEventBound } from "./_bound"
import { EvmAddress } from "../evm/address"


@Entity()
export class CPClaimedReward extends FAssetEventBound {

  @Property({ type: new uint256() })
  amountNatWei!: bigint

  @Property({ type: 'numeric' })
  rewardType!: number
}

@Entity()
export class CPEntered extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder!: EvmAddress

  @Property({ type: new uint256() })
  amountNatWei!: bigint

  @Property({ type: new uint256() })
  receivedTokensWei!: bigint

  @Property({ type: new uint64() })
  timelockExpiresAt!: bigint
}

@Entity()
export class CPExited extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder!: EvmAddress

  @Property({ type: new uint256() })
  burnedTokensWei!: bigint

  @Property({ type: new uint256() })
  receivedNatWei!: bigint
}

@Entity()
export class CPFeesWithdrawn extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder!: EvmAddress

  @Property({ type: new uint256() })
  withdrawnFeesUBA!: bigint
}

@Entity()
export class CPFeeDebtChanged extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder!: EvmAddress

  @Property({ type: new uint256() })
  newFeeDebtUBA!: bigint
}

@Entity()
export class CPFeeDebtPaid extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder!: EvmAddress

  @Property({ type: new uint256() })
  paidFeesUBA!: bigint
}

@Entity()
export class CPPaidOut extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  recipient!: EvmAddress

  @Property({ type: new uint256() })
  paidNatWei!: bigint

  @Property({ type: new uint256() })
  burnedTokensWei!: bigint
}

@Entity()
export class CPSelfCloseExited extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder!: EvmAddress

  @Property({ type: new uint256() })
  burnedTokensWei!: bigint

  @Property({ type: new uint256() })
  receivedNatWei!: bigint

  @Property({ type: new uint256() })
  closedFAssetsUBA!: bigint

}