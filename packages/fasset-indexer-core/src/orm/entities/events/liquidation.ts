import { Entity, ManyToOne, Property } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { FAssetEventBound } from './_bound'
import { AgentVault } from '../agent'
import { EvmAddress } from '../evm/address'
import type { EvmLog } from '../evm/log'
import type { FAssetType } from '../../../shared'


class LiquidationStartedBase extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault: AgentVault

  @Property({ type: 'number' })
  timestamp: number

  constructor(evmLog: EvmLog, fasset: FAssetType, agentVault: AgentVault, timestamp: number) {
    super(evmLog, fasset)
    this.agentVault = agentVault
    this.timestamp = timestamp
  }
}

@Entity()
export class LiquidationStarted extends LiquidationStartedBase { }

@Entity()
export class FullLiquidationStarted extends LiquidationStartedBase { }

@Entity()
export class LiquidationPerformed extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault: AgentVault

  @ManyToOne({ entity: () => EvmAddress })
  liquidator: EvmAddress

  @Property({ type: new uint256() })
  valueUBA: bigint

  @Property({ type: new uint256(), nullable: true })
  paidVaultCollateralWei: bigint

  @Property({ type: new uint256(), nullable: true })
  paidPoolCollateralWei: bigint

  constructor(
    evmLog: EvmLog,
    fasset: FAssetType,
    agentVault: AgentVault,
    liquidator: EvmAddress,
    valueUBA: bigint,
    paidVaultCollateralWei: bigint,
    paidPoolCollateralWei: bigint
  ) {
    super(evmLog, fasset)
    this.agentVault = agentVault
    this.liquidator = liquidator
    this.valueUBA = valueUBA
    this.paidVaultCollateralWei = paidVaultCollateralWei
    this.paidPoolCollateralWei = paidPoolCollateralWei
  }
}

@Entity()
export class LiquidationEnded extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault: AgentVault

  constructor(evmLog: EvmLog, fasset: FAssetType, agentVault: AgentVault) {
    super(evmLog, fasset)
    this.agentVault = agentVault
  }
}