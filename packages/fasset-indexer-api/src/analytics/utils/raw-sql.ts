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
    SELECT tp.evm_log_id, tp.agent_vault_address_id, tp.deposited_uba as value_uba, NULL::integer as user_id, NULL::integer as resolution, NULL::text as payment_reference
    FROM underlying_balance_topped_up tp`
  ]
])

// psql specific query
export const EXPLORER_TRANSACTIONS = (user: boolean, agent: boolean, asc: boolean, window: boolean, methods: TransactionType[]) => `
SELECT
  et.hash, el.name, eb.timestamp, eaa.hex as agent_vault,
  am.name as agent_name, eau.hex as user, eao.hex as source,
  t.value_uba, t.resolution, ur.id as underlying_payment, COUNT(*) OVER() as count
FROM (${Array.from(explorerQueryTransactions.entries()).filter(([k, _]) => methods.includes(k)).map(([_,v]) => v).join(' UNION ALL ')}) t
FULL JOIN evm_address eau ON eau.id = t.user_id
FULL JOIN underlying_reference ur ON ur.reference = t.payment_reference
JOIN evm_log el ON el.id = t.evm_log_id
JOIN evm_block eb ON eb.index = el.block_index
JOIN evm_transaction et ON et.id = el.transaction_id
JOIN evm_address eaa ON eaa.id = t.agent_vault_address_id
JOIN evm_address eao ON eao.id = et.source_id
JOIN agent_vault av ON av.address_id = t.agent_vault_address_id
JOIN agent_owner ao ON av.vaults = ao.id
JOIN agent_manager am ON am.address_id = ao.agents
${user ? 'WHERE eau.hex = ?' : ''}
${agent ? 'WHERE eaa.hex = ?' : ''}
${window ? ((agent || user ? 'AND' : 'WHERE') + ' eb.timestamp BETWEEN ? AND ?') : ''}
ORDER BY el.block_index ${asc ? 'ASC' : 'DESC'}
LIMIT ? OFFSET ?
`

export type ExplorerTransactionsOrmResult = {
  name: string, timestamp: number, source: string, user: string,
  hash: string, agent_vault: string, agent_name: string, value_uba: string,
  count: number, resolution: number, underlying_payment?: number
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