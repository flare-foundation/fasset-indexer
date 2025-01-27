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
select (rr.fasset, am.name, ea.hex, rr.request_id, eb.index, eb.timestamp)
from redemption_requested rr
join evm_log el on rr.evm_log_id = el.id
join evm_block eb on eb.index = el.block_index
join agent_vault av on rr.agent_vault_address_id = av.address_id
join agent_owner ao on av.vaults = ao.id
join agent_manager am on ao.agents = am.address_id
join evm_address ea on av.address_id = ea.id
left join underlying_vout_reference dvr on rr.payment_reference = dvr.reference and dvr.address_id = av.underlying_address_id
left join redemption_default rd on rd.redemption_requested_id = rr.id
where fasset=${FAssetType.FDOGE} and eb.timestamp > ? and dvr.id is null and rd.id is null`
