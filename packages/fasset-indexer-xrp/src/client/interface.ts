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

export interface IXrpIssuedAmount {
  currency: string
  issuer: string
  value: string
}

export interface IXrpMptAmount {
  mpt_issuance_id: string
  value: string
}

// drops of xrp as a decimal string, or a token amount object
export type IXrpAmount = string | IXrpIssuedAmount | IXrpMptAmount

// a transaction whose amount is xrp itself, so denominated in drops
export type IXrpNativeTransaction = IXrpTransaction & { Amount?: string }

export interface IXrpTransaction {
  Account: string
  Amount?: IXrpAmount
  Fee: string
  Memos?: IXrpMemo[]
  Sequence: number
  hash: string
  metaData?: {
    TransactionResult: string
  }
  meta?: {
    TransactionResult: string
  }
  Destination?: string
  DestinationTag?: number
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