
export namespace PaymentReference {
    export const TYPE_SHIFT = BigInt(192)
    export const LOW_BITS_MASK = (BigInt(1) << TYPE_SHIFT) - BigInt(1)
    // common prefix 0x464250526641 = hex('FBPRfA' - Flare Bridge Payment Reference / fAsset)

    export function isValid(reference: string | null): reference is string {
        return reference != null && /^0x464250526641[0-9a-zA-Z]{52}$/.test(reference)
    }

    export function decodeId(reference: string) {
        return BigInt(reference) & LOW_BITS_MASK
    }

    export function decodeType(reference: string) {
        return (BigInt(reference) >> TYPE_SHIFT) & BigInt(0xffff)
    }
}
