import { ConfigLoader } from "fasset-indexer-core"

export class DogeConfigLoader extends ConfigLoader {

  get dogeRpcUrl(): string {
    return this.required('DOGE_RPC_URL')
  }

  get dogeRpcApiKey(): string | undefined {
    return process.env.DOGE_RPC_API_KEY
  }

  get dogeRpcUser(): string | undefined {
    return process.env.DOGE_RPC_USER
  }

  get dogeRpcPassword(): string | undefined {
    return process.env.DOGE_RPC_PASSWORD
  }

  get dogeMinBlockNumber(): number {
    return parseInt(this.required('DOGE_MIN_BLOCK_NUMBER'), 10)
  }
}