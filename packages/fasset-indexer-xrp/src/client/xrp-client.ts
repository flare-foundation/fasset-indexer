import { XrpConfigLoader } from "../config/config"
import type {
  IXrpAccountInfoResponse, IXrpAccountTxResponse,
  IXrpBlock, IXrpBlockQueryResponse,
  IXrpLedgerCurrentResponse, IXrpServerInfoResponse,
  IXrpTransaction,
  IXrpWeirdAfTx
} from "./interface"

export class XrpClient {

  constructor(public readonly config: XrpConfigLoader) { }

  async block(n: number): Promise<IXrpBlock> {
    const resp = await this.getLedger(n)
    this.ensureSuccess(resp)
    return resp.result.ledger
  }

  async transaction(hash: string): Promise<IXrpTransaction> {
    const resp = await this.request('tx', [{
      transaction: hash,
      binary: false
    }])
    this.ensureSuccess(resp)
    return resp.result
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

  async balanceOf(account: string): Promise<bigint> {
    const resp = await this.getAccountInfo(account)
    return BigInt(resp.result.account_data.Balance)
  }

  async accountTxs(account: string, startIndex: number, endIndex: number, limit: number): Promise<IXrpWeirdAfTx[]> {
    const resp = await this.getAccountTxs(account, startIndex, endIndex, limit)
    this.ensureSuccess(resp)
    return resp.result.transactions
  }

  async getAccountTxs(account: string, startIndex: number, endIndex: number, limit: number): Promise<IXrpAccountTxResponse> {
    return this.request('account_tx', [{
      'account': account,
      'ledger_index_min': startIndex,
      'ledger_index_max': endIndex,
      'limit': limit
    }])
  }

  private async getAccountInfo(account: string): Promise<IXrpAccountInfoResponse> {
    return this.request('account_info', [{ account, ledger_index: 'validated' }])
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
