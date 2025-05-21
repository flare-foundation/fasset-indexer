import { Entity, Enum, ManyToMany, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core"
import { AddressType } from "../../interface"
import { uint256 } from "../../custom/uint"


@Entity()
export class UnderlyingAddress {

  @PrimaryKey({ type: "number", autoincrement: true })
  id!: number

  @Property({ type: 'text', unique: true })
  text: string

  @Enum(() => AddressType)
  type: AddressType

  constructor(text: string, type: AddressType) {
    this.text = text
    this.type = type
  }
}

@Entity()
export class UnderlyingBalance {

  @ManyToOne({ entity: () => UnderlyingAddress, primary: true })
  address: UnderlyingAddress

  @Property({ type: new uint256() })
  balance: bigint

  constructor(address: UnderlyingAddress, balance: bigint) {
    this.address = address
    this.balance = balance
  }
}