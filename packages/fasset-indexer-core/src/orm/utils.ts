import { Var } from "../orm/entities/state/var"
import { UnderlyingAddress, UnderlyingBalance } from "../orm/entities/underlying/address"
import { ORM, SchemaUpdate } from "./interface"
import type { CreateOptions, EntityManager, EntityName, FilterQuery, RequiredEntityData } from "@mikro-orm/core"


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