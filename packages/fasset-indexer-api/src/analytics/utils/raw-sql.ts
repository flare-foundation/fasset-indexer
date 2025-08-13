import { FAssetType } from "fasset-indexer-core"


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

// postgres-specific query
export const EXPLORER_TRANSACTIONS = `
WITH t AS MATERIALIZED (
  SELECT el.id, el.name, ea.hex, eb.timestamp, et.hash FROM evm_log el
  JOIN evm_block eb ON eb.index = el.block_index
  JOIN evm_transaction et ON et.id = el.transaction_id
  JOIN evm_address ea ON ea.id = et.source_id
  WHERE el.name IN (
      'CollateralReserved',
      'RedemptionRequested',
      'TransferToCoreVaultStarted',
      'ReturnFromCoreVaultRequested'
  )
  ORDER BY el.block_index
  LIMIT ? OFFSET ?
)

SELECT t.name, t.timestamp, t.hex as source, t.hash, cr.agent_vault_address_id as agent_id, cr.value_uba FROM t
JOIN collateral_reserved cr ON cr.evm_log_id = t.id
WHERE t.name = 'CollateralReserved'

UNION ALL

SELECT t.name, t.timestamp, t.hex as source, t.hash, rr.agent_vault_address_id as agent_id, rr.value_uba FROM t
JOIN redemption_requested rr ON rr.evm_log_id = t.id
WHERE t.name = 'RedemptionRequested'

UNION ALL

SELECT t.name, t.timestamp, t.hex as source, t.hash, tcvs.agent_vault_address_id as agent_id, tcvs.value_uba FROM t
JOIN transfer_to_core_vault_started tcvs ON tcvs.evm_log_id = t.id
WHERE t.name = 'TransferToCoreVaultStarted'

UNION ALL

SELECT t.name, t.timestamp, t.hex as source, t.hash, rfcvr.agent_vault_address_id as agent_id, rfcvr.value_uba FROM t
JOIN return_from_core_vault_requested rfcvr ON rfcvr.evm_log_id = t.id
WHERE t.name = 'ReturnFromCoreVaultRequested'

ORDER BY timestamp;
`
