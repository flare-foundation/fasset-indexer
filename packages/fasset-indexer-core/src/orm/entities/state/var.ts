import { Entity, PrimaryKey, Property } from "@mikro-orm/core"


@Entity()
export class Var {

  @PrimaryKey({ type: "text" })
  key!: string

  @Property({ type: "text", nullable: true })
  value?: string
}

@Entity()
export class UntrackedAgentVault {

  @PrimaryKey({ type: "text" })
  address!: string
}