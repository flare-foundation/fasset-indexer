import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'
import { EventBound } from './_bound'


@Entity()
export class PricesPublished extends EventBound {

  @Property({ type: 'number', index: true })
  votingRoundId!: number
}

@Entity()
export class PricePublished {

  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number

  @ManyToOne({ entity: () => PricesPublished })
  pricesPublished!: PricesPublished

  @Property({ type: 'text', index: true })
  symbol!: string

  @Property({ type: 'bigint' })
  price!: bigint

  @Property({ type: 'number' })
  decimals!: number
}