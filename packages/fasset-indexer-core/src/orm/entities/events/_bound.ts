import { OneToOne, Enum } from "@mikro-orm/core"
import { FAssetType } from "../../../shared"
import { EvmLog } from "../evm/log"

export class EventBound {

  @OneToOne({ entity: () => EvmLog, owner: true, primary: true })
  evmLog!: EvmLog
}

export class FAssetEventBound extends EventBound {

  @Enum(() => FAssetType)
  fasset!: FAssetType
}