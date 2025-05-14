export interface IXrpBlockQueryResponse {
  result: {
    ledger: IXrpBlock
    status: string
  }
}

export interface IXrpBlock {
  close_time: number
  transactions: IXrpTransaction[]
  ledger_hash: string
  ledger_index: number
}

export interface IXrpTransaction {
  Account: string
  Amount?: string
  Fee: string
  Memos?: IXrpMemo[]
  Sequence: number
  hash: string
  TransactionResult: string
}

export interface IXrpMemo {
  Memo: {
    MemoData: string
    MemoType: string
  }
}

export interface IXrpLedgerCurrentResponse {
  result: {
    ledger_current_index: number
    status: string
  }
}

export interface IXrpServerInfoResponse {
  result: {
    info: {
      validated_ledger: {
        seq: number
      }
    }
    status: string
  }
}