import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core"
import { UnderlyingBlock } from "./block"
import { uint256 } from "../../custom/uint"


@Entity()
export class UnderlyingTransaction {

  @PrimaryKey({ type: 'integer', autoincrement: true })
  id!: number

  @ManyToOne({ entity: () => UnderlyingBlock })
  block: UnderlyingBlock

  @Property({ type: 'text', unique: true })
  hash: string

  @Property({ type: new uint256() })
  value: bigint

  constructor(block: UnderlyingBlock, hash: string, value: bigint) {
    this.block = block
    this.hash = hash
    this.value = value
  }

}