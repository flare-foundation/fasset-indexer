import { FAssetType } from "fasset-indexer-core"
import { TransactionType } from "../types"


export const COLLATERAL_POOL_PORTFOLIO_SQL = `
with cpt as (
    select collateral_pool_token_id
    from agent_vault
)
select
    a.hex as address,
    tb.token_id as token,
    cpt_a.hex as cpt_address,
    amount as balance
from token_balance as tb
left join evm_address as a on tb.holder_id = a.id
left join evm_address as cpt_a on token_id = cpt_a.id
where token_id in (select * from cpt)
and a.hex = ?
`

const LIQUIDATION_DATA_SQL = (table: string, name: string) => `
${name} as (
    select
        el.id, eb.timestamp as timestamp
    from
        ${table} tbl
    join
        evm_log el
    on
        tbl.evm_log_id = el.id
    join
        evm_block eb
    on
        el.block_index = eb.index
    join
        evm_address as ea
    on
        tbl.agent_vault_address_id = ea.id
    where
        ea.hex = ?
)`

export const LIQUIDATION_DURATION_SQL = `with
${LIQUIDATION_DATA_SQL('liquidation_started', 'als')},
${LIQUIDATION_DATA_SQL('liquidation_ended', 'ale')},
liquidation_duration AS (
    select
        ls.timestamp as ls_timestamp, min(le.timestamp) as le_timestamp
    from
        als ls
    join
        ale le
    on
        le.timestamp > ls.timestamp
    group by
        ls.timestamp
)
select
    ld.le_timestamp as timestamp,
    (ld.le_timestamp - ld.ls_timestamp) as diff,
    (ld.le_timestamp - ld.ls_timestamp) * ld.ls_timestamp::numeric(25) as _impact
from
    liquidation_duration ld
where
    ld.ls_timestamp > ?
order by
    _impact desc
limit
    ?
`

export const UNFINALIZED_DOGE_REDEMPTIONS = `
select rr.fasset, am.name, ea.hex, rr.request_id, eb.index, eb.timestamp
from redemption_requested rr
join evm_log el on rr.evm_log_id = el.id
join evm_block eb on eb.index = el.block_index
join agent_vault av on rr.agent_vault_address_id = av.address_id
join agent_owner ao on av.vaults = ao.id
join agent_manager am on ao.agents = am.address_id
join evm_address ea on av.address_id = ea.id
left join underlying_vout_reference dvr on rr.payment_reference = dvr.reference and dvr.address_id = av.underlying_address_id
left join redemption_default rd on rd.redemption_requested_evm_log_id = rr.evm_log_id
where rr.fasset=${FAssetType.FDOGE} and eb.timestamp > ? and dvr.id is null and rd.evm_log_id is null
limit ?`

// Returns one row per (token_id, timestamp). All inputs are internal
// numeric ids / parsed unix timestamps, safe to inline.
export const FASSET_SUPPLY_AT_TIMESTAMPS = (
  zeroAddressId: number, tokenIds: number[], timestamps: number[]
) => `
WITH ts(timestamp) AS (VALUES ${timestamps.map(t => `(${t})`).join(', ')}),
tokens(id) AS (VALUES ${tokenIds.map(id => `(${id})`).join(', ')}),
deltas AS (
  SELECT el.address_id AS token_id, eb.timestamp AS block_timestamp,
    CASE WHEN t.from_id = ${zeroAddressId} THEN t.value
         WHEN t.to_id = ${zeroAddressId} THEN -t.value
         ELSE 0 END AS delta
  FROM erc20transfer t
  JOIN evm_log el ON el.id = t.evm_log_id
  JOIN evm_block eb ON eb.index = el.block_index
  WHERE (t.from_id = ${zeroAddressId} OR t.to_id = ${zeroAddressId})
    AND el.address_id IN (${tokenIds.join(', ')})
)
SELECT tk.id AS token_id, ts.timestamp AS timestamp,
  COALESCE(SUM(CASE WHEN d.block_timestamp <= ts.timestamp THEN d.delta ELSE 0 END), 0) AS supply
FROM tokens tk
CROSS JOIN ts
LEFT JOIN deltas d ON d.token_id = tk.id
GROUP BY tk.id, ts.timestamp
`

// postgres-specific query
export const UNDERLYING_AGENT_BALANCE = `
SELECT t.fasset, SUM(t.balance_uba) AS total_balance FROM (
  SELECT DISTINCT ON (ubc.fasset, ubc.agent_vault_address_id)
    ubc.fasset, ubc.agent_vault_address_id, ubc.balance_uba, el.block_index
  FROM underlying_balance_changed ubc
  JOIN evm_log el ON ubc.evm_log_id = el.id
  JOIN evm_block eb ON el.block_index = eb.index
  WHERE eb.timestamp <= ?
  ORDER BY ubc.fasset, ubc.agent_vault_address_id, el.block_index DESC
) t
GROUP BY t.fasset
ORDER BY t.fasset
`

