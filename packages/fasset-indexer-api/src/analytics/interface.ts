import type * as Entities from 'fasset-indexer-core/entities'
import type { FAsset } from "fasset-indexer-core"

// dashboard types

export type FAssetResult<T> = Record<Partial<FAsset>, T>

export type TimeSeries<T> = { index: number, start: number, end: number, value: T }[]

export type FAssetTimeSeries<T> = FAssetResult<TimeSeries<T>>

export type Timespan<T> = { timestamp: number, value: T }[]

export type FAssetTimespan<T> = FAssetResult<Timespan<T>>

export type TokenPortfolio = Record<string, { balance: bigint }>

export type FAssetCollateralPoolScore = FAssetResult<{ pool: string, claimed: bigint, score: bigint }[]>

export type ValueResult = { value: bigint }

export type FAssetValueResult = FAssetResult<ValueResult>

export type AmountResult = { amount: number }

export type FAssetAmountResult = FAssetResult<AmountResult>

export interface StatisticAverage {
  average: bigint
  total: number
  limit: number
  delta: number
  now: number
}

// explorer types

export enum TransactionType {
  Mint = 0,
  Redeem = 1,
  TransferToCV = 2,
  ReturnFromCV = 3
}

export interface TransactionInfo {
  name: keyof typeof TransactionType
  origin: string
  hash: string
  timestamp: number
  value: bigint
  agent: Entities.AgentVault
  count?: number
}

type ResolutionType<T> = {
  name: string
  event: T
}

export interface MintTransactionDetails {
  event: Entities.CollateralReserved
  underlyingTransaction?: Entities.UnderlyingVoutReference
  resolution?: ResolutionType<
      Entities.MintingExecuted
    | Entities.MintingPaymentDefault
    | Entities.CollateralReservationDeleted
  >
}

export interface RedeemTransactionDetails {
  event: Entities.RedemptionRequested
  underlyingTransaction?: Entities.UnderlyingVoutReference
  resolution?: ResolutionType<
      Entities.RedemptionRequested
    | Entities.RedemptionPerformed
    | Entities.RedemptionDefault
    | Entities.RedemptionPaymentBlocked
    | Entities.RedemptionPaymentFailed
  >
}

export interface TransferToCoreVaultTransactionDetails {
  event: Entities.TransferToCoreVaultStarted
  underlyingTransaction?: Entities.UnderlyingVoutReference
  resolution?: ResolutionType<
      Entities.TransferToCoreVaultSuccessful
    | Entities.TransferToCoreVaultDefaulted
  >
}

export interface ReturnFromCoreVaultTransactionDetails {
  event: Entities.ReturnFromCoreVaultRequested
  underlyingTransaction?: Entities.UnderlyingVoutReference
  resolution?: ResolutionType<
      Entities.ReturnFromCoreVaultConfirmed
    | Entities.ReturnFromCoreVaultCancelled
  >
}