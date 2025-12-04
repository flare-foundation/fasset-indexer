import { Entity, ManyToOne, Property } from "@mikro-orm/core"
import { AgentEventBound, EventBound, FAssetEventBound, PersonalAccountEventBound } from "./_bound"
import { EvmAddress } from "../evm/address"
import { uint256 } from "../../custom/uint"
import { BYTES32_LENGTH } from "../../../config/constants"
import { UnderlyingAddress } from "../underlying/address"
import { CollateralReserved } from "./minting"
import { RedemptionRequested } from "./redemption"
import { ERC20Transfer } from "./token"


@Entity()
export class SM_PersonalAccountCreated extends PersonalAccountEventBound { }

@Entity()
export class SM_AgentVaultAdded extends AgentEventBound {

  @Property({ type: 'number' })
  agentVaultId!: number

}

@Entity()
export class SM_AgentVaultRemoved extends AgentEventBound {

  @Property({ type: 'number' })
  agentVaultId!: number
}

@Entity()
export class SM_Approved extends PersonalAccountEventBound {

  @ManyToOne(() => EvmAddress)
  fxrp!: EvmAddress

  @ManyToOne(() => EvmAddress)
  vault!: EvmAddress

  @Property({ type: new uint256() })
  amount!: bigint

}

@Entity()
export class SM_Claimed extends PersonalAccountEventBound {

  @ManyToOne(() => EvmAddress)
  vault!: EvmAddress

  @Property({ type: 'number' })
  year!: number

  @Property({ type: 'number' })
  month!: number

  @Property({ type: 'number' })
  day!: number

  @Property({ type: new uint256() })
  shares!: bigint

  @Property({ type: new uint256() })
  amount!: bigint

}

@Entity()
export class SM_CollateralReserved extends PersonalAccountEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH })
  transactionId!: string

  @Property({ type: 'text', length: BYTES32_LENGTH })
  paymentReference!: string

  @ManyToOne(() => CollateralReserved)
  collateralReserved!: CollateralReserved

  @Property({ type: new uint256() })
  executorFee!: bigint

}

@Entity()
export class SM_DefaultInstructionFeeSet extends FAssetEventBound {

  @Property({ type: new uint256() })
  defaultInstructionFee!: bigint

}

@Entity()
export class SM_Deposited extends PersonalAccountEventBound {

  @ManyToOne(() => EvmAddress)
  vault!: EvmAddress

  @Property({ type: new uint256() })
  amount!: bigint

  @Property({ type: new uint256() })
  shares!: bigint

}

@Entity()
export class SM_ExecutorFeeSet extends FAssetEventBound {

  @Property({ type: new uint256() })
  executorFee!: bigint

}

@Entity()
export class SM_ExecutorSet extends FAssetEventBound {

  @ManyToOne(() => EvmAddress)
  executor!: EvmAddress

}

@Entity()
export class SM_FxrpRedeemed extends PersonalAccountEventBound {

  @ManyToOne(() => RedemptionRequested)
  redemptionRequested!: RedemptionRequested

  @Property({ type: new uint256() })
  executorFee!: bigint

}

@Entity()
export class SM_FxrpTransferred extends PersonalAccountEventBound {

  @ManyToOne(() => ERC20Transfer)
  transfer!: ERC20Transfer

}

@Entity()
export class SM_InstructionExecuted extends PersonalAccountEventBound {

  @Property({ type: 'text', length: BYTES32_LENGTH })
  transactionId!: string

  @Property({ type: 'text', length: BYTES32_LENGTH })
  paymentReference!: string

  @Property({ type: 'number' })
  instructionId!: number

}

@Entity()
export class SM_InstructionFeeRemoved extends FAssetEventBound {

  @Property({ type: 'number' })
  instructionId!: number

}

@Entity()
export class SM_InstructionFeeSet extends FAssetEventBound {

  @Property({ type: 'number' })
  instructionId!: number

  @Property({ type: new uint256() })
  instructionFee!: bigint

}

@Entity()
export class SM_OwnershipTransferred extends FAssetEventBound {

  @ManyToOne(() => EvmAddress)
  previousOwner!: EvmAddress

  @ManyToOne(() => EvmAddress)
  newOwner!: EvmAddress

}

@Entity()
export class SM_PaymentProofValidityDurationSecondsSet extends FAssetEventBound {

  @Property({ type: 'number' })
  paymentProofValidityDurationSeconds!: number

}

@Entity()
export class SM_SwapExecuted extends PersonalAccountEventBound {

  @ManyToOne(() => EvmAddress)
  tokenIn!: EvmAddress

  @ManyToOne(() => EvmAddress)
  tokenOut!: EvmAddress

  @Property({ type: new uint256() })
  amountIn!: bigint

  @Property({ type: new uint256() })
  amountOut!: bigint

}

@Entity()
export class SM_SwapParamsSet extends FAssetEventBound {

  @ManyToOne(() => EvmAddress)
  uniswapV3Router!: EvmAddress

  @ManyToOne(() => EvmAddress)
  usdt0!: EvmAddress

  @Property({ type: 'number' })
  wNatUsdt0PoolFeeTierPPM!: number

  @Property({ type: 'number' })
  usdt0FXrpPoolFeeTierPPM!: number

  @Property({ type: 'number' })
  maxSlippagePPM!: number

}

@Entity()
export class SM_VaultAdded extends FAssetEventBound {

  @Property({ type: 'number' })
  _vaultId!: number

  @ManyToOne(() => EvmAddress)
  vault!: EvmAddress

  @Property({ type: 'number' })
  vaultType!: number

}

@Entity()
export class SM_WithdrawalClaimed extends PersonalAccountEventBound {

  @ManyToOne(() => EvmAddress)
  vault!: EvmAddress

  @Property({ type: new uint256() })
  period!: bigint

  @Property({ type: new uint256() })
  amount!: bigint

}

@Entity()
export class SM_ProviderWalletAdded extends FAssetEventBound {

  @ManyToOne(() => UnderlyingAddress)
  xrplProviderWallet!: UnderlyingAddress

}

@Entity()
export class SM_ProviderWalletRemoved extends FAssetEventBound {

  @ManyToOne(() => UnderlyingAddress)
  xrplProviderWallet!: UnderlyingAddress

}