import { CollateralPoolEventMigration } from "../indexer/eventlib/migrations/collateral-pool-migrations"
import { CollateralPoolEntered, CollateralPoolExited } from "../orm/entities"
import { CollateralPoolClaimedReward, CollateralPoolPaidOut } from "../orm/entities/events/collateral-pool"
import { logger } from "../logger"
import type { EntityManager } from "@mikro-orm/knex"


async function migrateCollateralPoolEnterEvents(em: EntityManager) {
  const enteredEvents = await em.findAll(CollateralPoolEntered)
  for (const entered of enteredEvents) {
    await em.transactional(em => {
      const ents = CollateralPoolEventMigration.migrateCollateralPoolEntered(entered)
      em.persist(ents)
      em.remove(entered)
    })
  }
}

async function migrateCollateralPoolExitEvents(em: EntityManager) {
  const exitedEvents = await em.findAll(CollateralPoolExited)
  for (const exited of exitedEvents) {
    await em.transactional(em => {
      const ents = CollateralPoolEventMigration.migrateCollateralPoolExited(exited)
      em.persist(ents)
      em.remove(exited)
    })
  }
}

async function migrateCollateralPoolPaidOut(em: EntityManager) {
  const paidOutEvents = await em.findAll(CollateralPoolPaidOut)
  for (const paidOut of paidOutEvents) {
    await em.transactional(em => {
      const ents = CollateralPoolEventMigration.migrateCollateralPoolPaidOut(paidOut)
      em.persist(ents)
      em.remove(paidOut)
    })
  }
}

async function migrateCollateralPoolClaimedReward(em: EntityManager) {
  const claimedRewardEvents = await em.findAll(CollateralPoolClaimedReward)
  for (const claimed of claimedRewardEvents) {
    await em.transactional(em => {
      const ents = CollateralPoolEventMigration.migrateCollateralPoolClaimedReward(claimed)
      em.persist(ents)
      em.remove(claimed)
    })
  }
}

export async function migrateCollateralPoolEvents(em: EntityManager) {
  await migrateCollateralPoolEnterEvents(em)
  logger.info('migrated collateral pool enter events')
  await migrateCollateralPoolExitEvents(em)
  logger.info('migrated collateral pool exit events')
  await migrateCollateralPoolPaidOut(em)
  logger.info('migrated collateral pool paid out events')
  await migrateCollateralPoolClaimedReward(em)
  logger.info('migrated collateral pool claimed reward events')
}