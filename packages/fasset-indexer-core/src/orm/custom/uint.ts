import { Type } from '@mikro-orm/core'


type Nullable<T> = T | null | undefined

export class uint256 extends Type<Nullable<bigint>, Nullable<string>> {

  convertToDatabaseValue(value: Nullable<bigint>): string | null {
    if (value === null || value === undefined) {
      return null
    }
    return value.toString()
  }

  convertToJSValue(value: Nullable<string>): bigint | null {
    if (value === null || value === undefined) {
      return null
    }
    return BigInt(value)
  }

  getColumnType() {
    return `NUMERIC(78)`
  }
}

export class uint64 extends uint256 {

  override getColumnType() {
    return `NUMERIC(21)`
  }
}