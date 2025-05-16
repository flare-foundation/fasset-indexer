import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core"
import { UnderlyingBlock } from "./block"
import { uint256 } from "../../custom/uint"
import { UnderlyingAddress } from "./address"


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

  @ManyToOne({ entity: () => UnderlyingAddress, nullable: true })
  source?: UnderlyingAddress

  @ManyToOne({ entity: () => UnderlyingAddress, nullable: true })
  target?: UnderlyingAddress

  constructor(block: UnderlyingBlock, hash: string, value: bigint, source?: UnderlyingAddress, target?: UnderlyingAddress) {
    this.block = block
    this.hash = hash
    this.value = value
    this.source = source
    this.target = target
  }

}