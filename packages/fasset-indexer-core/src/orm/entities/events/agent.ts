import { Entity, OneToOne, Property } from "@mikro-orm/core"
import { uint256, uint64 } from "../../custom/uint"
import { AgentEventBound, FAssetEventBound } from "./_bound"


@Entity()
export class AgentVaultCreated extends AgentEventBound {}

@Entity()
export class AgentVaultDestroyed extends AgentEventBound {}

@Entity()
export class AgentSettingChanged extends AgentEventBound {

  @Property({ type: 'text' })
  name!: string

  @Property({ type: new uint256() })
  value!: bigint
}

@Entity()
export class SelfClose extends AgentEventBound {

  @Property({ type: new uint256() })
  valueUBA!: bigint
}

@Entity()
export class VaultCollateralWithdrawalAnnounced extends AgentEventBound {

  @Property({ type: new uint256() })
  amountWei!: bigint

  @Property({ type: new uint64() })
  allowedAt!: bigint
}

@Entity()
export class PoolTokenRedemptionAnnounced extends AgentEventBound {

  @Property({ type: new uint256() })
  amountWei!: bigint

  @Property({ type: new uint64() })
  allowedAt!: bigint
}

@Entity()
export class UnderlyingWithdrawalAnnounced extends AgentEventBound {

  @Property({ type: new uint64() })
  announcementId!: bigint

  @Property({ type: 'string', index: true })
  paymentReference!: string
}

@Entity()
export class UnderlyingWithdrawalConfirmed extends FAssetEventBound {

  @OneToOne({ entity: () => UnderlyingWithdrawalAnnounced, owner: true })
  underlyingWithdrawalAnnounced!: UnderlyingWithdrawalAnnounced

  @Property({ type: new uint256() })
  spendUBA!: bigint

  @Property({ type: 'string', index: true })
  transactionHash!: string
}

@Entity()
export class UnderlyingWithdrawalCancelled extends FAssetEventBound {

  @OneToOne({ entity: () => UnderlyingWithdrawalAnnounced, owner: true })
  underlyingWithdrawalAnnounced!: UnderlyingWithdrawalAnnounced
}

@Entity()
export class UnderlyingBalanceToppedUp extends AgentEventBound {

  @Property({ type: 'text', index: true })
  transactionHash!: string

  @Property({ type: new uint256() })
  depositedUBA!: bigint
}

@Entity()
export class UnderlyingBalanceChanged extends AgentEventBound {

  @Property({ type: new uint256() })
  balanceUBA!: bigint
}

@Entity()
export class DustChanged extends AgentEventBound {

  @Property({ type: new uint256() })
  dustUBA!: bigint
}