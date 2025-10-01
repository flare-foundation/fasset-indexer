import { EntityManager } from "@mikro-orm/knex"
import { ConfigLoader } from "../config/config"
import { Context } from "../context/context"
import {
  CollateralReservationResolution, RedemptionResolution,
  ReturnFromCoreVaultResolution, TransferToCoreVaultResolution,
  UnderlyingWithdrawalResolution
} from "../shared"

const config = {
  collateral_reserved: [
    ['minting_executed', CollateralReservationResolution.EXECUTED],
    ['minting_payment_default', CollateralReservationResolution.DEFAULTED],
    ['collateral_reservation_deleted', CollateralReservationResolution.DELETED],
    ['-', CollateralReservationResolution.NONE]
  ],
  redemption_requested: [
    ['redemption_performed', RedemptionResolution.PERFORMED],
    ['redemption_default', RedemptionResolution.DEFAULTED],
    ['redemption_payment_blocked', RedemptionResolution.BLOCKED],
    ['redemption_payment_failed', RedemptionResolution.FAILED],
    ['redemption_rejected', RedemptionResolution.REJECTED],
    ['-', RedemptionResolution.NONE]
  ],
  transfer_to_core_vault_started: [
    ['transfer_to_core_vault_successful', TransferToCoreVaultResolution.SUCCESSFUL],
    ['transfer_to_core_vault_defaulted', TransferToCoreVaultResolution.DEFAULTED],
    ['-', TransferToCoreVaultResolution.NONE]
  ],
  return_from_core_vault_requested: [
    ['return_from_core_vault_confirmed', ReturnFromCoreVaultResolution.CONFIRMED],
    ['return_from_core_vault_cancelled', ReturnFromCoreVaultResolution.CANCELLED],
    ['-', ReturnFromCoreVaultResolution.NONE]
  ],
  underlying_withdrawal_announced: [
    ['underlying_withdrawal_confirmed', UnderlyingWithdrawalResolution.CONFIRMED],
    ['underlying_withdrawal_cancelled', UnderlyingWithdrawalResolution.CANCELLED],
    ['-', UnderlyingWithdrawalResolution.NONE]
  ]
} as Record<string, [string, number][]>

async function setResolutions(em: EntityManager) {
  for (const [k, v] of Object.entries(config)) {
    for (const [t, e] of v) {
      console.log(`processing ${t}`)
      const and = `and exists (
            select 1
            from ${t} me
            where me.${k}_evm_log_id = cr.evm_log_id
          )`
      await em.execute(`
        update ${k} cr
        set resolution = ?
        where resolution is null ${t == '-' ? '' : and}
      `, [e]);
    }
  }
}

async function main() {
  const config = new ConfigLoader()
  const context = await Context.create(config)
  const em = context.orm.em.fork()
  await setResolutions(em)
  await context.orm.close()
}

main()