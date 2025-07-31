import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint"


@Entity()
export class UnderlyingAddress {

  @PrimaryKey({ type: "number", autoincrement: true })
  id!: number

  @Property({ type: 'text', unique: true })
  text!: string
}

@Entity()
export class UnderlyingBalance {

  @ManyToOne({ entity: () => UnderlyingAddress, primary: true })
  address!: UnderlyingAddress

  @Property({ type: new uint256() })
  balance!: bigint
}