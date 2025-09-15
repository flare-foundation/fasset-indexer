import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core"
import { UnderlyingBlock } from "./block"
import { uint256 } from "../../custom/uint"
import { UnderlyingAddress } from "./address"


@Entity()
export class UnderlyingTransaction {

  @PrimaryKey({ type: 'integer', autoincrement: true })
  id!: number

  @ManyToOne({ entity: () => UnderlyingBlock })
  block!: UnderlyingBlock

  @Property({ type: 'text', unique: true })
  hash!: string

  @Property({ type: new uint256() })
  value!: bigint

  @ManyToOne({ entity: () => UnderlyingAddress, nullable: true })
  source?: UnderlyingAddress

  @ManyToOne({ entity: () => UnderlyingAddress, nullable: true })
  target?: UnderlyingAddress

  @Property({ type: 'text', index: true, nullable: true })
  result?: string

  @Property({ type: new uint256(), nullable: true })
  fee?: bigint
}