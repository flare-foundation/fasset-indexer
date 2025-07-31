import { CollateralPoolEntered, CollateralPoolExited } from "../../../orm/entities"
import { CollateralPoolClaimedReward, CollateralPoolPaidOut } from "../../../orm/entities/events/collateral-pool"
import {
  CPClaimedReward, CPEntered, CPExited, CPFeeDebtChanged,
  CPFeeDebtPaid, CPFeesWithdrawn, CPPaidOut, CPSelfCloseExited
} from "../../../orm/entities/events/collateral-pool-v2"
import type { EntityManager } from "@mikro-orm/knex"


export class CollateralPoolEventMigration {

  static migrateCollateralPoolEntered(em: EntityManager, entered: CollateralPoolEntered): [CPEntered, CPFeeDebtChanged, CPFeeDebtPaid] {
    return [
      em.create(CPEntered, {
        evmLog: entered.evmLog,
        fasset: entered.fasset,
        tokenHolder: entered.tokenHolder,
        amountNatWei: entered.amountNatWei,
        timelockExpiresAt: BigInt(entered.timelockExpiresAt),
        receivedTokensWei: entered.receivedTokensWei
      }),
      em.create(CPFeeDebtChanged, {
        evmLog: entered.evmLog,
        fasset: entered.fasset,
        tokenHolder: entered.tokenHolder,
        newFeeDebtUBA: entered.newFAssetFeeDebt
      }),
      em.create(CPFeeDebtPaid, {
        evmLog: entered.evmLog,
        fasset: entered.fasset,
        tokenHolder: entered.tokenHolder,
        paidFeesUBA: entered.addedFAssetFeeUBA
      })
    ]
  }

  static migrateCollateralPoolExited(em: EntityManager, exited: CollateralPoolExited): [
    CPSelfCloseExited | CPExited, CPFeeDebtChanged, CPFeesWithdrawn
  ] {
    return [
      (exited.closedFAssetsUBA > 0) ? em.create(CPSelfCloseExited, {
        evmLog: exited.evmLog,
        fasset: exited.fasset,
        tokenHolder: exited.tokenHolder,
        burnedTokensWei: exited.burnedTokensWei,
        receivedNatWei: exited.receivedNatWei,
        closedFAssetsUBA: exited.closedFAssetsUBA
      }) : em.create(CPExited, {
        evmLog: exited.evmLog,
        fasset: exited.fasset,
        tokenHolder: exited.tokenHolder,
        burnedTokensWei: exited.burnedTokensWei,
        receivedNatWei: exited.receivedNatWei
      }), em.create(CPFeeDebtChanged, {
        evmLog: exited.evmLog,
        fasset: exited.fasset,
        tokenHolder: exited.tokenHolder,
        newFeeDebtUBA: exited.newFAssetFeeDebt
      }), em.create(CPFeesWithdrawn, {
        evmLog: exited.evmLog,
        fasset: exited.fasset,
        tokenHolder: exited.tokenHolder,
        withdrawnFeesUBA: exited.receivedFAssetFeesUBA
      })
    ]
  }

  static migrateCollateralPoolPaidOut(em: EntityManager, paidOut: CollateralPoolPaidOut): [CPPaidOut] {
    return [em.create(CPPaidOut, {
      evmLog: paidOut.evmLog,
      fasset: paidOut.fasset,
      recipient: paidOut.recipient,
      paidNatWei: paidOut.paidNatWei,
      burnedTokensWei: paidOut.burnedTokensWei
    })]
  }

  static migrateCollateralPoolClaimedReward(em: EntityManager, claimed: CollateralPoolClaimedReward): [CPClaimedReward] {
    return [em.create(CPClaimedReward, {
      evmLog: claimed.evmLog,
      fasset: claimed.fasset,
      amountNatWei: claimed.amountNatWei,
      rewardType: claimed.rewardType
    })]
  }

}