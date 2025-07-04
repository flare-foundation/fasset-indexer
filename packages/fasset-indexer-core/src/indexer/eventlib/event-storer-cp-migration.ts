import { CollateralPoolEntered, CollateralPoolExited } from "../../orm/entities"
import { CollateralPoolClaimedReward, CollateralPoolPaidOut } from "../../orm/entities/events/collateral-pool"
import {
  CPClaimedReward, CPEntered, CPExited, CPFeeDebtChanged,
  CPFeeDebtPaid, CPFeesWithdrawn, CPPaidOut, CPSelfCloseExited
} from "../../orm/entities/events/collateral-pool-v2"


export class EventStorerCpMigration {

  static migrateCollateralPoolEntered(entered: CollateralPoolEntered): [CPEntered, CPFeeDebtChanged, CPFeeDebtPaid] {
    return [
      new CPEntered(
        entered.evmLog,
        entered.fasset,
        entered.tokenHolder,
        entered.amountNatWei,
        entered.receivedTokensWei,
        BigInt(entered.timelockExpiresAt)
      ),
      new CPFeeDebtChanged(
        entered.evmLog,
        entered.fasset,
        entered.tokenHolder,
        entered.newFAssetFeeDebt
      ),
      new CPFeeDebtPaid(
        entered.evmLog,
        entered.fasset,
        entered.tokenHolder,
        entered.addedFAssetFeeUBA
      )
    ]
  }

  static migrateCollateralPoolExited(exited: CollateralPoolExited): [
    CPSelfCloseExited | CPExited, CPFeeDebtChanged, CPFeesWithdrawn
  ] {
    return [
      (exited.closedFAssetsUBA > 0) ? new CPSelfCloseExited(
        exited.evmLog,
        exited.fasset,
        exited.tokenHolder,
        exited.burnedTokensWei,
        exited.receivedNatWei,
        exited.closedFAssetsUBA
      ) : new CPExited(
        exited.evmLog,
        exited.fasset,
        exited.tokenHolder,
        exited.burnedTokensWei,
        exited.receivedNatWei
      ), new CPFeeDebtChanged(
        exited.evmLog,
        exited.fasset,
        exited.tokenHolder,
        exited.newFAssetFeeDebt
      ), new CPFeesWithdrawn(
        exited.evmLog,
        exited.fasset,
        exited.tokenHolder,
        exited.receivedFAssetFeesUBA
      )
    ]
  }

  static migrateCollateralPoolPaidOut(paidOut: CollateralPoolPaidOut): [CPPaidOut] {
    return [new CPPaidOut(
      paidOut.evmLog,
      paidOut.fasset,
      paidOut.recipient,
      paidOut.paidNatWei,
      paidOut.burnedTokensWei
    )]
  }

  static migrateCollateralPoolClaimedReward(claimed: CollateralPoolClaimedReward): [CPClaimedReward] {
    return [new CPClaimedReward(
      claimed.evmLog,
      claimed.fasset,
      claimed.amountNatWei,
      claimed.rewardType
    )]
  }

}