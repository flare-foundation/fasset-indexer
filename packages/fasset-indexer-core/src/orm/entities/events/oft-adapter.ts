import { Entity, Property, ManyToOne } from '@mikro-orm/core'
import { uint256, uint64 } from '../../custom/uint'
import { EvmAddress } from '../evm/address'
import { FAssetEventBound } from './_bound'
import { BYTES32_LENGTH } from '../../../config/constants'


@Entity()
export class OFTReceived extends FAssetEventBound {

  @Property({ type: 'string', length: BYTES32_LENGTH, unique: true })
  guid!: string

  @Property({ type: new uint64() })
  srcEid!: bigint

  @ManyToOne(() => EvmAddress)
  to!: EvmAddress

  @Property({ type: new uint256() })
  amountReceivedLD!: bigint
}


@Entity()
export class OFTSent extends FAssetEventBound {

  @Property({ type: 'string', length: BYTES32_LENGTH, unique: true })
  guid!: string

  @Property({ type: new uint64() })
  dstEid!: bigint

  @ManyToOne(() => EvmAddress)
  from!: EvmAddress

  @Property({ type: new uint256() })
  amountSentLD!: bigint

  @Property({ type: new uint256() })
  amountReceivedLD!: bigint
}