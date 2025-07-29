import type {
  AgentVaultCreatedEvent as AgentVaultCreatedEventOld,
  CollateralTypeAddedEvent as CollateralTypeAddedOld
 } from "../../../../chain/typechain/IAssetManagerPreUpgrade"
import type {
  AgentVaultCreatedEvent, CollateralTypeAddedEvent
} from "../../../../chain/typechain/IAssetManager"


export class AssetManagerEventMigration {

  static migrateAgentVaultCreated(args: AgentVaultCreatedEventOld.OutputTuple): AgentVaultCreatedEvent.OutputTuple {
    const { 0: owner, 1: agentVault } = args
    const [ collateralPool, collateralPoolToken, underlyingAddress, vaultCollateralToken, poolWNatToken,
      feeBIPS, poolFeeShareBIPS, mintingVaultCollateralRatioBIPS, mintingPoolCollateralRatioBIPS,
      buyFAssetByAgentFactorBIPS, poolExitCollateralRatioBIPS,
      poolTopupCollateralRatioBIPS, poolTopupTokenPriceFactorBIPS, handshakeType // deprecated
    ] = (args as any).creationData
    const creationData = [
      collateralPool, collateralPoolToken, underlyingAddress, vaultCollateralToken, poolWNatToken,
      feeBIPS, poolFeeShareBIPS, mintingVaultCollateralRatioBIPS, mintingPoolCollateralRatioBIPS,
      buyFAssetByAgentFactorBIPS, poolExitCollateralRatioBIPS, BigInt(0)
    ]
    // @ts-ignore
    return { 0: owner, 1: agentVault, creationData }
  }

  static migrateCollateralTypeAdded(args: CollateralTypeAddedOld.OutputTuple): CollateralTypeAddedEvent.OutputTuple {
    const [
      collateralClass, token, decimals, directPricePair, assetFtsoSymbol, tokenFtsoSymbol,
      minCollateralRatioBIPS, ccbMinCollateralRatioBIPS, safetyMinCollateralRatioBIPS
    ] = args
    return [
      collateralClass, token, decimals, directPricePair, assetFtsoSymbol,
      tokenFtsoSymbol, minCollateralRatioBIPS, safetyMinCollateralRatioBIPS
    ]
  }
}