import { describe, it } from 'mocha'
import { expect } from 'chai'
import { BadRequestException } from '@nestjs/common'
import { EvmAddressPipe } from '../src/shared/evm-address.pipe'
import { ADDR, BAD_ADDR } from './helpers'


describe('EvmAddressPipe', () => {
  const pipe = new EvmAddressPipe()
  const optionalPipe = new EvmAddressPipe({ optional: true })

  describe('required mode', () => {
    it('returns the EIP-55 checksummed form of a lowercase address', () => {
      const out = pipe.transform(ADDR.USER.toLowerCase())
      expect(out).to.equal(ADDR.USER)
    })

    it('returns the same address when already checksummed', () => {
      expect(pipe.transform(ADDR.AGENT)).to.equal(ADDR.AGENT)
      expect(pipe.transform(ADDR.POOL)).to.equal(ADDR.POOL)
    })

    it('accepts an uppercased (post-0x) address and re-checksums it', () => {
      const upper = `0x${ADDR.USER.slice(2).toUpperCase()}`
      expect(pipe.transform(upper)).to.equal(ADDR.USER)
    })

    it('handles the zero address', () => {
      expect(pipe.transform(ADDR.ZERO)).to.equal(ADDR.ZERO)
    })

    it('throws BadRequestException for a malformed hex string', () => {
      expect(() => pipe.transform(BAD_ADDR)).to.throw(BadRequestException)
    })

    it('throws BadRequestException for an address with wrong length', () => {
      expect(() => pipe.transform('0x1234')).to.throw(BadRequestException)
    })

    it('throws BadRequestException for a string with a bad checksum (mixed case but invalid)', () => {
      // flip a single nibble case from the valid form so EIP-55 verification fails
      const flipped = ADDR.AGENT.replace(/A/, 'a')
      if (flipped === ADDR.AGENT) throw new Error('test setup did not actually flip case')
      expect(() => pipe.transform(flipped)).to.throw(BadRequestException)
    })

    it('throws BadRequestException for missing value', () => {
      expect(() => pipe.transform(undefined as any)).to.throw(BadRequestException)
      expect(() => pipe.transform('')).to.throw(BadRequestException)
    })

    it('throws BadRequestException for non-string types', () => {
      expect(() => pipe.transform(42 as any)).to.throw(BadRequestException)
      expect(() => pipe.transform({} as any)).to.throw(BadRequestException)
    })
  })

  describe('optional mode', () => {
    it('returns undefined when value is missing/empty', () => {
      expect(optionalPipe.transform(undefined as any)).to.equal(undefined)
      expect(optionalPipe.transform('')).to.equal(undefined)
      expect(optionalPipe.transform(null as any)).to.equal(undefined)
    })

    it('checksums the value when present', () => {
      expect(optionalPipe.transform(ADDR.AGENT.toLowerCase())).to.equal(ADDR.AGENT)
    })

    it('still throws for invalid non-empty values', () => {
      expect(() => optionalPipe.transform(BAD_ADDR)).to.throw(BadRequestException)
    })
  })
})
