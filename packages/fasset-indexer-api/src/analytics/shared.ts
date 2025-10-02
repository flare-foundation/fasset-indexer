import { FAsset, FAssetType } from "fasset-indexer-core"
import { SelectQueryBuilder, ORM, raw } from "fasset-indexer-core/orm"
import {
  MintingExecuted, RedemptionRequested, LiquidationPerformed,
  CPExited, CPEntered, CPSelfCloseExited
} from "fasset-indexer-core/entities"
import type {
  TimeSeries, Timespan, FAssetTimeSeries, FAssetTimespan,
  FAssetValueResult, FAssetAmountResult
} from "./types"


export abstract class SharedAnalytics {
  constructor(public readonly orm: ORM, protected readonly supportedFAssets: FAsset[]) {}

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

    protected transformFAssetValueResults(
    res1: FAssetValueResult,
    res2: FAssetValueResult,
    transformer: (x: bigint, y: bigint) => bigint
  ): FAssetValueResult {
    const res = {} as FAssetValueResult
    for (let fasset of this.supportedFAssets) {
      const x = res1[fasset]?.value ?? BigInt(0)
      const y = res2[fasset]?.value ?? BigInt(0)
      res[fasset] = { value: transformer(x, y) }
    }
    return res
  }

  protected transformFAssetAmountResults(
    res1: FAssetAmountResult,
    res2: FAssetAmountResult,
    transformer: (x: number, y: number) => number
  ): FAssetAmountResult {
    const res = {} as FAssetAmountResult
    for (let fasset of this.supportedFAssets) {
      const x = res1[fasset]?.amount ?? 0
      const y = res2[fasset]?.amount ?? 0
      res[fasset] = { amount: transformer(x, y) }
    }
    return res
  }

  protected convertFAssetValueResultToFAssetAmountResult(
    result: FAssetValueResult
  ): FAssetAmountResult {
    return Object.fromEntries(Object.entries(result).map(
      ([fasset, { value }]) => [ fasset, { amount: Number(value) }]
    )) as FAssetAmountResult
  }

  protected convertOrmResultToFAssetValueResult<K extends string>(
    result: ({ fasset: number } & { [key in K]: string | bigint })[], key: K
  ): FAssetValueResult {
    const ret = {} as FAssetValueResult
    for (const x of result) {
      ret[FAssetType[x.fasset] as FAsset] = { value: BigInt(x?.[key] ?? 0) }
    }
    return this.complementFAssetValueResult(ret)
  }

  protected convertOrmResultToFAssetAmountResult<K extends string>(
    result: ({ fasset: number } & { [key in K]: string | number })[], key: K
  ): FAssetAmountResult {
    const ret = {} as FAssetAmountResult
    for (const x of result) {
      ret[FAssetType[x.fasset] as FAsset] = { amount: Number(x?.[key] ?? 0) }
    }
    return this.complementFAssetAmountResult(ret)
  }

  private convertFAssetTimeSeriesToFAssetTimespan(timeseries: FAssetTimeSeries<bigint>): FAssetTimespan<bigint> {
    return Object.fromEntries(Object.entries(timeseries).map(
      ([fasset, ts]) => [fasset, this.convertTimeSeriesToTimespan(ts)])
    ) as FAssetTimespan<bigint>
  }

  private convertTimeSeriesToTimespan(timeseries: TimeSeries<bigint>): Timespan<bigint> {
    const timespan: Timespan<bigint> = []
    let pval = BigInt(0)
    for (const { end, value } of timeseries) {
      pval += value
      timespan.push({ timestamp: end, value: pval })
    }
    return timespan
  }

  private complementFAssetValueResult(result: FAssetValueResult): FAssetValueResult {
    for (const fasset of this.supportedFAssets) {
      if (result[fasset] == null) {
        result[fasset] = { value: BigInt(0) }
      }
    }
    return result
  }

  private complementFAssetAmountResult(result: FAssetAmountResult): FAssetAmountResult {
    for (const fasset of this.supportedFAssets) {
      if (result[fasset] == null) {
        result[fasset] = { amount: 0 }
      }
    }
    return result
  }
}