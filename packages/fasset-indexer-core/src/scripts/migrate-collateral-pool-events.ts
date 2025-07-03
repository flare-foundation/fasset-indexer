import { Context } from "../context/context"
import { getVar, setVar } from "../orm"
import { CollateralPoolEntered, CollateralPoolExited } from "../orm/entities"
import { CollateralPoolClaimedReward, CollateralPoolPaidOut } from "../orm/entities/events/collateral-pool"
import { CPClaimedReward, CPEntered, CPExited, CPFeeDebtChanged, CPPaidOut, CPSelfCloseExited } from "../orm/entities/events/collateral-pool-v2"


const CP_MIGRATED_VAR = 'cp_migrated'

export async function migrateCollateralPoolEnterEvents(context: Context) {
  const em = context.orm.em.fork()
  const enteredEvents = await em.findAll(CollateralPoolEntered)
  for (const oldEntered of enteredEvents) {
    if (await em.findOne(CPFeeDebtChanged, { evmLog: oldEntered.evmLog })) {
      continue
    }
    await em.persistAndFlush(
      new CPFeeDebtChanged(
        oldEntered.evmLog,
        oldEntered.fasset,
        oldEntered.tokenHolder,
        oldEntered.newFAssetFeeDebt
      )
    )
    if (await em.findOne(CPEntered, { evmLog: oldEntered.evmLog })) {
      continue
    }
    await em.persistAndFlush(
      new CPEntered(
        oldEntered.evmLog,
        oldEntered.fasset,
        oldEntered.tokenHolder,
        oldEntered.amountNatWei,
        oldEntered.receivedTokensWei,
        BigInt(oldEntered.timelockExpiresAt)
      )
    )
  }
}

export async function migrateCollateralPoolExitEvents(context: Context) {
  const em = context.orm.em.fork()
  const exitedEvents = await em.findAll(CollateralPoolExited)
  for (const oldExited of exitedEvents) {
    if (oldExited.closedFAssetsUBA > 0) {
      if (!await em.findOne(CPSelfCloseExited, { evmLog: oldExited.evmLog })) {
        await em.persistAndFlush(
          new CPSelfCloseExited(
            oldExited.evmLog,
            oldExited.fasset,
            oldExited.tokenHolder,
            oldExited.burnedTokensWei,
            oldExited.receivedNatWei,
            oldExited.closedFAssetsUBA
          )
        )
      }
    } else {
      if (!await em.findOne(CPExited, { evmLog: oldExited.evmLog })) {
        await em.persistAndFlush(
          new CPExited(
            oldExited.evmLog,
            oldExited.fasset,
            oldExited.tokenHolder,
            oldExited.burnedTokensWei,
            oldExited.receivedNatWei
          )
        )
      }
    }
    if (!await em.findOne(CPFeeDebtChanged, { evmLog: oldExited.evmLog })) {
      await em.persistAndFlush(
        new CPFeeDebtChanged(
          oldExited.evmLog,
          oldExited.fasset,
          oldExited.tokenHolder,
          oldExited.newFAssetFeeDebt
        )
      )
    }
  }
}

export async function migrateCollateralPoolPaidOut(context: Context) {
  const em = context.orm.em.fork()
  const paidOutEvents = await em.findAll(CollateralPoolPaidOut)
  for (const oldPaidOut of paidOutEvents) {
    if (!await em.findOne(CPPaidOut, { evmLog: oldPaidOut.evmLog })) {
      await em.persistAndFlush(
        new CPPaidOut(
          oldPaidOut.evmLog,
          oldPaidOut.fasset,
          oldPaidOut.recipient,
          oldPaidOut.paidNatWei,
          oldPaidOut.burnedTokensWei
        )
      )
    }
  }
}

export async function migrateCollateralPoolClaimedReward(context: Context) {
  const em = context.orm.em.fork()
  const claimedRewardEvents = await em.findAll(CollateralPoolClaimedReward)
  for (const oldClaimed of claimedRewardEvents) {
    if (!await em.findOne(CPClaimedReward, { evmLog: oldClaimed.evmLog })) {
      await em.persistAndFlush(
        new CPClaimedReward(
          oldClaimed.evmLog,
          oldClaimed.fasset,
          oldClaimed.amountNatWei,
          oldClaimed.rewardType
        )
      )
    }
  }
}

export async function migrateCollateralPoolEvents(context: Context) {
  const v = await getVar(context.orm.em.fork(), CP_MIGRATED_VAR)
  if (v != null && v.value == 'true') {
    return
  }
  await migrateCollateralPoolEnterEvents(context)
  await migrateCollateralPoolExitEvents(context)
  await migrateCollateralPoolPaidOut(context)
  await migrateCollateralPoolClaimedReward(context)
  await setVar(context.orm.em.fork(), CP_MIGRATED_VAR, 'true')
}