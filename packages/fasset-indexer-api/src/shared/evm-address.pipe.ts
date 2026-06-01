import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import { getAddress, isAddress } from 'ethers'


export interface EvmAddressPipeOptions {
  optional?: boolean
}

@Injectable()
export class EvmAddressPipe implements PipeTransform<string | undefined, string | undefined> {
  private readonly optional: boolean

  constructor(options: EvmAddressPipeOptions = {}) {
    this.optional = options.optional ?? false
  }

  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === null || value === '') {
      if (this.optional) return undefined
      throw new BadRequestException('Missing required EVM address')
    }
    if (typeof value !== 'string' || !isAddress(value)) {
      throw new BadRequestException(`Invalid EVM address: ${String(value)}`)
    }
    return getAddress(value)
  }
}
