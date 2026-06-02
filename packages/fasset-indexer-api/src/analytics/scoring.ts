import { FullLiquidationStarted } from "fasset-indexer-core/entities"
import { AgentStatistics } from "./statistics"
import { MAX_BIPS } from "../config/constants"
import type { ORM } from "fasset-indexer-core/orm"

enum Score { A, B, C, D, E, F }

export class AgentScore extends AgentStatistics {
  constructor(public readonly orm: ORM) { super(orm) }

  protected async isInFullLiquidation(vault: string): Promise<boolean> {
    const liquidations = await this.orm.em.fork().findOne(FullLiquidationStarted, { agentVault: { address: { hex: vault }}})
    return liquidations !== null
  }

  protected async redemptionSuccessScore(vault: string, now: number, delta: number, lim: number): Promise<Score> {
    const [wa] = await this.redemptionDefaultWA(vault, now, delta, lim)
    if (wa === BigInt(0)) return Score.A
    const backedFAssets = await this.backedFAssets(vault)
    const defaultRatio = backedFAssets * MAX_BIPS / wa
    if (defaultRatio <= this.percentageToBips(0.02)) {
      return Score.B
    } else if (defaultRatio <= this.percentageToBips(0.05)) {
      return Score.C
    } else if (defaultRatio <= this.percentageToBips(0.1)) {
      return Score.D
    } else if (defaultRatio <= this.percentageToBips(0.2)) {
      return Score.E
    } else {
      return Score.F
    }
  }

  private percentageToBips(percentage: number): bigint {
    return BigInt(percentage * Number(MAX_BIPS))
  }


}