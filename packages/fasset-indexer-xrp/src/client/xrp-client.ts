import { XrpConfigLoader } from "../config/config"
import { IXrpBlock, IXrpBlockQueryResponse, IXrpLedgerCurrentResponse, IXrpServerInfoResponse } from "./interface"

export class XrpClient {

  constructor(public readonly config: XrpConfigLoader) { }

  async block(n: number): Promise<IXrpBlock> {
    const resp = await this.getLedger(n)
    this.ensureSuccess(resp)
    return resp.result.ledger
  }

  async blockHeight(): Promise<number> {
    let current_block = 0
    if (this.config.xrpNodeIsAmendmentBlocked) {
      const resp = await this.getServerInfo()
      this.ensureSuccess(resp)
      current_block = resp.result.info.validated_ledger.seq
    } else {
      const resp = await this.getLedgerCurrent()
      this.ensureSuccess(resp)
      current_block = resp.result.ledger_current_index
    }
    return current_block
  }

  private async getLedgerCurrent(): Promise<IXrpLedgerCurrentResponse> {
    return this.request('ledger_current', [])
  }

  private async getServerInfo(): Promise<IXrpServerInfoResponse> {
    return this.request('server_info', [{}])
  }

  private async getLedger(n: number): Promise<IXrpBlockQueryResponse> {
    return this.request('ledger', [{
      id: 1,
      command: 'ledger',
      ledger_index: n,
      transactions: true,
      expand: true,
    }])
  }

  private async request(method: string, params: object): Promise<any> {
    const resp = await fetch(this.config.xrpRpcUrl, {
      method: 'POST',
      body: JSON.stringify({ method, params })
    })
    return resp.json()
  }

  private ensureSuccess(resp: { result: { status: string, error_message?: string }}): any {
    if (resp.result.status != 'success') {
      throw new Error(`rpc returned ${JSON.stringify(resp.result.error_message)}`)
    }
  }
}