import { Entity, Property, ManyToOne } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { EvmAddress } from '../evm/address'
import { AgentEventBound } from './_bound'


@Entity()
export class AgentPing extends AgentEventBound {

  @ManyToOne(() => EvmAddress)
  sender!: EvmAddress

  @Property({ type: new uint256() })
  query!: bigint
}

@Entity()
export class AgentPingResponse extends AgentEventBound {

  @Property({ type: new uint256() })
  query!: bigint

  @Property({ type: 'text' })
  response!: string
}