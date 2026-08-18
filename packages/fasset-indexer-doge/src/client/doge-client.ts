import type { IDogeBlock, IDogeTx } from "./interface"

export class DogeClient {
  private _authorization: string | undefined

  constructor(
    public readonly rpcUrl: string,
    public readonly user?: string,
    public readonly password?: string,
    public readonly apiKey?: string
  ) { }

  async blockHeight(): Promise<number> {
    const res = await this.call<{ result: number }>('getblockcount', [])
    return res.result
  }

  async block(id: number | string): Promise<IDogeBlock> {
    if (typeof id === 'number') {
      return this.blockFromHeight(id)
    } else {
      return this.blockFromHash(id)
    }
  }

  async transaction(tx: string): Promise<IDogeTx> {
    const res = await this.call<{ result: IDogeTx }>('getrawtransaction', [tx, true])
    return res.result
  }

  async blockHash(height: number): Promise<string> {
    const res = await this.call<{ result: string }>('getblockhash', [height])
    return res.result
  }

  protected async blockFromHash(hash: string): Promise<IDogeBlock> {
    const res = await this.call<{ result: IDogeBlock }>('getblock', [hash])
    return res.result
  }

  protected async blockFromHeight(height: number): Promise<IDogeBlock> {
    const hash = await this.blockHash(height)
    return this.blockFromHash(hash)
  }

  protected async call<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: "getblock.io"
      })
    })
    return await res.json()
  }

  protected get headers(): Record<string, string> {
    if (this._authorization == null && this.user && this.password) {
      this._authorization = this.basicAuthHeader(this.user, this.password)
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': this._authorization ?? '',
      'x-apikey': this.apiKey ?? ''
    }
  }

  private basicAuthHeader(user: string, pass: string): string {
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
  }
}