import { logger } from "../../logger"
import type { Context } from "../../context/context"
import type { FAssetIface } from "../../shared"
import type { Log } from "ethers"


interface LogUri {
  blockNumber: number
  transactionIndex: number
  index: number
}

// The narrowing an eth_getLogs request can carry: the contracts the configured
// events can be emitted by, and the topics those events hash to. Either half is
// omitted when it cannot be expressed (see below), leaving the node to return
// the wider set that EventParser then rejects.
export type LogNarrowing = {
  address?: string[]
  topics?: [string[]]
}

export class EventScraper {
  readonly narrowing: LogNarrowing

  /**
   * @param eventnames the events this scraper's indexer will store, or
   * undefined for all of them. Narrowing the fetch to exactly these is safe
   * because it is the same predicate EventParser applies first: a log whose
   * topic is not in the configured set is dropped before anything else happens.
   * The point is to stop paying for it — a back-population of one event pulls
   * every log on the chain otherwise.
   */
  constructor(public readonly context: Context, eventnames?: string[]) {
    this.narrowing = EventScraper.narrowLogs(context, eventnames)
    logger.info(`event scraper fetching logs from ${
      this.narrowing.address == null ? 'any address' : `${this.narrowing.address.length} address(es)`
    } with ${
      this.narrowing.topics == null ? 'any topic' : `${this.narrowing.topics[0].length} topic(s)`
    }`)
  }

  async getLogs(fromBlock: number, toBlock: number): Promise<Log[]> {
    const rawLogs = await this.context.provider.getLogs({ ...this.narrowing, fromBlock, toBlock })
    return rawLogs.sort(EventScraper.logOrder)
  }

  protected static narrowLogs(context: Context, eventnames?: string[]): LogNarrowing {
    const topicToIfaces = context.getTopicToIfaceMap(eventnames)
    const narrowing: LogNarrowing = {}
    const ifaces = new Set<FAssetIface>()
    for (const forTopic of topicToIfaces.values()) {
      for (const iface of forTopic) {
        ifaces.add(iface)
      }
    }
    const address = context.eventSourceAddresses(ifaces)
    if (address != null) {
      narrowing.address = address
    }
    const topics = Array.from(topicToIfaces.keys())
    // An empty set means the indexer stores nothing at all, which is not worth
    // encoding in a filter — eth_getLogs reads an empty topic array as "any".
    const maxTopics = context.config.evmLogFetchMaxFilterTopics
    if (topics.length > 0 && topics.length <= maxTopics) {
      narrowing.topics = [topics]
    } else if (topics.length > maxTopics) {
      logger.warn(`event scraper not filtering by topic: ${topics.length} topics exceeds the configured maximum ${maxTopics}`)
    }
    return narrowing
  }

  private static logOrder(log1: LogUri, log2: LogUri): number {
    if (log1.blockNumber !== log2.blockNumber) {
      return log1.blockNumber - log2.blockNumber;
    } else {
      return log1.index - log2.index;
    }
  }
}