const explorerQueryTransactions = new Map([
  [TransactionType.Mint, `
    SELECT cr.evm_log_id, cr.agent_vault_address_id, cr.value_uba, cr.minter_id as user_id, cr.resolution, cr.payment_reference
    FROM collateral_reserved cr`
  ],
  [TransactionType.Redeem, `
    SELECT rr.evm_log_id, rr.agent_vault_address_id, rr.value_uba, rr.redeemer_id as user_id, rr.resolution, rr.payment_reference
    FROM redemption_requested rr
    FULL JOIN transfer_to_core_vault_started tc ON rr.fasset = tc.fasset AND rr.request_id = tc.transfer_redemption_request_id
    WHERE tc.evm_log_id IS NULL`
  ],
  [TransactionType.TransferToCV, `
    SELECT tc.evm_log_id, tc.agent_vault_address_id, tc.value_uba, NULL::integer as user_id, tc.resolution, rr.payment_reference
    FROM transfer_to_core_vault_started tc
    JOIN redemption_requested rr
    ON rr.fasset = tc.fasset AND rr.request_id = tc.transfer_redemption_request_id`
  ],
  [TransactionType.ReturnFromCV, `
    SELECT rc.evm_log_id, rc.agent_vault_address_id, rc.value_uba, NULL::integer as user_id, rc.resolution, rc.payment_reference
    FROM return_from_core_vault_requested rc`
  ],
  [TransactionType.SelfMint, `
    SELECT sm.evm_log_id, sm.agent_vault_address_id, sm.minted_uba as value_uba, NULL::integer as user_id, NULL::integer as resolution, NULL::text as payment_reference
    FROM self_mint sm`
  ],
  [TransactionType.Withdrawal, `
    SELECT w.evm_log_id, w.agent_vault_address_id, wc.spend_uba::bigint as value_uba, NULL::integer as user_id, w.resolution, w.payment_reference
    FROM underlying_withdrawal_announced w
    FULL JOIN underlying_withdrawal_confirmed wc
    ON w.evm_log_id = wc.underlying_withdrawal_announced_evm_log_id`
  ],
  [TransactionType.Topup, `
    SELECT tp.evm_log_id, tp.agent_vault_address_id, tp.deposited_uba as value_uba, NULL::integer as user_id, 1 as resolution, NULL::text as payment_reference
    FROM underlying_balance_topped_up tp`
  ],
  // The smart-account arm's mint target is not on the asset-manager event: it
  // mints to the smart account manager, which forwards to a personal account.
  // That PA is a pure function of the XRPL source address — the smart account
  // manager derives it via getOrCreatePersonalAccount(sourceAddress) before
  // reading the memo, and a memo instruction cannot redirect it (the UserOp
  // sender is required to equal the PA). So personal_account, populated from
  // MASTER_ACCOUNT_CONTROLLER:PersonalAccountCreated, resolves the target.
  //
  // LEFT JOIN, not JOIN: a PA whose creation event predates the indexed range
  // is missing from personal_account, and those rows must still appear in the
  // unfiltered listing (with a null user) rather than vanish.
  //
  // Caveat on value_uba: minted_amount_uba is what the asset manager minted to
  // the manager, before it deducts the executor fee. The PA is credited
  // minted_amount_uba - executorFee, and executorFee lives only on the smart
  // account manager's own DirectMintingExecuted event, which is not indexed.
  [TransactionType.DirectMint, `
    SELECT dm.evm_log_id, NULL::integer as agent_vault_address_id, dm.minted_amount_uba as value_uba, dm.target_address_id as user_id, 1 as resolution, NULL::text as payment_reference
    FROM direct_minting_executed dm
    UNION ALL
    SELECT dms.evm_log_id, NULL::integer as agent_vault_address_id, dms.minted_amount_uba as value_uba, pa.address_id as user_id, 1 as resolution, NULL::text as payment_reference
    FROM direct_minting_executed_to_smart_account dms
    LEFT JOIN personal_account pa ON pa.underlying_address_id = dms.source_address_id`
  ]
])

const explorerTransactionsUnion = (methods: TransactionType[]) =>
  Array.from(explorerQueryTransactions.entries())
    .filter(([k]) => methods.includes(k))
    .map(([, v]) => v)
    .join(' UNION ALL ')

