import { Entity, Property } from "@mikro-orm/core"


@Entity()
export class UnderlyingBlock {

  @Property({ type: 'integer', unique: true, primary: true })
  height!: number

  @Property({ type: 'text', unique: true })
  hash!: string

  @Property({ type: 'integer' })
  timestamp!: number
}