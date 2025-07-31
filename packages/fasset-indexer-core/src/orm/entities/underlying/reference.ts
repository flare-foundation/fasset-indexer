import { Entity, ManyToOne, Property, PrimaryKey, Unique, Enum } from "@mikro-orm/core"
import { UnderlyingBlock } from "./block"
import { UnderlyingAddress } from "../underlying/address"
import { FAssetType } from "../../../shared"
import { UnderlyingTransaction } from "./transaction"


@Entity()
@Unique({ properties: ['fasset', 'block', 'reference', 'transaction'] })
export class UnderlyingReference {

  @PrimaryKey({ autoincrement: true, type: 'integer' })
  id!: number

  @Enum(() => FAssetType)
  fasset!: FAssetType

  @Property({ type: 'text' })
  reference!: string

  @ManyToOne({ entity: () => UnderlyingTransaction })
  transaction!: UnderlyingTransaction

  @ManyToOne(() => UnderlyingAddress)
  address!: UnderlyingAddress

  @ManyToOne(() => UnderlyingBlock)
  block!: UnderlyingBlock
}