// Translate a [start, end] timestamp window into the block range it covers. One
// index seek per side; the caller turns the blocks into an evm_log_id range by
// arithmetic, because evm_log ids encode block_index * EVM_LOG_INDEX_SCALE +
// index (see evmLogId in the core package).
//
// This used to have to find the bounding evm_log rows themselves and then pad
// the result, since an autoincrement id had no fixed relationship to block
// position. The encoding makes the range exact, so no margin is needed and
// blocks with no indexed logs cost nothing.
export const EXPLORER_TRANSACTIONS_BLOCK_BOUNDS = `
SELECT
  (SELECT index FROM evm_block WHERE timestamp >= ? ORDER BY timestamp ASC, index ASC LIMIT 1) AS lo_block,
  (SELECT index FROM evm_block WHERE timestamp <= ? ORDER BY timestamp DESC, index DESC LIMIT 1) AS hi_block
`

// evm_log_id encodes the log's on-chain position, so `evm_log_id BETWEEN ? AND ?`
// is an exact expression of the requested block range — not an approximation of
// the timestamp predicate. That lets the window be applied without joining
// evm_log/evm_block at all: the filter pushes down per-arm, so each event table's
// PK index prunes the union at the source instead of materialising it.
//
// It also means the join that used to exist purely to sort by (block_index,
// index) is gone. Ordering by evm_log_id is ordering by chain position, so a
// back-indexed old event sorts where it belongs rather than bubbling to the top
// with a fresh high id.
const explorerTransactionsFilter = (
  user: boolean, agent: boolean,
  window: boolean, status: boolean
) => `
${user ? 'JOIN evm_address eaui ON eaui.id = ti.user_id' : ''}
${agent ? 'JOIN evm_address eaai ON eaai.id = ti.agent_vault_address_id' : ''}
WHERE 1=1
${user ? 'AND eaui.hex = ?' : ''}
${agent ? 'AND eaai.hex = ?' : ''}
${window ? 'AND ti.evm_log_id BETWEEN ? AND ?' : ''}
${status ? 'AND ti.resolution = ?' : ''}
`

// psql specific query
export const EXPLORER_TRANSACTIONS = (
  user: boolean, agent: boolean,
  asc: boolean, window: boolean,
  status: boolean,
  methods: TransactionType[]
) => {
  const dir = asc ? 'ASC' : 'DESC'
  // One sort key in both branches: evm_log_id is the chain position.
  const innerSortKey = `ti.evm_log_id ${dir}`
  const outerSortKey = `t.evm_log_id ${dir}`
  return `
SELECT
  et.hash, el.name, eb.timestamp, eaa.hex as agent_vault,
  am.name as agent_name, eau.hex as user, eao.hex as source,
  t.value_uba, t.resolution, ur.id as underlying_payment
FROM (
  SELECT ti.evm_log_id, ti.agent_vault_address_id, ti.value_uba, ti.user_id, ti.resolution, ti.payment_reference
  FROM (${explorerTransactionsUnion(methods)}) ti
  ${explorerTransactionsFilter(user, agent, window, status)}
  ORDER BY ${innerSortKey}
  LIMIT ? OFFSET ?
) t
JOIN evm_log el ON el.id = t.evm_log_id
JOIN evm_block eb ON eb.index = el.block_index
JOIN evm_transaction et ON et.id = el.transaction_id
LEFT JOIN evm_address eaa ON eaa.id = t.agent_vault_address_id
JOIN evm_address eao ON eao.id = et.source_id
LEFT JOIN evm_address eau ON eau.id = t.user_id
LEFT JOIN agent_vault av ON av.address_id = t.agent_vault_address_id
LEFT JOIN agent_owner ao ON av.vaults = ao.id
LEFT JOIN agent_manager am ON am.address_id = ao.agents
LEFT JOIN LATERAL (
  SELECT ur.id
  FROM underlying_reference ur
  WHERE ur.reference = t.payment_reference
  ORDER BY ur.id ASC
  LIMIT 1
) ur ON true
ORDER BY ${outerSortKey}
`
}

export const EXPLORER_TRANSACTIONS_COUNT = (
  user: boolean, agent: boolean,
  window: boolean, status: boolean,
  methods: TransactionType[]
) => `
SELECT COUNT(*) as count
FROM (${explorerTransactionsUnion(methods)}) ti
${explorerTransactionsFilter(user, agent, window, status)}
`

export type ExplorerTransactionsOrmResult = {
  name: string, timestamp: number, source: string, user: string,
  hash: string, agent_vault: string, agent_name: string, value_uba: string,
  resolution: number, underlying_payment?: number
}

