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
  Destination?: string
  ledger_index: number
  date: number
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

export interface IXrpAccountInfoResponse {
  result: {
    account_data: {
      Balance: string
    }
  }
}

export interface IXrpTxMeta {
  AffectedNodes: {
    ModifiedNode: {
      LedgerIndex: string
    }
  }[]
}

export interface IXrpWeirdAfTx {
  meta: IXrpTxMeta,
  tx: IXrpTransaction
}

export interface IXrpAccountTxResponse {
  result: {
    transactions: IXrpWeirdAfTx[],
    status: string
  }
}