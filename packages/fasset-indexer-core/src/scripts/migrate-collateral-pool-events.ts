import { EventStorerCpMigration } from "../indexer/eventlib/event-storer-cp-migration"
import { getVar, setVar } from "../orm"
import { CollateralPoolEntered, CollateralPoolExited } from "../orm/entities"
import { CollateralPoolClaimedReward, CollateralPoolPaidOut } from "../orm/entities/events/collateral-pool"
import type { EntityManager } from "@mikro-orm/knex"


const CP_MIGRATED_VAR = 'cp_migrated'

export async function migrateCollateralPoolEnterEvents(em: EntityManager) {
  const enteredEvents = await em.findAll(CollateralPoolEntered)
  for (const entered of enteredEvents) {
    await em.transactional(em => {
      const ents = EventStorerCpMigration.migrateCollateralPoolEntered(entered)
      em.persist(ents)
      em.remove(entered)
    })
  }
}

export async function migrateCollateralPoolExitEvents(em: EntityManager) {
  const exitedEvents = await em.findAll(CollateralPoolExited)
  for (const exited of exitedEvents) {
    await em.transactional(em => {
      const ents = EventStorerCpMigration.migrateCollateralPoolExited(exited)
      em.persist(ents)
      em.remove(exited)
    })
  }
}

export async function migrateCollateralPoolPaidOut(em: EntityManager) {
  const paidOutEvents = await em.findAll(CollateralPoolPaidOut)
  for (const paidOut of paidOutEvents) {
    await em.transactional(em => {
      const ents = EventStorerCpMigration.migrateCollateralPoolPaidOut(paidOut)
      em.persist(ents)
      em.remove(paidOut)
    })
  }
}

export async function migrateCollateralPoolClaimedReward(em: EntityManager) {
  const claimedRewardEvents = await em.findAll(CollateralPoolClaimedReward)
  for (const claimed of claimedRewardEvents) {
    await em.transactional(em => {
      const ents = EventStorerCpMigration.migrateCollateralPoolClaimedReward(claimed)
      em.persist(ents)
      em.remove(claimed)
    })
  }
}

export async function migrateCollateralPoolEvents(em: EntityManager) {
  /* const v = await getVar(context.orm.em.fork(), CP_MIGRATED_VAR)
  if (v != null && v.value == 'true') {
    return
  } */
  await migrateCollateralPoolEnterEvents(em)
  await migrateCollateralPoolExitEvents(em)
  await migrateCollateralPoolPaidOut(em)
  await migrateCollateralPoolClaimedReward(em)
  //await setVar(context.orm.em.fork(), CP_MIGRATED_VAR, 'true')
}