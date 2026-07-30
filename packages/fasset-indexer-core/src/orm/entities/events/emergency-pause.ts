import { Entity, Property } from "@mikro-orm/core"
import { FAssetEventBound } from "./_bound"
import { uint64 } from "../../custom/uint"


@Entity()
export class EmergencyPauseTriggered extends FAssetEventBound {

  // 'int8' is postgres for a 64-bit integer, not an 8-bit one, so these came back
  // as bigint and broke JSON serialisation of the visualiser response. Pause
  // levels are small, and the storer already writes them through Number().
  @Property({ type: 'number', nullable: true })
  externalLevel!: number

  @Property({ type: 'number', nullable: true })
  governanceLevel!: number

  @Property({ type: new uint64(), nullable: true })
  externalPausedUntil!: bigint

  @Property({ type: new uint64(), nullable: true })
  governancePausedUntil!: bigint
}

@Entity()
export class EmergencyPauseCancelled extends FAssetEventBound {}