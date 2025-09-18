export interface Block {
  index: number
  timestamp: number
}

export interface Transaction {
  hash: string
  index: number
  source: string
  nonce: number
  target: string | null
  gasUsed: bigint
  gasPrice: bigint
  gasLimit: bigint
  value: bigint
  type: number
}

export type EventArgs = any

export interface Event {
  topic: string
  name: string
  args: EventArgs
  source: string
  index: number
  transaction: Transaction
  block: Block
}