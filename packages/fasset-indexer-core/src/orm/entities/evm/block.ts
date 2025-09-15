import { Entity, PrimaryKey, Property } from "@mikro-orm/core"


@Entity()
export class EvmBlock {

  @PrimaryKey({ type: "number" })
  index!: number

  @Property({ type: "number", index: true })
  timestamp!: number
}