export const EVENT_FROM_UNDERLYING_HASH = `
SELECT et.hash, el.name, t.payment_reference FROM (
  SELECT cr.evm_log_id, cr.payment_reference FROM collateral_reserved cr
  UNION ALL
  SELECT rr.evm_log_id, rr.payment_reference FROM redemption_requested rr
  FULL JOIN transfer_to_core_vault_started tc ON rr.fasset = tc.fasset AND rr.request_id = tc.transfer_redemption_request_id
  WHERE tc.evm_log_id IS NULL
  UNION ALL
  SELECT tc.evm_log_id, rr.payment_reference FROM transfer_to_core_vault_started tc
  JOIN redemption_requested rr ON rr.fasset = tc.fasset AND rr.request_id = tc.transfer_redemption_request_id
  UNION ALL
  SELECT rc.evm_log_id, rc.payment_reference FROM return_from_core_vault_requested rc
) t
JOIN underlying_reference uvr ON uvr.reference = t.payment_reference
JOIN underlying_transaction ut ON ut.id = uvr.transaction_id
JOIN evm_log el ON el.id = t.evm_log_id
JOIN evm_transaction et ON et.id = el.transaction_id
WHERE ut.hash = ?
ORDER BY el.block_index DESC
`

export const MINTED_BY_UNDERLYING_ADDRESS = `
SELECT fasset, SUM(val) as val FROM (
  SELECT me.fasset, ut.value AS val
    FROM minting_executed me
    JOIN collateral_reserved cr ON cr.evm_log_id = me.collateral_reserved_evm_log_id
    JOIN underlying_reference ur ON ur.reference = cr.payment_reference
    JOIN underlying_transaction ut ON ut.id = ur.transaction_id
    JOIN underlying_address ua ON ua.id = ut.source_id
    JOIN underlying_block ub ON ub.height = ut.block_height
    WHERE ua.text = ? AND ub.timestamp >= ? AND ub.timestamp < ?
  UNION ALL
  SELECT dm.fasset, ut.value AS val
    FROM direct_minting_executed dm
    JOIN underlying_transaction ut ON ut.hash = UPPER(SUBSTRING(dm.transaction_id FROM 3))
    JOIN underlying_address ua ON ua.id = ut.source_id
    JOIN underlying_block ub ON ub.height = ut.block_height
    WHERE ua.text = ? AND ub.timestamp >= ? AND ub.timestamp < ?
  UNION ALL
  SELECT dms.fasset, ut.value AS val
    FROM direct_minting_executed_to_smart_account dms
    JOIN underlying_transaction ut ON ut.hash = UPPER(SUBSTRING(dms.transaction_id FROM 3))
    JOIN underlying_address ua ON ua.id = dms.source_address_id
    JOIN underlying_block ub ON ub.height = ut.block_height
    WHERE ua.text = ? AND ub.timestamp >= ? AND ub.timestamp < ?
) t
GROUP BY fasset
`

export const REDEEMED_BY_UNDERLYING_ADDRESS = `
SELECT rp.fasset, SUM(ut.value) as val FROM redemption_performed rp
  JOIN redemption_requested rr ON rr.evm_log_id = rp.redemption_requested_evm_log_id
  JOIN underlying_reference ur ON ur.reference = rr.payment_reference
  JOIN underlying_transaction ut ON ut.id = ur.transaction_id
  JOIN underlying_address ua ON ua.id = ut.target_id
  JOIN underlying_block ub ON ub.height = ut.block_height
  WHERE ua.text = ? AND ub.timestamp >= ? AND ub.timestamp < ?
  GROUP BY rp.fasset
`

export const UNDERLYING_MINTERS = `
SELECT DISTINCT address FROM (
  SELECT ua.text AS address
    FROM minting_executed me
    JOIN collateral_reserved cr ON cr.evm_log_id = me.collateral_reserved_evm_log_id
    JOIN evm_address ea ON ea.id = cr.minter_id
    JOIN underlying_reference ur ON ur.reference = cr.payment_reference
    JOIN underlying_address ua ON ua.id = ur.address_id
    WHERE ea.hex = ?
  UNION ALL
  SELECT ua.text AS address
    FROM direct_minting_executed dm
    JOIN evm_address ea ON ea.id = dm.target_address_id
    JOIN underlying_transaction ut ON ut.hash = UPPER(SUBSTRING(dm.transaction_id FROM 3))
    JOIN underlying_address ua ON ua.id = ut.source_id
    WHERE ea.hex = ?
  UNION ALL
  -- Smart-account direct mints: the minter is the personal account derived from
  -- the XRPL source address, so that source address is the underlying address we
  -- report. Inner join — an unmapped PA cannot match the queried hex anyway.
  SELECT ua.text AS address
    FROM direct_minting_executed_to_smart_account dms
    JOIN personal_account pa ON pa.underlying_address_id = dms.source_address_id
    JOIN evm_address ea ON ea.id = pa.address_id
    JOIN underlying_address ua ON ua.id = dms.source_address_id
    WHERE ea.hex = ?
) t`