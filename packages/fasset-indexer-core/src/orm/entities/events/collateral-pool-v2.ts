import { Entity, ManyToOne, Property } from "@mikro-orm/core"
import { uint256, uint64 } from "../../custom/uint"
import { FAssetType } from "../../../shared"
import { FAssetEventBound } from "./_bound"
import { EvmAddress } from "../evm/address"
import { EvmLog } from "../evm/log"


@Entity()
export class CPClaimedReward extends FAssetEventBound {

  @Property({ type: new uint256() })
  amountNatWei: bigint

  @Property({ type: 'numeric' })
  rewardType: number

  constructor(evmLog: EvmLog, fasset: FAssetType,
    amountNatWei: bigint,
    rewardType: number
  ) {
    super(evmLog, fasset)
    this.amountNatWei = amountNatWei
    this.rewardType = rewardType
  }
}

@Entity()
export class CPEntered extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder: EvmAddress

  @Property({ type: new uint256() })
  amountNatWei: bigint

  @Property({ type: new uint256() })
  receivedTokensWei: bigint

  @Property({ type: new uint64() })
  timelockExpiresAt: bigint

  constructor(evmLog: EvmLog,
    fasset: FAssetType,
    tokenHolder: EvmAddress,
    amountNatWei: bigint,
    receivedTokensWei: bigint,
    timelockExpiresAt: bigint
  ) {
    super(evmLog, fasset)
    this.tokenHolder = tokenHolder
    this.amountNatWei = amountNatWei
    this.receivedTokensWei = receivedTokensWei
    this.timelockExpiresAt = timelockExpiresAt
  }
}

@Entity()
export class CPExited extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder: EvmAddress

  @Property({ type: new uint256() })
  burnedTokensWei: bigint

  @Property({ type: new uint256() })
  receivedNatWei: bigint

  constructor(evmLog: EvmLog, fasset: FAssetType,
    tokenHolder: EvmAddress,
    burnedTokensWei: bigint,
    receivedNatWei: bigint
  ) {
    super(evmLog, fasset)
    this.tokenHolder = tokenHolder
    this.burnedTokensWei = burnedTokensWei
    this.receivedNatWei = receivedNatWei
  }
}

@Entity()
export class CPFeesWithdrawn extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder: EvmAddress

  @Property({ type: new uint256() })
  withdrawnFeesUBA: bigint

  constructor(evmLog: EvmLog, fasset: FAssetType,
    tokenHolder: EvmAddress, withdrawnFeesUBA: bigint
  ) {
    super(evmLog, fasset)
    this.tokenHolder = tokenHolder
    this.withdrawnFeesUBA = withdrawnFeesUBA
  }
}

@Entity()
export class CPFeeDebtChanged extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder: EvmAddress

  @Property({ type: new uint256() })
  newFeeDebtUBA: bigint

  constructor(evmLog: EvmLog, fasset: FAssetType,
    tokenHolder: EvmAddress, newFeeDebtUBA: bigint
  ) {
    super(evmLog, fasset)
    this.tokenHolder = tokenHolder
    this.newFeeDebtUBA = newFeeDebtUBA
  }
}

@Entity()
export class CPFeeDebtPaid extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder: EvmAddress

  @Property({ type: new uint256() })
  paidFeesUBA: bigint

  constructor(evmLog: EvmLog, fasset: FAssetType,
    tokenHolder: EvmAddress, paidFeesUBA: bigint
  ) {
    super(evmLog, fasset)
    this.tokenHolder = tokenHolder
    this.paidFeesUBA = paidFeesUBA
  }
}

@Entity()
export class CPPaidOut extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  recipient: EvmAddress

  @Property({ type: new uint256() })
  paidNatWei: bigint

  @Property({ type: new uint256() })
  burnedTokensWei: bigint

  constructor(evmLog: EvmLog, fasset: FAssetType,
    recipient: EvmAddress,
    paidNatWei: bigint, burnedTokensWei: bigint
  ) {
    super(evmLog, fasset)
    this.recipient = recipient
    this.burnedTokensWei = burnedTokensWei
    this.paidNatWei = paidNatWei
  }
}

@Entity()
export class CPSelfCloseExited extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  tokenHolder: EvmAddress

  @Property({ type: new uint256() })
  burnedTokensWei: bigint

  @Property({ type: new uint256() })
  receivedNatWei: bigint

  @Property({ type: new uint256() })
  closedFAssetsUBA: bigint

  constructor(evmLog: EvmLog,
    fasset: FAssetType,
    tokenHolder: EvmAddress,
    burnedTokensWei: bigint,
    receivedNatWei: bigint,
    closedFAssetsUBA: bigint
  ) {
    super(evmLog, fasset)
    this.tokenHolder = tokenHolder
    this.burnedTokensWei = burnedTokensWei
    this.receivedNatWei = receivedNatWei
    this.closedFAssetsUBA = closedFAssetsUBA
  }

}