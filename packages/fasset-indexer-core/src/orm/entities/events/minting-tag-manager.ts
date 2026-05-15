import { Entity, ManyToOne, Property } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { EvmAddress } from '../evm/address'
import { EventBound } from './_bound'


@Entity()
export class MintingTagReserved extends EventBound {

  @Property({ type: new uint256(), index: true })
  tag!: bigint

  @ManyToOne(() => EvmAddress)
  owner!: EvmAddress
}


@Entity()
export class MintingTagRecipientChanged extends EventBound {

  @Property({ type: new uint256(), index: true })
  tag!: bigint

  @ManyToOne(() => EvmAddress)
  recipient!: EvmAddress
}


@Entity()
export class MintingTagAllowedExecutorChangePending extends EventBound {

  @Property({ type: new uint256(), index: true })
  tag!: bigint

  @ManyToOne(() => EvmAddress)
  executor!: EvmAddress

  @Property({ type: new uint256() })
  activeAfterTs!: bigint
}


@Entity()
export class MintingTagReservationFeeChanged extends EventBound {

  @Property({ type: new uint256() })
  reservationFee!: bigint

  @ManyToOne(() => EvmAddress)
  recipient!: EvmAddress
}
