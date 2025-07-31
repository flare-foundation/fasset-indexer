import { Cascade, Collection, Entity, OneToMany, OneToOne, ManyToOne, PrimaryKey, Property, Enum } from "@mikro-orm/core"
import { EvmAddress } from "./evm/address"
import { UnderlyingAddress } from "./underlying/address"
import { FAssetType } from "../../shared"


@Entity()
export class AgentManager {

  @OneToOne({ entity: () => EvmAddress, owner: true, primary: true })
  address!: EvmAddress

  @Property({ type: 'text', nullable: true})
  name?: string

  @Property({ type: 'text', nullable: true })
  description?: string

  @Property({ type: 'text', nullable: true })
  iconUrl?: string

  @OneToMany(() => AgentOwner, vault => vault.manager, { cascade: [Cascade.ALL] })
  agents = new Collection<AgentOwner>(this)
}

@Entity()
export class AgentOwner {

  @PrimaryKey({ type: "number", autoincrement: true })
  id!: number

  @ManyToOne(() => EvmAddress)
  address!: EvmAddress

  @ManyToOne(() => AgentManager, { fieldName: 'agents' })
  manager!: AgentManager

  @OneToMany(() => AgentVault, vault => vault.owner, { cascade: [Cascade.ALL] })
  vaults = new Collection<AgentVault>(this)
}

@Entity()
export class AgentVault {

  @Enum(() => FAssetType)
  fasset!: FAssetType

  @OneToOne({ entity: () => EvmAddress, owner: true, primary: true })
  address!: EvmAddress

  @OneToOne({ entity: () => UnderlyingAddress, owner: true })
  underlyingAddress!: UnderlyingAddress

  @ManyToOne({ entity: () => EvmAddress, unique: true })
  collateralPool!: EvmAddress

  @ManyToOne({ entity: () => EvmAddress, unique: true, nullable: true })
  collateralPoolToken!: EvmAddress

  @Property({ type: 'text', nullable: true })
  collateralPoolTokenSymbol?: string

  @ManyToOne(() => AgentOwner, { fieldName: 'vaults' })
  owner!: AgentOwner

  @Property({ type: 'boolean' })
  destroyed!: boolean
}