import { Entity, ManyToOne, Property, OneToOne, Unique } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"
import { EvmAddress } from "../evm/address"
import { UnderlyingAddress } from "../underlying/address"
import { AgentEventBound, FAssetEventBound } from "./_bound"
import { BYTES32_LENGTH } from "../../../config/constants"


@Entity()
@Unique({ properties: ['fasset', 'requestId'] })
@Unique({ properties: ['fasset', 'paymentReference'] })
export class RedemptionRequested extends AgentEventBound {

  @Property({ type: 'number', index: true })
  requestId!: number

  @ManyToOne({ entity: () => EvmAddress })
  redeemer!: EvmAddress

  @ManyToOne({ entity: () => UnderlyingAddress })
  paymentAddress!: UnderlyingAddress

  @Property({ type: new uint256() })
  valueUBA!: bigint

  @Property({ type: new uint256() })
  feeUBA!: bigint

  @Property({ type: 'number' })
  firstUnderlyingBlock!: number

  @Property({ type: 'number' })
  lastUnderlyingBlock!: number

  @Property({ type: 'number' })
  lastUnderlyingTimestamp!: number

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  paymentReference!: string

  @ManyToOne({ entity: () => EvmAddress })
  executor!: EvmAddress

  @Property({ type: new uint256() })
  executorFeeNatWei!: bigint
}

@Entity()
export class RedemptionPerformed extends FAssetEventBound {

  @OneToOne({ entity: () => RedemptionRequested, owner: true })
  redemptionRequested!: RedemptionRequested

  @Property({ type: 'text', length: BYTES32_LENGTH, unique: true })
  transactionHash!: string

  @Property({ type: new uint256() })
  spentUnderlyingUBA!: bigint
}

@Entity()
export class RedemptionDefault extends FAssetEventBound {

  @OneToOne({ entity: () => RedemptionRequested, owner: true })
  redemptionRequested!: RedemptionRequested

  @Property({ type: new uint256() })
  redeemedVaultCollateralWei!: bigint

  @Property({ type: new uint256() })
  redeemedPoolCollateralWei!: bigint
}

@Entity()
export class RedemptionRejected extends FAssetEventBound {

  @OneToOne({ entity: () => RedemptionRequested, owner: true })
  redemptionRequested!: RedemptionRequested
}

@Entity()
export class RedemptionPaymentBlocked extends FAssetEventBound {

  @OneToOne({ entity: () => RedemptionRequested, owner: true })
  redemptionRequested!: RedemptionRequested

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  transactionHash!: string

  @Property({ type: new uint256() })
  spentUnderlyingUBA!: bigint
}

@Entity()
export class RedemptionPaymentFailed extends FAssetEventBound {

  @OneToOne({ entity: () => RedemptionRequested, owner: true })
  redemptionRequested!: RedemptionRequested

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  transactionHash!: string

  @Property({ type: new uint256() })
  spentUnderlyingUBA!: bigint

  @Property({ type: 'text', index: true })
  failureReason!: string
}

@Entity()
export class RedemptionRequestIncomplete extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  redeemer!: EvmAddress

  @Property({ type: new uint256() })
  remainingLots!: bigint
}

@Entity()
export class RedemptionPoolFeeMinted extends FAssetEventBound {

  @OneToOne({ entity: () => RedemptionRequested, owner: true })
  redemptionRequested!: RedemptionRequested

  @Property({ type: new uint256() })
  poolFeeUBA!: bigint
}

@Entity()
export class RedeemedInCollateral extends AgentEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  redeemer!: EvmAddress

  @Property({ type: new uint256() })
  redemptionAmountUBA!: bigint

  @Property({ type: new uint256() })
  paidVaultCollateralWei!: bigint
}