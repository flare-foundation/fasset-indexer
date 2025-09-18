import type { Context } from "../../context/context"
import type { Log } from "ethers"


interface LogUri {
  blockNumber: number
  transactionIndex: number
  index: number
}

export class EventScraper {

  constructor(public readonly context: Context) { }

  async getLogs(fromBlock: number, toBlock: number): Promise<Log[]> {
    const rawLogs = await this.context.provider.getLogs({ fromBlock, toBlock })
    return rawLogs.sort(EventScraper.logOrder)
  }

  private static logOrder(log1: LogUri, log2: LogUri): number {
    if (log1.blockNumber !== log2.blockNumber) {
      return log1.blockNumber - log2.blockNumber;
    } else {
      return log1.index - log2.index;
    }
  }
}