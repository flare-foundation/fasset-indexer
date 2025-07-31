import { Entity, ManyToOne, OneToOne, Property } from "@mikro-orm/core"
import { uint256, uint64 } from "../../custom/uint"
import { FAssetEventBound } from "./_bound"
import { AgentVault } from "../agent"


@Entity()
export class AgentVaultCreated extends FAssetEventBound {

  @OneToOne({ entity: () => AgentVault, owner: true })
  agentVault!: AgentVault
}

@Entity()
export class AgentSettingChanged extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: 'text' })
  name!: string

  @Property({ type: new uint256() })
  value!: bigint
}

@Entity()
export class SelfClose extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: new uint256() })
  valueUBA!: bigint
}

@Entity()
export class VaultCollateralWithdrawalAnnounced extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: new uint256() })
  amountWei!: bigint

  @Property({ type: new uint64() })
  allowedAt!: bigint
}

@Entity()
export class PoolTokenRedemptionAnnounced extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: new uint256() })
  amountWei!: bigint

  @Property({ type: new uint64() })
  allowedAt!: bigint
}

@Entity()
export class UnderlyingWithdrawalAnnounced extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: new uint64() })
  announcementId!: bigint

  @Property({ type: 'string' })
  paymentReference!: string
}

@Entity()
export class UnderlyingWithdrawalConfirmed extends FAssetEventBound {

  @OneToOne({ entity: () => UnderlyingWithdrawalAnnounced })
  underlyingWithdrawalAnnounced!: UnderlyingWithdrawalAnnounced

  @Property({ type: new uint256() })
  spendUBA!: bigint

  @Property({ type: 'string' })
  transactionHash!: string
}