import { getAddress } from "ethers"


// prefixes
const MINTING_PREFIX = '0x4642505266410001'
const REDEMPTION_PREFIX = '0x4642505266410002'
const WITHDRAWAL_PREFIX = '0x4642505266410003'
const RETURN_FROM_CORE_VAULT_PREFIX = '0x4642505266410004'
const REDEEM_FROM_CORE_VAULT_PREFIX = '0x4642505266410005'
const TOPUP_PREFIX = '0x4642505266410011'
const SELF_MINT_PREFIX = '0x4642505266410012'
// shifts
const TYPE_SHIFT = BigInt(192)
const LOW_BITS_MASK = (BigInt(1) << TYPE_SHIFT) - BigInt(1)
// masks
const MINTING = BigInt(MINTING_PREFIX) << TYPE_SHIFT
const REDEMPTION = BigInt(REDEMPTION_PREFIX) << TYPE_SHIFT
const ANNOUNCED_WITHDRAWAL = BigInt(WITHDRAWAL_PREFIX) << TYPE_SHIFT
const RETURN_FROM_CORE_VAULT = BigInt(RETURN_FROM_CORE_VAULT_PREFIX) << TYPE_SHIFT
const REDEMPTION_FROM_CORE_VAULT = BigInt(REDEEM_FROM_CORE_VAULT_PREFIX) << TYPE_SHIFT
const TOPUP = BigInt(TOPUP_PREFIX) << TYPE_SHIFT
const SELF_MINT = BigInt(SELF_MINT_PREFIX) << TYPE_SHIFT

function toHex(value: bigint, length: number): string {
  return `0x${value.toString(16).padStart(length * 2, "0").slice(0, length * 2)}`
}

// Callers use PaymentReference.<fn>(...) — object shape preserves the
// previous namespace API without the `no-namespace` lint error.
export const PaymentReference = {
  isValid(reference: string | null): reference is string {
    // common prefix 0x464250526641 = hex('FBPRfA' - Flare Bridge Payment Reference / fAsset)
    return reference != null && /^0x464250526641[0-9a-zA-Z]{52}$/.test(reference)
  },

  decodeType(reference: string): bigint {
    return (BigInt(reference) >> TYPE_SHIFT) & BigInt(0xffff)
  },

  decodeId(reference: string): bigint {
    return BigInt(reference) & LOW_BITS_MASK
  },

  decodeAddress(reference: string): string {
    return getAddress(toHex(PaymentReference.decodeId(reference), 20))
  },

  minting(id: number | bigint): string {
    return toHex(BigInt(id) | MINTING, 32)
  },

  redemption(id: number | bigint): string {
    return toHex(BigInt(id) | REDEMPTION, 32)
  },

  announcedWithdrawal(id: number | bigint): string {
    return toHex(BigInt(id) | ANNOUNCED_WITHDRAWAL, 32)
  },

  returnFromCoreVault(id: number | bigint): string {
    return toHex(BigInt(id) | RETURN_FROM_CORE_VAULT, 32)
  },

  redemptionFromCoreVault(id: number | bigint): string {
    return toHex(BigInt(id) | REDEMPTION_FROM_CORE_VAULT, 32)
  },

  topup(address: string): string {
    return toHex(BigInt(address) | TOPUP, 32)
  },

  selfMint(address: string): string {
    return toHex(BigInt(address) | SELF_MINT, 32)
  },

  isMint(reference: string): boolean {
    return reference.startsWith(MINTING_PREFIX)
  },

  isRedeem(reference: string): boolean {
    return reference.startsWith(REDEMPTION_PREFIX)
  },

  isWithdrawal(reference: string): boolean {
    return reference.startsWith(WITHDRAWAL_PREFIX)
  },

  isReturnFromCoreVault(reference: string): boolean {
    return reference.startsWith(RETURN_FROM_CORE_VAULT_PREFIX)
  },

  isRedeemFromCoreVault(reference: string): boolean {
    return reference.startsWith(REDEEM_FROM_CORE_VAULT_PREFIX)
  },

  isTopup(reference: string): boolean {
    return reference.startsWith(TOPUP_PREFIX)
  },

  isSelfMint(reference: string): boolean {
    return reference.startsWith(SELF_MINT_PREFIX)
  }
}
