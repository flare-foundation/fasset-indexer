import { EntityManager, raw } from "@mikro-orm/knex"
import { ERC20Transfer, TokenBalance } from "../orm/entities"
import { ConfigLoader } from "../config/config"
import { Context } from "../context/context"


async function recalculateTokenBalance(em: EntityManager) {
  const tokens = await em.createQueryBuilder(ERC20Transfer, 'tr')
    .select(raw('el.address_id as address'), true)
    .join('evmLog', 'el')
    .execute() as { address: number }[]
  for (const { address } of tokens) {
    const transferred = await em.createQueryBuilder(ERC20Transfer, 'et')
      .select([raw('et.from_id as from'), raw('sum(et.value) as value')])
      .groupBy('et.from')
      .join('evmLog', 'el')
      .join('el.address', 'ea')
      .where({ 'el.address': address })
      .execute() as { from: number, value: string }[]
    console.log(`${address}: accounting ${transferred.length} transfers`)
    for (const { from, value } of transferred) {
      await em.execute('UPDATE token_balance tb SET amount = ? WHERE token_id = ? AND tb.holder_id = ?', [-BigInt(value), address, from])
    }
    const received = await em.createQueryBuilder(ERC20Transfer, 'et')
      .select([raw('et.to_id as to'), raw('sum(et.value) as value')])
      .groupBy('et.to')
      .join('evmLog', 'el')
      .join('el.address', 'ea')
      .where({ 'el.address': address })
      .execute() as { to: number, value: string }[]
    console.log(`${address}: accounting ${transferred.length} receivals`)
    for (const { to, value } of received) {
      await em.execute('UPDATE token_balance tb SET amount = amount + ? WHERE tb.token_id = ? AND tb.holder_id = ?', [BigInt(value), address, to])
    }
  }
}

async function main() {
  const config = new ConfigLoader()
  const context = await Context.create(config)
  await recalculateTokenBalance(context.orm.em.fork())
  await context.orm.close()
}

main()