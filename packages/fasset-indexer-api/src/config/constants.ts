export const CACHE_TTL_MS = 30_000
export const CACHE_MAX_ENTRIES = 300

export const MAX_TIMESERIES_PTS = 100
export const MAX_RETURNED_OBJECTS = 100
export const MAX_TIMESPAN_PTS = 20

export const CP_SCORE_MIN_POOL_COLLATERAL_WEI = BigInt("1000000000000000000000000")

export const PRICE_DECIMALS = 8
export const PRICE_FACTOR = BigInt(10 ** PRICE_DECIMALS)
export const MAX_BIPS = BigInt(1e4)

export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'

// Default lookback applied to /explorer/transactions when the caller doesn't
// pass start/end. Prevents reindexed-but-old events (high evm_log_id, old
// timestamp) from bubbling to the top during reindex.
export const EXPLORER_DEFAULT_LOOKBACK_SECONDS = 90 * 24 * 60 * 60