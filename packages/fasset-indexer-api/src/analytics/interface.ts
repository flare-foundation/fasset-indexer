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

export interface TransactionsInfo {
  transactions: TransactionInfo[]
  count: number
}

export interface TransactionInfo {
  name: keyof typeof TransactionType
  origin: string
  user?: string
  hash: string
  timestamp: number
  value: bigint
  agentVault: string
  agentName: string
}

export type GenericTransactionClassification = {
  transactionHash: string
  eventName: string
}[]

export type MintTransactionDetails = TransactionDetails<MintEventDetails, void>
export type RedeemTransactionDetails = TransactionDetails<RedeemEventDetails, Entities.RedemptionRequestIncomplete[]>
export type TransferToCoreVaultTransactionDetails = TransactionDetails<TransferToCoreVaultEventDetails, void>
export type RetrunFromCoreVaultTransactionDetails = TransactionDetails<ReturnFromCoreVaultEventDetails, void>

export type MintEventDetails = EventDetails<
  Entities.CollateralReserved,
  Entities.MintingExecuted
    | Entities.MintingPaymentDefault
    | Entities.CollateralReservationDeleted
>
export type RedeemEventDetails = EventDetails<
  Entities.RedemptionRequested,
  Entities.RedemptionRequested
    | Entities.RedemptionPerformed
    | Entities.RedemptionDefault
    | Entities.RedemptionRejected
    | Entities.RedemptionPaymentBlocked
    | Entities.RedemptionPaymentFailed
>
export type TransferToCoreVaultEventDetails = EventDetails<
  Entities.TransferToCoreVaultStarted,
  Entities.TransferToCoreVaultSuccessful
    | Entities.TransferToCoreVaultDefaulted
>
export type ReturnFromCoreVaultEventDetails = EventDetails<
  Entities.ReturnFromCoreVaultRequested,
  Entities.ReturnFromCoreVaultConfirmed
    | Entities.ReturnFromCoreVaultCancelled
>

interface TransactionDetails<T,U> {
  flows: T[]
  flags?: U
}

interface EventDetails<T,U> {
  underlyingTransaction?: Entities.UnderlyingVoutReference
  events: {
    original: T
    resolution?: U
  }
}