import { Entity, ManyToOne, PrimaryKey, Property, Unique } from "@mikro-orm/core"
import { uint256 } from "../../custom/uint";
import { EvmAddress } from "../evm/address";

@Entity()
@Unique({ properties: ['holder', 'token'] })
export class TokenBalance {

  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number

  @ManyToOne({ entity: () => EvmAddress })
  holder!: EvmAddress

  @ManyToOne({ entity: () => EvmAddress })
  token!: EvmAddress

  @Property({ type: new uint256() })
  amount!: bigint
}