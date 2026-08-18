import { ConfigLoader } from "fasset-indexer-core"


export class BtcConfigLoader extends ConfigLoader {

  get btcRpcUrl(): string {
    return this.required('BTC_RPC_URL')
  }

  get btcRpcApiKey(): string | undefined {
    return process.env.BTC_RPC_API_KEY
  }

  get btcRpcUser(): string | undefined {
    return process.env.BTC_RPC_USER
  }

  get btcRpcPassword(): string | undefined {
    return process.env.BTC_RPC_PASSWORD
  }

  get btcMinBlockNumber(): number {
    return parseInt(this.required('BTC_MIN_BLOCK_NUMBER'), 10)
  }
}