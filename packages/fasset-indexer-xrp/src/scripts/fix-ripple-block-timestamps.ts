import { UnderlyingBlock } from "fasset-indexer-core/entities"
import { logger } from "fasset-indexer-core/logger"
import { XRP_TIMESTAMP_UNIX_OFFSET } from "../constants"
import type { XrpContext } from "../context"


const MAX_XRP_TIMESTAMP = 30 * 365 * 24 * 60 * 60 // 2030

export async function fixRippleBlockTimestamp(context: XrpContext) {
  const em = context.orm.em.fork()
  const blocks = await em.find(UnderlyingBlock, { timestamp: { $lt: MAX_XRP_TIMESTAMP } })
  for (const block of blocks) {
    block.timestamp = block.timestamp + XRP_TIMESTAMP_UNIX_OFFSET
    await em.persistAndFlush(block)
  }
  logger.info('finished fixing ripple block timestamps')
}