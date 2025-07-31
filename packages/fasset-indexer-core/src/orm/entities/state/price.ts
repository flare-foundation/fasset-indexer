import { Entity, Property, PrimaryKey } from '@mikro-orm/core'
import { uint256 } from '../../custom/uint'


@Entity()
export class FtsoPrice {

  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number

  @Property({ type: 'text', unique: true })
  symbol!: string

  @Property({ type: new uint256() })
  price!: bigint

  @Property({ type: 'number' })
  decimals!: number

  @Property({ type: 'number' })
  timestamp!: number
}