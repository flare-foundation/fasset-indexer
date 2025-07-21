import { Entity, Property, ManyToOne, OneToOne } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'
import { AgentVault } from '../agent'
import { CollateralTypeAdded } from '../events/token'


@Entity()
export class AgentVaultSettings {

  @OneToOne({ primary: true, owner: true, entity: () => AgentVault })
  agentVault: AgentVault

  @ManyToOne({ entity: () => CollateralTypeAdded })
  collateralToken: CollateralTypeAdded

  @Property({ type: new uint256() })
  feeBIPS: bigint

  @Property({ type: new uint256() })
  poolFeeShareBIPS: bigint

  @Property({ type: new uint256() })
  mintingVaultCollateralRatioBIPS: bigint

  @Property({ type: new uint256() })
  mintingPoolCollateralRatioBIPS: bigint

  @Property({ type: new uint256() })
  buyFAssetByAgentFactorBIPS: bigint

  @Property({ type: new uint256() })
  poolExitCollateralRatioBIPS: bigint

  @Property({ type: new uint256(), nullable: true })
  redemptionPoolFeeShareBIPS: bigint

  constructor(
    agentVault: AgentVault,
    collateralToken: CollateralTypeAdded,
    feeBIPS: bigint,
    poolFeeShareBIPS: bigint,
    mintingVaultCollateralRatioBIPS: bigint,
    mintingPoolCollateralRatioBIPS: bigint,
    buyFAssetByAgentFactorBIPS: bigint,
    poolExitCollateralRatioBIPS: bigint,
    redemptionPoolFeeShareBIPS: bigint
  ) {
    this.agentVault = agentVault
    this.collateralToken = collateralToken
    this.feeBIPS = feeBIPS
    this.poolFeeShareBIPS = poolFeeShareBIPS
    this.mintingVaultCollateralRatioBIPS = mintingVaultCollateralRatioBIPS
    this.mintingPoolCollateralRatioBIPS = mintingPoolCollateralRatioBIPS
    this.buyFAssetByAgentFactorBIPS = buyFAssetByAgentFactorBIPS
    this.poolExitCollateralRatioBIPS = poolExitCollateralRatioBIPS
    this.redemptionPoolFeeShareBIPS = redemptionPoolFeeShareBIPS
  }
}

@Entity()
export class AgentVaultInfo {

  @OneToOne({ primary: true, owner: true, entity: () => AgentVault })
  agentVault: AgentVault

  @Property({ type: 'number' })
  status: number

  @Property({ type: 'boolean' })
  publiclyAvailable: boolean

  @Property({ type: new uint256() })
  freeCollateralLots: bigint

  @Property({ type: new uint256() })
  totalVaultCollateralWei: bigint

  @Property({ type: new uint256() })
  freeVaultCollateralWei: bigint

  @Property({ type: new uint256() })
  vaultCollateralRatioBIPS: bigint

  @Property({ type: new uint256() })
  totalPoolCollateralNATWei: bigint

  @Property({ type: new uint256() })
  freePoolCollateralNATWei: bigint

  @Property({ type: new uint256() })
  poolCollateralRatioBIPS: bigint

  @Property({ type: new uint256() })
  totalAgentPoolTokensWei: bigint

  @Property({ type: new uint256() })
  freeAgentPoolTokensWei: bigint

  @Property({ type: new uint256() })
  mintedUBA: bigint

  @Property({ type: new uint256() })
  reservedUBA: bigint

  @Property({ type: new uint256() })
  redeemingUBA: bigint

  @Property({ type: new uint256() })
  poolRedeemingUBA: bigint

  @Property({ type: new uint256() })
  dustUBA: bigint

  @Property({ type: "number" })
  liquidationStartTimestamp: number

  @Property({ type: new uint256() })
  maxLiquidationAmountUBA: bigint

  @Property({ type: new uint256() })
  liquidationPaymentFactorVaultBIPS: bigint

  @Property({ type: new uint256() })
  liquidationPaymentFactorPoolBIPS: bigint

  @Property({ type: new uint256() })
  underlyingBalanceUBA: bigint

  @Property({ type: new uint256() })
  requiredUnderlyingBalanceUBA: bigint

  @Property({ type: new uint256() })
  freeUnderlyingBalanceUBA: bigint

  constructor(
    agentVault: AgentVault,
    status: number,
    publiclyAvailable: boolean,
    freeCollateralLots: bigint,
    totalVaultCollateralWei: bigint,
    freeVaultCollateralWei: bigint,
    vaultCollateralRatioBIPS: bigint,
    totalPoolCollateralNATWei: bigint,
    freePoolCollateralNATWei: bigint,
    poolCollateralRatioBIPS: bigint,
    totalAgentPoolTokensWei: bigint,
    freeAgentPoolTokensWei: bigint,
    mintedUBA: bigint,
    reservedUBA: bigint,
    redeemingUBA: bigint,
    poolRedeemingUBA: bigint,
    dustUBA: bigint,
    liquidationStartTimestamp: number,
    maxLiquidationAmountUBA: bigint,
    liquidationPaymentFactorVaultBIPS: bigint,
    liquidationPaymentFactorPoolBIPS: bigint,
    underlyingBalanceUBA: bigint,
    requiredUnderlyingBalanceUBA: bigint,
    freeUnderlyingBalanceUBA: bigint
  ) {
    this.agentVault = agentVault
    this.status = status
    this.publiclyAvailable = publiclyAvailable
    this.freeCollateralLots = freeCollateralLots
    this.totalVaultCollateralWei = totalVaultCollateralWei
    this.freeVaultCollateralWei = freeVaultCollateralWei
    this.vaultCollateralRatioBIPS = vaultCollateralRatioBIPS
    this.totalPoolCollateralNATWei = totalPoolCollateralNATWei
    this.freePoolCollateralNATWei = freePoolCollateralNATWei
    this.poolCollateralRatioBIPS = poolCollateralRatioBIPS
    this.totalAgentPoolTokensWei = totalAgentPoolTokensWei
    this.freeAgentPoolTokensWei = freeAgentPoolTokensWei
    this.mintedUBA = mintedUBA
    this.reservedUBA = reservedUBA
    this.redeemingUBA = redeemingUBA
    this.poolRedeemingUBA = poolRedeemingUBA
    this.dustUBA = dustUBA
    this.liquidationStartTimestamp = liquidationStartTimestamp
    this.maxLiquidationAmountUBA = maxLiquidationAmountUBA
    this.liquidationPaymentFactorVaultBIPS = liquidationPaymentFactorVaultBIPS
    this.liquidationPaymentFactorPoolBIPS = liquidationPaymentFactorPoolBIPS
    this.underlyingBalanceUBA = underlyingBalanceUBA
    this.requiredUnderlyingBalanceUBA = requiredUnderlyingBalanceUBA
    this.freeUnderlyingBalanceUBA = freeUnderlyingBalanceUBA
  }
}