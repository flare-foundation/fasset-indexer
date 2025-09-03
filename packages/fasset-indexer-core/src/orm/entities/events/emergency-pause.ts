import { Entity, Property } from "@mikro-orm/core"
import { FAssetEventBound } from "./_bound"
import { uint64 } from "../../custom/uint"


@Entity()
export class EmergencyPauseTriggered extends FAssetEventBound {

  @Property({ type: 'int8', nullable: true })
  level!: number

  @Property({ type: new uint64() })
  pausedUntil!: bigint
}

@Entity()
export class EmergencyPauseCancelled extends FAssetEventBound {}

@Entity()
export class EmergencyPauseTransfersTriggered extends FAssetEventBound {

  @Property({ type: new uint64() })
  pausedUntil!: bigint
}

@Entity()
export class EmergencyPauseTransfersCancelled extends FAssetEventBound {}