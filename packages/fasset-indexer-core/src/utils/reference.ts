import { getAddress } from "ethers"

export namespace PaymentReference {
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

  export function isValid(reference: string | null): reference is string {
    // common prefix 0x464250526641 = hex('FBPRfA' - Flare Bridge Payment Reference / fAsset)
    return reference != null && /^0x464250526641[0-9a-zA-Z]{52}$/.test(reference)
  }

  export function decodeType(reference: string) {
    return (BigInt(reference) >> TYPE_SHIFT) & BigInt(0xffff)
  }

  export function decodeId(reference: string) {
    return BigInt(reference) & LOW_BITS_MASK
  }

  export function decodeAddress(reference: string) {
    return getAddress(toHex(decodeId(reference), 20))
  }

  export function minting(id: number | bigint) {
    return toHex(BigInt(id) | MINTING, 32);
  }

  export function redemption(id: number | bigint) {
    return toHex(BigInt(id) | REDEMPTION, 32);
  }

  export function announcedWithdrawal(id: number | bigint) {
    return toHex(BigInt(id) | ANNOUNCED_WITHDRAWAL, 32);
  }

  export function returnFromCoreVault(id: number | bigint) {
    return toHex(BigInt(id) | RETURN_FROM_CORE_VAULT, 32);
  }

  export function redemptionFromCoreVault(id: number | bigint) {
    return toHex(BigInt(id) | REDEMPTION_FROM_CORE_VAULT, 32);
  }

  export function topup(address: string) {
    return toHex(BigInt(address) | TOPUP, 32);
  }

  export function selfMint(address: string) {
    return toHex(BigInt(address) | SELF_MINT, 32);
  }

  export function isMint(reference: string): boolean {
    return reference.startsWith(MINTING_PREFIX)
  }

  export function isRedeem(reference: string): boolean {
    return reference.startsWith(REDEMPTION_PREFIX)
  }

  export function isWithdrawal(reference: string): boolean {
    return reference.startsWith(WITHDRAWAL_PREFIX)
  }

  export function isReturnFromCoreVault(reference: string): boolean {
    return reference.startsWith(RETURN_FROM_CORE_VAULT_PREFIX)
  }

  export function isRedeemFromCoreVault(reference: string): boolean {
    return reference.startsWith(REDEEM_FROM_CORE_VAULT_PREFIX)
  }

  export function isTopup(reference: string): boolean {
    return reference.startsWith(TOPUP_PREFIX)
  }

  export function isSelfMint(reference: string): boolean {
    return reference.startsWith(SELF_MINT_PREFIX)
  }

  function toHex(value: bigint, length: number): string {
    return "0x" + value.toString(16).padStart(length * 2, "0").slice(0, length * 2);
  }

}