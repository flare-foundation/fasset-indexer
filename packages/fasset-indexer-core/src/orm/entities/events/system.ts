import { Entity, Property } from "@mikro-orm/core"
import { FAssetEventBound } from "./_bound"


@Entity()
export class CurrentUnderlyingBlockUpdated extends FAssetEventBound {

  @Property({ type: 'number' })
  underlyingBlockNumber!: number

  @Property({ type: 'number' })
  underlyingBlockTimestamp!: number

  @Property({ type: 'number' })
  updatedAt!: number

}