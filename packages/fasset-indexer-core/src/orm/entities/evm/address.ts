import { Entity, PrimaryKey, Property } from "@mikro-orm/core"
import { ADDRESS_LENGTH } from "../../../config/constants"


@Entity()
export class EvmAddress {

  @PrimaryKey({ type: "number", autoincrement: true })
  id!: number

  @Property({ type: 'text', length: ADDRESS_LENGTH, unique: true })
  hex!: string
}