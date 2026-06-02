import type {
  AgentVaultCreatedEvent as AgentVaultCreatedEventOld,
  CollateralTypeAddedEvent as CollateralTypeAddedOld,
  EmergencyPauseTriggeredEvent as EmergencyPauseTriggeredOld
} from "../../../../chain/typechain/assetManager/IAssetManager__initial"
import type {
  AgentVaultCreatedEvent, CollateralTypeAddedEvent, EmergencyPauseTriggeredEvent
} from "../../../../chain/typechain/assetManager/IAssetManager__latest"


export class AssetManagerEventMigration {

  static migrateAgentVaultCreated(args: AgentVaultCreatedEventOld.OutputTuple): AgentVaultCreatedEvent.OutputTuple {
    const { 0: owner, 1: agentVault } = args
    // The old creationData tuple ends with three fields removed in the
    // new ABI (poolTopupCollateralRatioBIPS, poolTopupTokenPriceFactorBIPS,
    // handshakeType); we read only the prefix.
    const [collateralPool, collateralPoolToken, underlyingAddress, vaultCollateralToken, poolWNatToken,
      feeBIPS, poolFeeShareBIPS, mintingVaultCollateralRatioBIPS, mintingPoolCollateralRatioBIPS,
      buyFAssetByAgentFactorBIPS, poolExitCollateralRatioBIPS
    ] = (args as unknown as { creationData: unknown[] }).creationData
    const creationData = [
      collateralPool, collateralPoolToken, underlyingAddress, vaultCollateralToken, poolWNatToken,
      feeBIPS, poolFeeShareBIPS, mintingVaultCollateralRatioBIPS, mintingPoolCollateralRatioBIPS,
      buyFAssetByAgentFactorBIPS, poolExitCollateralRatioBIPS, BigInt(0)
    ]
    // @ts-expect-error new OutputTuple's shape is opaque to TS through the
    // generated typechain types; the migrated value matches at runtime.
    return { 0: owner, 1: agentVault, creationData }
  }

  static migrateCollateralTypeAdded(args: CollateralTypeAddedOld.OutputTuple): CollateralTypeAddedEvent.OutputTuple {
    // ccbMinCollateralRatioBIPS (position 7 in the old tuple) was removed
    // from the new ABI; the remaining fields are re-emitted in order.
    const [
      collateralClass, token, decimals, directPricePair, assetFtsoSymbol, tokenFtsoSymbol,
      minCollateralRatioBIPS, , safetyMinCollateralRatioBIPS
    ] = args
    return [
      collateralClass, token, decimals, directPricePair, assetFtsoSymbol,
      tokenFtsoSymbol, minCollateralRatioBIPS, safetyMinCollateralRatioBIPS
    ]
  }

  static migrateEmergencyPauseTriggered(args: EmergencyPauseTriggeredOld.OutputTuple): EmergencyPauseTriggeredEvent.OutputTuple {
    return [ BigInt(1), args[0], BigInt(0), BigInt(0) ]
  }
}