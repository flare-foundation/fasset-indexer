import { ConfigLoader } from "fasset-indexer-core"

export class XrpConfigLoader extends ConfigLoader {

  get xrpRpcUrl(): string {
    return this.required('XRP_RPC_URL')
  }

  get xrpRpcApiKey(): string | undefined {
    return process.env.XRP_RPC_API_KEY
  }

  get xrpMinBlockNumber(): number {
    return parseInt(this.required('XRP_MIN_BLOCK_NUMBER'))
  }

  get xrpNodeIsAmendmentBlocked(): boolean {
    return process.env.XRP_RPC_AMENDMENT_BLOCKED === "true"
  }

  get xrpMonitoredAddresses(): string[] {
    const addresses = process.env.XRP_MONITORED_ADDRESSES
    return (addresses != null) ? addresses.split(',') : []
  }
}