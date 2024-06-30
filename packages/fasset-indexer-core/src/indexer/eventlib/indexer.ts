import { sleep, retryUntilSuccess } from '../../utils'
import { getVar, setVar } from '../../database/utils'
import { StateUpdater } from './state-updater'
import { EventScraper, type FullLog } from './event-scraper'
import {
  FIRST_UNHANDLED_EVENT_BLOCK, CHAIN_FETCH_RETRY_LIMIT, LOG_FETCH_SIZE,
  MID_CHAIN_FETCH_SLEEP_MS, MIN_BLOCK_NUMBER, LOG_FETCH_SLEEP_MS,
  BLOCK_HEIGHT_OFFSET
} from '../../constants'
import type { Context } from '../../context'


export class EventIndexer {
  readonly eventScraper: EventScraper
  readonly stateUpdater: StateUpdater
  private stopRequested: boolean = false

  constructor(public readonly context: Context) {
    this.eventScraper = new EventScraper(context)
    this.stateUpdater = new StateUpdater(context)
  }

  requestStop(): void {
    this.stopRequested = true
  }

  async run(startBlock?: number): Promise<void> {
    while (true) {
      if (this.stopRequested) break
      await this.runHistoric(startBlock)
      await sleep(LOG_FETCH_SLEEP_MS)
    }
  }

  async runHistoric(startBlock?: number, endBlock?: number): Promise<void> {
    const firstUnhandledBlock = await this.getFirstUnhandledBlock()
    if (startBlock === undefined || firstUnhandledBlock > startBlock) {
      startBlock = firstUnhandledBlock
    }
    if (endBlock === undefined) {
      endBlock = await this.lastBlockToHandle()
    }
    for (let i = startBlock; i <= endBlock; i += LOG_FETCH_SIZE + 1) {
      if (this.stopRequested) break
      const endLoopBlock = Math.min(endBlock, i + LOG_FETCH_SIZE)
      const logs = await this.getLogsWithRetry(i, endLoopBlock)
      await this.storeLogs(logs)
      await this.setFirstUnhandledBlock(endLoopBlock + 1)
      console.log(`Processed logs from block ${i} to block ${endLoopBlock}`)
      if (endLoopBlock !== endBlock) await sleep(MID_CHAIN_FETCH_SLEEP_MS)
    }
  }

  protected async storeLogs(logs: FullLog[]): Promise<void> {
    let lastHandledBlock: number | null = null
    for (const log of logs) {
      await this.stateUpdater.onNewEvent(log)
      if (lastHandledBlock === null || lastHandledBlock < log.blockNumber) {
        lastHandledBlock = log.blockNumber
        await this.setFirstUnhandledBlock(lastHandledBlock)
      }
    }
  }

  private async getLogsWithRetry(from: number, to: number): Promise<FullLog[]> {
    const logFetch = () => this.eventScraper.getLogs(from, to)
    return await retryUntilSuccess(logFetch, CHAIN_FETCH_RETRY_LIMIT)
  }

  private async lastBlockToHandle(): Promise<number> {
    const blockHeight = await this.context.provider.getBlockNumber()
    return blockHeight - BLOCK_HEIGHT_OFFSET
  }

  private async getFirstUnhandledBlock(): Promise<number> {
    const firstUnhandled = await getVar(this.context.orm.em.fork(), FIRST_UNHANDLED_EVENT_BLOCK)
    return firstUnhandled !== null ? parseInt(firstUnhandled!.value!) : MIN_BLOCK_NUMBER
  }

  private async setFirstUnhandledBlock(blockNumber: number): Promise<void> {
    await setVar(this.context.orm.em.fork(), FIRST_UNHANDLED_EVENT_BLOCK, blockNumber.toString())
  }

}