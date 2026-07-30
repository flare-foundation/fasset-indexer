import { Var } from "../orm/entities/state/var"
import { UnderlyingAddress, UnderlyingBalance } from "../orm/entities/underlying/address"
import { EVM_LOG_INDEX_SCALE } from "../config/constants"
import { ORM, SchemaUpdate } from "./interface"
import type { CreateOptions, EntityManager, EntityName, FilterQuery, RequiredEntityData } from "@mikro-orm/core"


// Encodes a log's chain position into its evm_log primary key, so that ordering
// by id equals ordering by (block_index, index). See EVM_LOG_INDEX_SCALE.
//
// Uses multiplication rather than a bit shift: JS bitwise operators truncate to
// 32 bits, and block_index << 20 overflows well before the current chain head.
export function evmLogId(blockIndex: number, logIndex: number): number {
  if (!Number.isInteger(blockIndex) || blockIndex < 0) {
    throw new Error(`invalid evm block index ${blockIndex}`)
  }
  if (!Number.isInteger(logIndex) || logIndex < 0) {
    throw new Error(`invalid evm log index ${logIndex}`)
  }
  if (logIndex >= EVM_LOG_INDEX_SCALE) {
    // Encoding this anyway would yield the id belonging to a log of the *next*
    // block. Most blocks hold no indexed logs, so it would usually not collide
    // with anything -- it would silently sort as though it came a block later.
    // Halting is the only safe response; the scale needs raising and ids
    // migrating.
    throw new Error(
      `evm log index ${logIndex} at block ${blockIndex} exceeds the id encoding `
      + `scale ${EVM_LOG_INDEX_SCALE}: EVM_LOG_INDEX_BITS must be raised and existing ids migrated`
    )
  }
  const id = blockIndex * EVM_LOG_INDEX_SCALE + logIndex
  if (!Number.isSafeInteger(id)) {
    throw new Error(`encoded evm log id ${id} for block ${blockIndex} is not a safe integer`)
  }
  return id
}

export async function updateSchema(orm: ORM, update: SchemaUpdate = "full"): Promise<void> {
  if (update === "none") return;
  const generator = orm.getSchemaGenerator();
  if (update === "recreate") {
    await generator.dropSchema();
    await generator.updateSchema();
  } else {
    await generator.updateSchema({ safe: update === "safe", wrap: false });
  }
}

export async function findOrCreateEntity<T extends object>(
  em: EntityManager,
  entityClass: EntityName<T>,
  where: FilterQuery<T>,
  opts: CreateOptions<true> = { persist: true },
  args: Partial<RequiredEntityData<T>> = {}
): Promise<T> {
  const existing = await em.findOne(entityClass, where)
  return existing != null ? existing : em.create(entityClass,
    { ...where, ...args } as RequiredEntityData<T>, opts)
}

export async function findOrCreateEntities<T extends object, K extends string & keyof T>(
  em: EntityManager,
  entityClass: EntityName<T>,
  key: K,
  values: string[]
): Promise<Map<string, T>> {
  const uniqueValues = [...new Set(values)]
  if (uniqueValues.length === 0) return new Map()
  const existing = await em.find(entityClass, { [key]: { $in: uniqueValues } } as FilterQuery<T>)
  const map = new Map<string, T>(existing.map(e => [(e as Record<K, string>)[key], e]))
  for (const value of uniqueValues) {
    if (!map.has(value)) {
      map.set(value, em.create(entityClass, { [key]: value } as RequiredEntityData<T>))
    }
  }
  return map
}

export async function setVar(em: EntityManager, key: string, value?: string): Promise<void> {
  const vr = await findOrCreateEntity(em, Var, { key }, {}, { value })
  vr.value = value
  await em.flush()
}

export async function getVar(em: EntityManager, key: string): Promise<Var | null> {
  return await em.findOne(Var, { key })
}

export async function deleteVar(em: EntityManager, key: string): Promise<void> {
  const vr = await em.findOne(Var, { key })
  if (vr) {
    em.remove(vr)
    await em.flush()
  }
}

export async function updateUnderlyingBalance(em: EntityManager, address: string, amount: bigint): Promise<UnderlyingBalance> {
  const _address = await findOrCreateEntity(em, UnderlyingAddress, { text: address })
  const _balance = await findOrCreateEntity(em, UnderlyingBalance, { address: _address }, {}, { balance: amount })
  _balance.balance = amount
  return _balance
}