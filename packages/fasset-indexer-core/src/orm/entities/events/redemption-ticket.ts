import { Entity, ManyToOne, OneToOne, Property, Unique } from "@mikro-orm/core"
import { uint256, uint64 } from "../../custom/uint"
import { AgentVault } from "../agent"
import { FAssetEventBound } from "./_bound"


@Entity()
@Unique({ properties: ['fasset', 'redemptionTicketId'] })
export class RedemptionTicketCreated extends FAssetEventBound {

  @ManyToOne(() => AgentVault)
  agentVault!: AgentVault

  @Property({ type: new uint64() })
  redemptionTicketId!: bigint

  @Property({ type: new uint256() })
  ticketValueUBA!: bigint
}

@Entity()
export class RedemptionTicketUpdated extends FAssetEventBound {

  @ManyToOne(() => RedemptionTicketCreated)
  redemptionTicketCreated!: RedemptionTicketCreated

  @Property({ type: new uint256() })
  ticketValueUBA!: bigint
}

@Entity()
export class RedemptionTicketDeleted extends FAssetEventBound {

  @OneToOne(() => RedemptionTicketCreated, { owner: true })
  redemptionTicketCreated!: RedemptionTicketCreated
}