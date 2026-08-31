import { Entity, ManyToOne, Property, Unique } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"
import { EvmAddress } from "../evm/address"
import { AgentEventBound, FAssetEventBound } from "./_bound"
import { RedemptionRequested } from "./redemption"

@Entity()
export class RedemptionAmountIncomplete extends FAssetEventBound {

  @ManyToOne({ entity: () => EvmAddress })
  redeemer!: EvmAddress

  @Property({ type: new uint256() })
  remainingAmountUBA!: bigint
}

@Entity()
export class RedemptionWithTagRequested extends RedemptionRequested {

  @Property({ type: new uint256() })
  destinationTag!: bigint
}

/**
 * The system redemption fee, subtracted from the redemption value and re-minted to
 * the system fee receiver inside createRedemptionRequest.
 *
 * Deliberately holds requestId as a plain column rather than a relation to
 * RedemptionRequested: the contract emits this event *before* the redemption
 * request event of the same transaction (_mintSystemRedemptionFee runs ahead of
 * _emitRedemptionRequestedEvent), so the referenced row does not exist yet when
 * this log is stored. RedemptionPoolFeeMinted can hold the relation only because
 * it is emitted much later, at redemption confirmation.
 */
@Entity()
@Unique({ properties: ['fasset', 'requestId'] })
export class SystemRedemptionFeePaid extends AgentEventBound {

  @Property({ type: 'number', index: true })
  requestId!: number

  @Property({ type: new uint256() })
  feeUBA!: bigint
}
