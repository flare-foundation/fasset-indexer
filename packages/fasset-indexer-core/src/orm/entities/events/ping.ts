import { Entity, Property, ManyToOne } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { AgentVault } from '../agent'
import { EvmAddress } from '../evm/address'
import { FAssetEventBound } from './_bound'


@Entity()
export class AgentPing extends FAssetEventBound {

  @ManyToOne(() => AgentVault)
  agentVault!: AgentVault

  @ManyToOne(() => EvmAddress)
  sender!: EvmAddress

  @Property({ type: new uint256() })
  query!: bigint
}

@Entity()
export class AgentPingResponse extends FAssetEventBound {

  @ManyToOne(() => AgentVault)
  agentVault!: AgentVault

  @Property({ type: new uint256() })
  query!: bigint

  @Property({ type: 'text' })
  response!: string
}