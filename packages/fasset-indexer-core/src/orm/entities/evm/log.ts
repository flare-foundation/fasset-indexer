import { Entity, PrimaryKey, Property, Unique, ManyToOne } from "@mikro-orm/core"
import { EvmBlock } from "./block"
import { EvmAddress } from "./address"
import { EvmTransaction } from "./transaction"


@Entity()
@Unique({ properties: ['block', 'index'] })
export class EvmLog {

  @PrimaryKey({ type: "number", autoincrement: true })
  id!: number

  @Property({ type: "number" })
  index!: number

  @Property({ type: "text" })
  name!: string

  @ManyToOne({ entity: () => EvmAddress })
  address!: EvmAddress

  @ManyToOne({ entity: () => EvmTransaction })
  transaction!: EvmTransaction

  @ManyToOne({ entity: () => EvmBlock })
  block!: EvmBlock
}