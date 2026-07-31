import { Entity, PrimaryKey, Property, Unique, ManyToOne, BigIntType } from "@mikro-orm/core"
import { EvmBlock } from "./block"
import { EvmAddress } from "./address"
import { EvmTransaction } from "./transaction"


@Entity()
// Redundant with the encoded primary key, since the id is a bijection of
// (block, index) -- kept as an independent check that the encoding is sound.
@Unique({ properties: ['block', 'index'] })
export class EvmLog {

  // Assigned, not autoincremented: the id encodes the log's chain position via
  // evmLogId(), so that ordering by id is ordering by position. int8 is required
  // -- encoded ids reach ~7e13, far past the int4 the sequence used to fit in.
  // 'number' mode is safe here because the encoding stays inside
  // Number.MAX_SAFE_INTEGER by ~130x at the current chain head.
  @PrimaryKey({ type: new BigIntType('number'), autoincrement: false })
  id!: number

  @Property({ type: "number", index: true })
  index!: number

  @Property({ type: "text" })
  name!: string

  @ManyToOne({ entity: () => EvmAddress })
  address!: EvmAddress

  @ManyToOne({ entity: () => EvmTransaction, index: true })
  transaction!: EvmTransaction

  @ManyToOne({ entity: () => EvmBlock })
  block!: EvmBlock
}