import { Entity, ManyToOne, Property } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { AgentEventBound } from './_bound'
import { EvmAddress } from '../evm/address'


@Entity()
export class LiquidationStarted extends AgentEventBound {

  @Property({ type: 'number' })
  timestamp!: number
}

@Entity()
export class FullLiquidationStarted extends AgentEventBound {

  @Property({ type: 'number' })
  timestamp!: number
}

@Entity()
export class LiquidationPerformed extends AgentEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  liquidator!: EvmAddress

  @Property({ type: new uint256() })
  valueUBA!: bigint

  @Property({ type: new uint256(), nullable: true })
  paidVaultCollateralWei!: bigint

  @Property({ type: new uint256(), nullable: true })
  paidPoolCollateralWei!: bigint
}

@Entity()
export class LiquidationEnded extends AgentEventBound {}