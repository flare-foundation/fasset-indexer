import { Entity, Enum, ManyToOne } from "@mikro-orm/knex"
import { FAssetType } from "../../shared"
import { EvmAddress } from "./evm/address"
import { UnderlyingAddress } from "./underlying/address"


@Entity()
export class PersonalAccount {

  @Enum(() => FAssetType)
  fasset!: FAssetType

  @ManyToOne(() => EvmAddress, { primary: true })
  address!: EvmAddress

  @ManyToOne(() => UnderlyingAddress, { unique: true })
  underlyingAddress!: UnderlyingAddress
}