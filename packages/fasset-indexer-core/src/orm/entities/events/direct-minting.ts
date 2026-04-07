import { Entity, Property, ManyToOne } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { EvmAddress } from '../evm/address'
import { UnderlyingAddress } from '../underlying/address'
import { FAssetEventBound } from './_bound'
import { BYTES32_LENGTH } from '../../../config/constants'


@Entity()
export class DirectMintingExecuted extends FAssetEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  transactionId!: string

  @ManyToOne({ entity: () => EvmAddress })
  targetAddress!: EvmAddress

  @ManyToOne({ entity: () => EvmAddress })
  executor!: EvmAddress

  @Property({ type: new uint256() })
  mintedAmountUBA!: bigint

  @Property({ type: new uint256() })
  mintingFeeUBA!: bigint

  @Property({ type: new uint256() })
  executorFeeUBA!: bigint
}

@Entity()
export class DirectMintingExecutedToSmartAccount extends FAssetEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  transactionId!: string

  @ManyToOne({ entity: () => UnderlyingAddress })
  sourceAddress!: UnderlyingAddress

  @ManyToOne({ entity: () => EvmAddress })
  executor!: EvmAddress

  @Property({ type: new uint256() })
  mintedAmountUBA!: bigint

  @Property({ type: new uint256() })
  mintingFeeUBA!: bigint

  @Property({ type: 'text' })
  memoData!: string
}

@Entity()
export class DirectMintingPaymentTooSmallForFee extends FAssetEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  transactionId!: string

  @Property({ type: new uint256() })
  receivedAmountUBA!: bigint

  @Property({ type: new uint256() })
  minimumMintingFeeUBA!: bigint
}

@Entity()
export class DirectMintingDelayed extends FAssetEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  transactionId!: string

  @Property({ type: new uint256() })
  amount!: bigint

  @Property({ type: new uint256() })
  executionAllowedAt!: bigint
}

@Entity()
export class LargeDirectMintingDelayed extends FAssetEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  transactionId!: string

  @Property({ type: new uint256() })
  amount!: bigint

  @Property({ type: new uint256() })
  executionAllowedAt!: bigint
}

@Entity()
export class DirectMintingsUnblocked extends FAssetEventBound {

  @Property({ type: new uint256() })
  startedUntilTimestamp!: bigint
}
