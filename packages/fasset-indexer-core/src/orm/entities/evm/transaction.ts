import { Entity, PrimaryKey, Property, Unique, ManyToOne } from "@mikro-orm/core"
import { EvmAddress } from "./address"
import { EvmBlock } from "./block"
import { BYTES32_LENGTH } from "../../../config/constants"
import { uint256 } from "../../custom/uint"


@Entity()
@Unique({ properties: ['block', 'index'] })
export class EvmTransaction {

  @PrimaryKey({ type: "number", autoincrement: true })
  id!: number

  @Property({ type: "text", length: BYTES32_LENGTH, unique: true })
  hash!: string

  @ManyToOne({ entity: () => EvmBlock })
  block!: EvmBlock

  @Property({ type: "number" })
  index!: number

  @ManyToOne({ entity: () => EvmAddress })
  source!: EvmAddress

  @ManyToOne({ entity: () => EvmAddress, nullable: true })
  target?: EvmAddress

  @Property({ type: new uint256(), nullable: true })
  value!: bigint

  @Property({ type: new uint256(), nullable: true })
  gasUsed!: bigint

  @Property({ type: new uint256(), nullable: true })
  gasPrice!: bigint

  @Property({ type: new uint256(), nullable: true })
  gasLimit!: bigint

  @Property({ type: 'number', nullable: true })
  type!: number

  @Property({ type: 'number', nullable: true })
  nonce!: number
}