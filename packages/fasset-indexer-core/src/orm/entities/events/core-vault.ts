import { Entity, Enum, ManyToOne, OneToOne, Property, Unique } from "@mikro-orm/core"
import { ReturnFromCoreVaultResolution, TransferToCoreVaultResolution } from "../../../shared"
import { uint256, uint64 } from "../../custom/uint"
import { AgentEventBound, FAssetEventBound } from "./_bound"
import { EvmAddress } from "../evm/address"
import { UnderlyingAddress } from "../underlying/address"
import { BYTES32_LENGTH } from "../../../config/constants"


@Entity()
@Unique({ properties: ['fasset', 'transferRedemptionRequestId'] })
export class TransferToCoreVaultStarted extends AgentEventBound {

  @Property({ type: 'number', index: true })
  transferRedemptionRequestId!: number

  @Property({ type: new uint64() })
  valueUBA!: bigint

  @Enum({ type: () => TransferToCoreVaultResolution, index: true, nullable: true})
  resolution!: TransferToCoreVaultResolution
}

@Entity()
export class TransferToCoreVaultDefaulted extends FAssetEventBound {

  @OneToOne({ entity: () => TransferToCoreVaultStarted, owner: true })
  transferToCoreVaultStarted!: TransferToCoreVaultStarted

  @Property({ type: new uint256() })
  remintedUBA!: bigint
}

@Entity()
export class TransferToCoreVaultSuccessful extends FAssetEventBound {

  @OneToOne({ entity: () => TransferToCoreVaultStarted, owner: true })
  transferToCoreVaultStarted!: TransferToCoreVaultStarted

  @Property({ type: new uint256() })
  valueUBA!: bigint
}

@Entity()
@Unique({ properties: ['fasset', 'requestId'] })
export class ReturnFromCoreVaultRequested extends AgentEventBound {

  @Property({ type: 'number', index: true })
  requestId!: number

  @Property({ type: 'text', length: BYTES32_LENGTH, index: true })
  paymentReference!: string

  @Property({ type: new uint256() })
  valueUBA!: bigint

  @Enum({ type: () => ReturnFromCoreVaultResolution, index: true, nullable: true })
  resolution!: ReturnFromCoreVaultResolution
}

@Entity()
export class ReturnFromCoreVaultCancelled extends FAssetEventBound {

  @OneToOne({ entity: () => ReturnFromCoreVaultRequested, owner: true })
  returnFromCoreVaultRequested!: ReturnFromCoreVaultRequested
}

@Entity()
export class ReturnFromCoreVaultConfirmed extends FAssetEventBound {

  @OneToOne({ entity: () => ReturnFromCoreVaultRequested, owner: true })
  returnFromCoreVaultRequested!: ReturnFromCoreVaultRequested

  @Property({ type: new uint256() })
  receivedUnderlyingUBA!: bigint

  @Property({ type: new uint256() })
  remintedUBA!: bigint
}

@Entity()
export class CoreVaultRedemptionRequested extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  redeemer!: EvmAddress

  @ManyToOne({ entity: () => UnderlyingAddress })
  paymentAddress!: UnderlyingAddress

  @Property({ type: 'text', length: BYTES32_LENGTH, nullable: true, index: true })
  paymentReference!: string

  @Property({ type: new uint256() })
  valueUBA!: bigint

  @Property({ type: new uint256() })
  feeUBA!: bigint
}
