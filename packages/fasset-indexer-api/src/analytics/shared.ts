import { SelectQueryBuilder, ORM, raw } from "fasset-indexer-core/orm"
import {
  MintingExecuted, RedemptionRequested, LiquidationPerformed,
  CPExited, CPEntered, CPSelfCloseExited
} from "fasset-indexer-core/entities"


export abstract class SharedAnalytics {
  constructor(public readonly orm: ORM) {}

  protected async poolCollateralAt(pool?: string, user?: string, timestamp?: number): Promise<bigint> {
    const entered = await this.poolCollateralEnteredAt(pool, user, timestamp)
    if (entered === BigInt(0)) return BigInt(0)
    const exited = await this.poolCollateralExitedAt(pool, user, timestamp)
    const selfCloseExited = await this.poolCollateralSelfCloseExitedAt(pool, user, timestamp)
    return entered - exited - selfCloseExited
  }

  protected async poolCollateralEnteredAt(pool?: string, user?: string, timestamp?: number): Promise<bigint> {
    const enteredCollateral = await this.filterEnterOrExitQueryBy(
      this.orm.em.fork().createQueryBuilder(CPEntered, 'cpe')
        .select([raw('sum(cpe.amount_nat_wei) as collateral')]),
      'cpe', pool, user, timestamp
    ).execute() as { collateral: bigint }[]
    return BigInt(enteredCollateral[0]?.collateral || 0)
  }

  protected async poolCollateralExitedAt(pool?: string, user?: string, timestamp?: number): Promise<bigint> {
    const exitedCollateral = await this.filterEnterOrExitQueryBy(
      this.orm.em.fork().createQueryBuilder(CPExited, 'cpe')
        .select([raw('sum(cpe.received_nat_wei) as collateral')]),
      'cpe', pool, user, timestamp
    ).execute() as { collateral: bigint }[]
    return BigInt(exitedCollateral[0]?.collateral || 0)
  }

  protected async poolCollateralSelfCloseExitedAt(pool?: string, user?: string, timestamp?: number): Promise<bigint> {
    const selfCloseExitedCollateral = await this.filterEnterOrExitQueryBy(
      this.orm.em.fork().createQueryBuilder(CPSelfCloseExited, 'cpsce')
        .select([raw('sum(cpsce.received_nat_wei) as collateral')]),
        'cpsce', pool, user, timestamp
      ).execute() as { collateral: bigint }[]
    return BigInt(selfCloseExitedCollateral[0]?.collateral || 0)
  }

  protected async backedFAssets(vault: string): Promise<bigint> {
    const em = this.orm.em.fork()
    const minted = await em.createQueryBuilder(MintingExecuted, 'me')
      .join('me.collateralReserved', 'cr')
      .join('cr.agentVault', 'av')
      .join('av.address', 'ava')
      .where({ 'ava.hex': vault })
      .select(raw('SUM(cr.value_uba) as minted_uba'))
      .execute() as { minted_uba: string }[]
    if (minted.length === 0) return BigInt(0)
    const redeemed = await em.createQueryBuilder(RedemptionRequested, 'rr')
      .join('rr.agentVault', 'av')
      .join('av.address', 'ava')
      .where({ 'ava.hex': vault })
      .select(raw('SUM(rr.value_uba) as redeemed_uba'))
      .execute() as { redeemed_uba: string }[]
    const liquidated = await em.createQueryBuilder(LiquidationPerformed, 'lp')
      .join('lp.agentVault', 'av')
      .join('av.address', 'ava')
      .where({ 'ava.hex': vault })
      .select(raw('SUM(lp.value_uba) as liquidated_uba'))
      .execute() as { liquidated_uba: string }[]
    return BigInt(minted[0]?.minted_uba ?? 0)
      - BigInt(redeemed[0]?.redeemed_uba ?? 0)
      - BigInt(liquidated[0]?.liquidated_uba ?? 0)
  }

  protected filterEnterOrExitQueryBy<T extends object>(
    qb: SelectQueryBuilder<T>, alias: string,
    pool?: string, user?: string, timestamp?: number
  ): SelectQueryBuilder<T> {
    if (timestamp !== undefined || pool !== undefined) {
      qb = qb.join(`${alias}.evmLog`, 'el')
      if (timestamp !== undefined) {
        qb = qb
          .join('el.block', 'block')
          .where({ 'block.timestamp': { $lte: timestamp }})
      }
      if (pool !== undefined) {
        qb = qb
          .join('el.address', 'ela')
          .andWhere({ 'ela.hex': pool })
      }
    }
    if (user !== undefined) {
      qb = qb
        .join(`${alias}.tokenHolder`, 'th')
        .andWhere({ 'th.hex': user })
    }
    return qb
  }
}