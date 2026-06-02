import type { FAssetIface } from "../../shared"

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

// Decoded log args are a runtime-shaped tuple/object whose exact form depends
// on the event ABI; each handler narrows to its concrete typechain OutputTuple.
// Typing this as a discriminated union would require keying every event in the
// system at this boundary, which is bigger than this seam wants to be.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventArgs = any

export interface Event {
  topic: string
  name: string
  args: EventArgs
  source: string
  sourcename: FAssetIface
  index: number
  transaction: Transaction
  block: Block
}