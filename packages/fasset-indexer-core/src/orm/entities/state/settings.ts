import { Entity, Enum, Property } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"
import { FAssetType } from "../../../shared"

@Entity()
export class AssetManagerSettings {

  @Enum({ type: () => FAssetType, primary: true })
  fasset!: FAssetType

  @Property({ type: new uint256() })
  lotSizeAmg!: bigint
}

@Entity()
export class CoreVaultManagerSettings {

  @Enum({ type: () => FAssetType, primary: true })
  fasset!: FAssetType

  @Property({ type: new uint256() })
  escrowAmount!: bigint

  @Property({ type: new uint256() })
  minimalAmount!: bigint

  @Property({ type: 'integer' })
  escrowEndTimeSeconds!: number

  @Property({ type: new uint256() })
  chainPaymentFee!: bigint
}