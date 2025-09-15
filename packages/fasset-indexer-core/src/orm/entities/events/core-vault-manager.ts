import { Entity, ManyToOne, Property, Unique } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"
import { FAssetEventBound } from "./_bound"
import { BYTES32_LENGTH } from "../../../config/constants"
import { UnderlyingAddress } from "../underlying/address"


@Entity()
export class CoreVaultManagerSettingsUpdated extends FAssetEventBound {

  @Property({ type: 'integer' })
  escrowEndTimeSeconds!: number

  @Property({ type: new uint256() })
  escrowAmount!: bigint

  @Property({ type: new uint256() })
  minimalAmount!: bigint

  @Property({ type: new uint256() })
  fee!: bigint
}

@Entity()
export class CoreVaultManagerCustodianAddressUpdated extends FAssetEventBound {

  @ManyToOne({ entity: () => UnderlyingAddress })
  custodian!: UnderlyingAddress
}

@Entity()
@Unique({ properties: ['fasset', 'transactionId'] })
export class CoreVaultManagerPaymentConfirmed extends FAssetEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH, unique: true })
  transactionId!: string

  @Property({ type: 'text', index: true })
  paymentReference!: string

  @Property({ type: new uint256() })
  amount!: bigint
}

@Entity()
export class CoreVaultManagerPaymentInstructions extends FAssetEventBound {

  @Property({ type: new uint256(), index: true })
  sequence!: bigint

  @ManyToOne({ entity: () => UnderlyingAddress })
  account!: UnderlyingAddress

  @ManyToOne({ entity: () => UnderlyingAddress })
  destination!: UnderlyingAddress

  @Property({ type: new uint256() })
  amount!: bigint

  @Property({ type: new uint256() })
  fee!: bigint

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  paymentReference!: string
}

@Entity()
export class CoreVaultManagerEscrowInstructions extends FAssetEventBound {

  @Property({ type: new uint256(), index: true })
  sequence!: bigint

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  preimageHash!: string

  @ManyToOne({ entity: () => UnderlyingAddress })
  account!: UnderlyingAddress

  @ManyToOne({ entity: () => UnderlyingAddress })
  destination!: UnderlyingAddress

  @Property({ type: new uint256() })
  amount!: bigint

  @Property({ type: new uint256() })
  fee!: bigint

  @Property({ type: new uint256() })
  cancelAfterTs!: bigint
}

@Entity()
export class CoreVaultManagerTransferRequested extends FAssetEventBound {

  @ManyToOne({ entity: () => UnderlyingAddress })
  destination!: UnderlyingAddress

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  paymentReference!: string

  @Property({ type: new uint256() })
  amount!: bigint

  @Property({ type: 'boolean' })
  cancelable!: boolean
}

@Entity()
export class CoreVaultManagerTransferRequestCanceled extends FAssetEventBound {

  @ManyToOne({ entity: () => UnderlyingAddress })
  destination!: UnderlyingAddress

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  paymentReference!: string

  @Property({ type: new uint256() })
  amount!: bigint
}

@Entity()
export class CoreVaultManagerNotAllEscrowsProcessed extends FAssetEventBound {}

@Entity()
export class EscrowExpired extends FAssetEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  preimageHash!: string

  @Property({ type: new uint256() })
  amount!: bigint
}

@Entity()
export class EscrowFinished extends FAssetEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  preimageHash!: string

  @Property({ type: new uint256() })
  amount!: bigint
}