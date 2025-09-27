export type ContractInfo = {
  name: string
  contractName: string
  address: string
}

export interface ConfigJson {
  events: {
    logFetchBlockBatchSize: number
    logFetchCycleSleepMs: number,
    logFetchBlockHeightOffset: number
  }
  watchdog: {
    cycleSleepMs: number
  }
  indexEvents: string[]
}

export interface ReindexConfig {
  type: "back" | "race"
  diff: string[]
  name: string
}