import { Var } from "../orm/entities/state/var"
import { UnderlyingAddress, UnderlyingBalance } from "../orm/entities/underlying/address"
import type { EntityManager } from "@mikro-orm/core"
import { ORM, SchemaUpdate, AddressType } from "./interface"
import { UnderlyingBlock, UnderlyingTransaction } from "./entities";


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

export async function setVar(em: EntityManager, key: string, value?: string): Promise<void> {
  const vr = await em.findOne(Var, { key })
  if (!vr) {
    const vr = new Var(key, value)
    em.persist(vr)
  } else {
    vr.value = value
  }
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

export async function findOrCreateUnderlyingAddress(em: EntityManager, address: string, type: AddressType): Promise<UnderlyingAddress> {
  let underlyingAddress = await em.findOne(UnderlyingAddress, { text: address })
  if (!underlyingAddress) {
    underlyingAddress = new UnderlyingAddress(address, type)
    em.persist(underlyingAddress)
  }
  return underlyingAddress
}

export async function findOrCreateUnderlyingTransaction(
  em: EntityManager, hash: string, block: UnderlyingBlock, value: bigint,
  source: UnderlyingAddress, target?: UnderlyingAddress
): Promise<UnderlyingTransaction> {
  let underlyingTransaction = await em.findOne(UnderlyingTransaction, { hash })
  if (!underlyingTransaction) {
    underlyingTransaction = new UnderlyingTransaction(block, hash, value, source, target)
    em.persist(underlyingTransaction)
  }
  return underlyingTransaction
}

export async function updateUnderlyingBalance(em: EntityManager, address: string, amount: bigint): Promise<UnderlyingBalance> {
  let balance = await em.findOne(UnderlyingBalance, { address: { text: address } })
  if (balance == null) {
    const _address = await findOrCreateUnderlyingAddress(em, address, AddressType.USER)
    balance = new UnderlyingBalance(_address, amount)
  } else {
    balance.balance = amount
  }
  em.persist(balance)
  return balance
}