export const CACHE_TTL_MS = 30_000
export const CACHE_MAX_ENTRIES = 300

export const MAX_TIMESERIES_PTS = 100
export const MAX_RETURNED_OBJECTS = 100
export const MAX_TIMESPAN_PTS = 30

export const CP_SCORE_MIN_POOL_COLLATERAL_WEI = BigInt("1000000000000000000000000")

export const PRICE_DECIMALS = 8
export const PRICE_FACTOR = BigInt(10 ** PRICE_DECIMALS)
export const MAX_BIPS = BigInt(1e4)

export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'

// Default lookback applied to /explorer/transactions when the caller doesn't
// pass start/end. Purely a bound on how much of the union an open-ended query
// scans: evm_log ids encode chain position, so ordering is correct during
// reindex with or without a window.
export const EXPLORER_DEFAULT_LOOKBACK_SECONDS = 90 * 24 * 60 * 60