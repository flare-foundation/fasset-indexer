import { OneToOne, Enum, ManyToOne } from "@mikro-orm/core"
import { FAssetType } from "../../../shared"
import { EvmLog } from "../evm/log"
import { AgentVault } from "../agent"

export class EventBound {

  @OneToOne({ entity: () => EvmLog, owner: true, primary: true })
  evmLog!: EvmLog
}

export class FAssetEventBound extends EventBound {

  @Enum(() => FAssetType)
  fasset!: FAssetType
}

export class AgentEventBound extends FAssetEventBound {

  @ManyToOne({ entity: () => AgentVault })
  agentVault!: AgentVault
}