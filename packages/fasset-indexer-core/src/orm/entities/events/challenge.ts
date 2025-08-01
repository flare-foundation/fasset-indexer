import { Entity, Property } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { AgentEventBound } from './_bound'
import { BYTES32_LENGTH } from '../../../config/constants'


@Entity()
export class IllegalPaymentConfirmed extends AgentEventBound {

  @Property({ type: "text", length: BYTES32_LENGTH, unique: true })
  transactionHash!: string
}

@Entity()
export class DuplicatePaymentConfirmed extends AgentEventBound {

  @Property({ type: "text", length: BYTES32_LENGTH, unique: true })
  transactionHash1!: string

  @Property({ type: "text", length: BYTES32_LENGTH, unique: true })
  transactionHash2!: string
}

@Entity()
export class UnderlyingBalanceTooLow extends AgentEventBound {

  @Property({ type: new uint256() })
  balance!: bigint

  @Property({ type: new uint256() })
  requiredBalance!: bigint
}