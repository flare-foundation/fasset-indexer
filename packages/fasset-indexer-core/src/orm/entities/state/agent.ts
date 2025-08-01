import { Entity, Property, ManyToOne, OneToOne } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { AgentVault } from '../agent'
import { CollateralTypeAdded } from '../events/token'


@Entity()
export class AgentVaultSettings {

  @OneToOne({ primary: true, owner: true, entity: () => AgentVault })
  agentVault!: AgentVault

  @ManyToOne({ entity: () => CollateralTypeAdded })
  collateralToken!: CollateralTypeAdded

  @Property({ type: new uint256() })
  feeBIPS!: bigint

  @Property({ type: new uint256() })
  poolFeeShareBIPS!: bigint

  @Property({ type: new uint256() })
  mintingVaultCollateralRatioBIPS!: bigint

  @Property({ type: new uint256() })
  mintingPoolCollateralRatioBIPS!: bigint

  @Property({ type: new uint256() })
  buyFAssetByAgentFactorBIPS!: bigint

  @Property({ type: new uint256() })
  poolExitCollateralRatioBIPS!: bigint

  @Property({ type: new uint256(), nullable: true })
  poolTopupCollateralRatioBIPS?: bigint

  @Property({ type: new uint256(), nullable: true })
  poolTopupTokenPriceFactorBIPS?: bigint

  @Property({ type: new uint256(), nullable: true })
  redemptionPoolFeeShareBIPS!: bigint
}

@Entity()
export class AgentVaultInfo {

  @OneToOne({ primary: true, owner: true, entity: () => AgentVault })
  agentVault!: AgentVault

  @Property({ type: 'number' })
  status!: number

  @Property({ type: 'boolean' })
  publiclyAvailable!: boolean

  @Property({ type: new uint256() })
  freeCollateralLots!: bigint

  @Property({ type: new uint256() })
  totalVaultCollateralWei!: bigint

  @Property({ type: new uint256() })
  freeVaultCollateralWei!: bigint

  @Property({ type: new uint256() })
  vaultCollateralRatioBIPS!: bigint

  @Property({ type: new uint256() })
  totalPoolCollateralNATWei!: bigint

  @Property({ type: new uint256() })
  freePoolCollateralNATWei!: bigint

  @Property({ type: new uint256() })
  poolCollateralRatioBIPS!: bigint

  @Property({ type: new uint256() })
  totalAgentPoolTokensWei!: bigint

  @Property({ type: new uint256() })
  freeAgentPoolTokensWei!: bigint

  @Property({ type: new uint256() })
  mintedUBA!: bigint

  @Property({ type: new uint256() })
  reservedUBA!: bigint

  @Property({ type: new uint256() })
  redeemingUBA!: bigint

  @Property({ type: new uint256() })
  poolRedeemingUBA!: bigint

  @Property({ type: new uint256() })
  dustUBA!: bigint

  @Property({ type: "number", nullable: true })
  ccbStartTimestamp?: number

  @Property({ type: "number" })
  liquidationStartTimestamp!: number

  @Property({ type: new uint256() })
  maxLiquidationAmountUBA!: bigint

  @Property({ type: new uint256() })
  liquidationPaymentFactorVaultBIPS!: bigint

  @Property({ type: new uint256() })
  liquidationPaymentFactorPoolBIPS!: bigint

  @Property({ type: new uint256() })
  underlyingBalanceUBA!: bigint

  @Property({ type: new uint256() })
  requiredUnderlyingBalanceUBA!: bigint

  @Property({ type: new uint256() })
  freeUnderlyingBalanceUBA!: bigint
}