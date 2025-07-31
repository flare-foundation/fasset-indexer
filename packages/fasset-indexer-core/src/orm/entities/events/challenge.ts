import { Entity, ManyToOne, Property } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { FAssetEventBound } from './_bound'
import { AgentVault } from '../agent'
import { BYTES32_LENGTH } from '../../../config/constants'


@Entity()
export class IllegalPaymentConfirmed extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: "text", length: BYTES32_LENGTH, unique: true })
  transactionHash!: string
}

@Entity()
export class DuplicatePaymentConfirmed extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: "text", length: BYTES32_LENGTH, unique: true })
  transactionHash1!: string

  @Property({ type: "text", length: BYTES32_LENGTH, unique: true })
  transactionHash2!: string
}

@Entity()
export class UnderlyingBalanceTooLow extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: new uint256() })
  balance!: bigint

  @Property({ type: new uint256() })
  requiredBalance!: bigint
}