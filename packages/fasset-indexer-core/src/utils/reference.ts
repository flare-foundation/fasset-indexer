export namespace PaymentReference {
  export const TYPE_SHIFT = BigInt(192)
  export const LOW_BITS_MASK = (BigInt(1) << TYPE_SHIFT) - BigInt(1)
  export const SELF_MINT = BigInt('0x4642505266410012') << TYPE_SHIFT

  export function isValid(reference: string | null): reference is string {
    // common prefix 0x464250526641 = hex('FBPRfA' - Flare Bridge Payment Reference / fAsset)
    return reference != null && /^0x464250526641[0-9a-zA-Z]{52}$/.test(reference)
  }

  export function decodeId(reference: string) {
    return BigInt(reference) & LOW_BITS_MASK
  }

  export function decodeType(reference: string) {
    return (BigInt(reference) >> TYPE_SHIFT) & BigInt(0xffff)
  }

  export function selfMint(address: string): string {
    const addrBigInt = BigInt(address.toLowerCase())
    const combined = addrBigInt | SELF_MINT
    return toHex(combined, 32)
  }

  export function isSelfMint(reference: string): boolean {
    return reference.startsWith('0x4642505266410012')
  }

  function toHex(value: bigint, length: number): string {
    return "0x" + value.toString(16).padStart(length * 2, "0");
  }

}
