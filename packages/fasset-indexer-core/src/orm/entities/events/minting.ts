import { Entity, Property, ManyToOne, OneToOne, Unique } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { EvmAddress } from '../evm/address'
import { UnderlyingAddress } from '../underlying/address'
import { AgentEventBound, FAssetEventBound } from './_bound'
import { BYTES32_LENGTH } from '../../../config/constants'


@Entity()
@Unique({ properties: ['fasset', 'paymentReference'] })
@Unique({ properties: ['fasset', 'collateralReservationId'] })
export class CollateralReserved extends AgentEventBound {

  @Property({ type: 'number', index: true })
  collateralReservationId!: number

  @ManyToOne({ entity: () => EvmAddress })
  minter!: EvmAddress

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

  @ManyToOne({ entity: () => UnderlyingAddress})
  paymentAddress!: UnderlyingAddress

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  paymentReference!: string

  @ManyToOne({ entity: () => EvmAddress })
  executor!: EvmAddress

  @Property({ type: new uint256() })
  executorFeeNatWei!: bigint
}

@Entity()
export class MintingExecuted extends FAssetEventBound {

  @OneToOne({ entity: () => CollateralReserved, owner: true })
  collateralReserved!: CollateralReserved

  @Property({ type: new uint256() })
  poolFeeUBA!: bigint
}

@Entity()
export class MintingPaymentDefault extends FAssetEventBound {

  @OneToOne({ entity: () => CollateralReserved, owner: true })
  collateralReserved!: CollateralReserved
}

@Entity()
export class CollateralReservationDeleted extends FAssetEventBound {

  @OneToOne({ entity: () => CollateralReserved, owner: true })
  collateralReserved!: CollateralReserved
}

@Entity()
export class SelfMint extends AgentEventBound {

  @Property({ type: 'boolean' })
  mintFromFreeUnderlying!: boolean

  @Property({ type: new uint256() })
  mintedUBA!: bigint

  @Property({ type: new uint256() })
  depositedUBA!: bigint

  @Property({ type: new uint256() })
  poolFeeUBA!: bigint
}