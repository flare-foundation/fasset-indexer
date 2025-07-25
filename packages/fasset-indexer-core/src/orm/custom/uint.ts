import { Type } from '@mikro-orm/core'


export class uint256 extends Type<bigint | null | undefined, string | null | undefined> {

  convertToDatabaseValue(value: bigint | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value.toString();
  }

  convertToJSValue(value: string | null | undefined): bigint | null {
    if (value === null || value === undefined) {
      return null;
    }
    return BigInt(value);
  }

  getColumnType() {
    return `NUMERIC(78)`; // or DECIMAL(78), depending on your DB
  }
}

export class uint64 extends uint256 {

  override getColumnType() {
    return `NUMERIC(21)`
  }
}