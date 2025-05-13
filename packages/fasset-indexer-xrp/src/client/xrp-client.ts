import { XrpConfigLoader } from "../config/config"
import { IXrpBlock, IXrpBlockQueryResponse, IXrpInfoResponse } from "./interface"

export class XrpClient {

  constructor(public readonly config: XrpConfigLoader) { }

  async block(n: number): Promise<IXrpBlock> {
    const resp = await this.getLedger(n)
    this.ensureSuccess(resp)
    return resp.result.ledger
  }

  async blockHeight(): Promise<number> {
    const resp = await this.getLedgerCurrent()
    this.ensureSuccess(resp)
    return resp.result.ledger_current_index
  }

  private async getLedgerCurrent(): Promise<IXrpInfoResponse> {
    return this.request('ledger_current', [])
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

  private ensureSuccess(resp: { result: { status: string }}): any {
    if (resp.result.status != 'success') {
      throw new Error(`rpc returned ${resp}`)
    }
  }
}