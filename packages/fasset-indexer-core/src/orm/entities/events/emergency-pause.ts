import { Entity, Property } from "@mikro-orm/core"
import { FAssetEventBound } from "./_bound"
import { uint64 } from "../../custom/uint"


@Entity()
export class EmergencyPauseTriggered extends FAssetEventBound {

  @Property({ type: 'int8', nullable: true })
  externalLevel!: number

  @Property({ type: 'int8', nullable: true })
  governanceLevel!: number

  @Property({ type: new uint64(), nullable: true })
  externalPausedUntil!: bigint

  @Property({ type: new uint64(), nullable: true })
  governancePausedUntil!: bigint
}

@Entity()
export class EmergencyPauseCancelled extends FAssetEventBound {}