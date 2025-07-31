import { Entity, ManyToOne, Property } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { FAssetEventBound } from './_bound'
import { AgentVault } from '../agent'
import { EvmAddress } from '../evm/address'


class LiquidationStartedBase extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: 'number' })
  timestamp!: number
}

@Entity()
export class LiquidationStarted extends LiquidationStartedBase { }

@Entity()
export class FullLiquidationStarted extends LiquidationStartedBase { }

@Entity()
export class LiquidationPerformed extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

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
export class LiquidationEnded extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault
}