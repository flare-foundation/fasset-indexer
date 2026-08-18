import { readFileSync } from "fs"
import { resolve } from "node:path"
import { describe, before, beforeEach, after, it } from "mocha"
import { expect } from "chai"
import { evmLogId } from "../src/orm/utils"
import { EVENTS } from "../src/config/constants"
import { Context } from "../src/context/context"
import { EventStorer } from "../src/indexer/eventlib/store-logic/event-storer"
import { EventFixture } from "./fixtures/events/event"
import { atPosition } from "./fixtures/utils"
import { createTestContext, resetDatabase } from "./fixtures/db"
import type { ORM } from "../src/orm/interface"

const ASSET_MANAGER_FXRP = "AssetManager_FTestXRP"
const MIGRATION = readFileSync(
  resolve(__dirname, "../migrations/001-encode-evm-log-ids.sql"), "utf8")

// The columns the migration will rewrite, found the same way it finds them:
// by walking the foreign-key graph out from evm_log.id.
const DISCOVER_COLUMNS = `
WITH RECURSIVE cols AS (
  SELECT 'evm_log'::regclass AS rel, 'id'::name AS col
  UNION
  SELECT con.conrelid::regclass, child.attname
  FROM pg_constraint con
  JOIN unnest(con.conkey)  WITH ORDINALITY AS k(attnum, ord)  ON true
  JOIN unnest(con.confkey) WITH ORDINALITY AS rk(attnum, ord) ON rk.ord = k.ord
  JOIN pg_attribute child  ON child.attrelid  = con.conrelid  AND child.attnum  = k.attnum
  JOIN pg_attribute parent ON parent.attrelid = con.confrelid AND parent.attnum = rk.attnum
  JOIN cols ON con.confrelid = cols.rel AND parent.attname = cols.col
  WHERE con.contype = 'f'
)
SELECT rel::text AS table_name, col::text AS column_name FROM cols ORDER BY 1, 2
`

type Column = { table_name: string, column_name: string }
// column -> the chain positions its rows point at, as "block:index"
type Relationships = Record<string, string[]>

async function columns(orm: ORM): Promise<Column[]> {
  return await orm.em.getConnection().execute(DISCOVER_COLUMNS) as Column[]
}

// Resolve every evm_log reference in the schema to the chain position it points
// at. Comparing this before and after proves the rewrite preserved relationships,
// not merely that the foreign keys still validate.
async function relationships(orm: ORM, cols: Column[]): Promise<Relationships> {
  const conn = orm.em.getConnection()
  const out: Relationships = {}
  for (const { table_name, column_name } of cols) {
    const rows = await conn.execute(
      `SELECT l.block_index AS b, l."index" AS i
         FROM "${table_name}" c JOIN evm_log l ON l.id = c."${column_name}"
        ORDER BY 1, 2`) as { b: number, i: number }[]
    if (rows.length > 0) out[`${table_name}.${column_name}`] = rows.map(r => `${r.b}:${r.i}`)
  }
  return out
}

// Put the database back the way it looked before this change: ids drawn from a
// sequence in insertion order, held in int4 columns. `order` lists the encoded
// ids in the order the events were processed, so position N becomes id N.
async function downgradeToSequentialIds(orm: ORM, order: number[]): Promise<void> {
  const conn = orm.em.getConnection()
  const values = order.map((encoded, i) => `(${encoded}, ${i + 1})`).join(', ')

  // One statement, so it is one transaction: the renumbering has to land with
  // foreign keys deferred, because parent and children cannot move together.
  await conn.execute(`
DO $$
DECLARE r record;
BEGIN
  CREATE TEMP TABLE down_map (new_id bigint PRIMARY KEY, old_id bigint NOT NULL);
  INSERT INTO down_map VALUES ${values};

  FOR r IN SELECT con.conname, con.conrelid::regclass AS tbl
           FROM pg_constraint con WHERE con.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED',
                   r.tbl, r.conname);
  END LOOP;

  FOR r IN ${DISCOVER_COLUMNS.trim().replace(/\n/g, '\n    ')}
  LOOP
    EXECUTE format('UPDATE %I t SET %I = m.old_id FROM down_map m WHERE t.%I = m.new_id',
                   r.table_name, r.column_name, r.column_name);
  END LOOP;

  DROP TABLE down_map;
END $$;`)

  // Separate statement: a table with pending deferred trigger events cannot be
  // altered, so the narrowing has to wait for the transaction above to commit.
  await conn.execute(`
DO $$
DECLARE r record;
BEGIN
  FOR r IN ${DISCOVER_COLUMNS.trim().replace(/\n/g, '\n    ')}
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE integer', r.table_name, r.column_name);
  END LOOP;
  CREATE SEQUENCE evm_log_id_seq OWNED BY evm_log.id;
  PERFORM setval('evm_log_id_seq', (SELECT max(id) FROM evm_log));
  ALTER TABLE evm_log ALTER COLUMN id SET DEFAULT nextval('evm_log_id_seq');
END $$;`)
}

describe("migration 001: encode evm log ids", () => {
  let context: Context
  let fixture: EventFixture
  let storer: EventStorer

  before(async () => {
    context = await createTestContext()
  })

  beforeEach(async () => {
    await resetDatabase(context.orm)
    fixture = new EventFixture(context.orm)
    storer = new EventStorer(context.orm, context)
  })

  after(async () => {
    await context.orm.close(true)
  })

  // Blocks are deliberately out of order relative to processing order: the
  // redemption pair is back-populated behind the minting pair, which is what
  // made an autoincrement key sort them wrongly in the first place.
  const PLAN: [string, number, number][] = [
    [EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED,  5_000_000, 3],
    [EVENTS.ASSET_MANAGER.MINTING_EXECUTED,     5_000_100, 0],
    [EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED,     1_000, 7],
    [EVENTS.ASSET_MANAGER.REDEMPTION_PERFORMED,     1_100, 2],
    [EVENTS.ERC20.TRANSFER,                     9_000_000, 1],
    [EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED,     50_000, 0],
  ]

  async function populate(): Promise<number[]> {
    await fixture.storeInitialAgents()
    const assetManager = context.requireContractAddress(ASSET_MANAGER_FXRP)
    const order: number[] = []
    for (const [name, block, index] of PLAN) {
      const event = atPosition(
        await fixture.generateEvent(name as any, assetManager), block, index)
      await storer.processEvent(event)
      order.push(evmLogId(block, index))
    }
    return order
  }

  it("restores the encoded ids the indexer would have written", async () => {
    const order = await populate()
    const cols = await columns(context.orm)
    // sanity: the schema really does have the cross-event references we care about
    expect(cols.length).to.be.greaterThan(50)
    expect(cols.map(c => `${c.table_name}.${c.column_name}`))
      .to.include('minting_executed.collateral_reserved_evm_log_id')

    await downgradeToSequentialIds(context.orm, order)

    // precondition: we really are back on sequential ids
    const conn = context.orm.em.getConnection()
    const pre = await conn.execute('SELECT id FROM evm_log ORDER BY id') as { id: string }[]
    expect(pre.map(r => Number(r.id))).to.deep.equal(order.map((_, i) => i + 1))

    await conn.execute(MIGRATION)

    const post = await conn.execute(
      'SELECT id, block_index, "index" FROM evm_log ORDER BY id') as
      { id: string, block_index: number, index: number }[]
    expect(post.map(r => Number(r.id))).to.deep.equal([...order].sort((a, b) => a - b))
    for (const row of post) {
      expect(Number(row.id)).to.equal(evmLogId(row.block_index, row.index))
    }
  })

  it("keeps every reference pointing at the same chain position", async () => {
    const order = await populate()
    const cols = await columns(context.orm)
    const before = await relationships(context.orm, cols)

    await downgradeToSequentialIds(context.orm, order)
    await context.orm.em.getConnection().execute(MIGRATION)

    const after = await relationships(context.orm, cols)
    expect(after).to.deep.equal(before)
    // the cross-event reference specifically, since that is the one the
    // migration has to follow transitively rather than straight to evm_log
    expect(after['minting_executed.collateral_reserved_evm_log_id']).to.exist
  })

  it("orders by id in chain order once migrated", async () => {
    const order = await populate()
    await downgradeToSequentialIds(context.orm, order)
    const conn = context.orm.em.getConnection()

    const scrambled = await conn.execute(
      'SELECT block_index FROM evm_log ORDER BY id') as { block_index: number }[]
    const chainOrder = [...new Set(PLAN.map(p => p[1]))].sort((a, b) => a - b)
    // the state the bug produced: id order disagrees with chain order
    expect(scrambled.map(r => r.block_index)).to.not.deep.equal(chainOrder)

    await conn.execute(MIGRATION)

    const ordered = await conn.execute(
      'SELECT block_index FROM evm_log ORDER BY id') as { block_index: number }[]
    expect(ordered.map(r => r.block_index)).to.deep.equal(chainOrder)
  })

  it("widens every id column back to bigint", async () => {
    const order = await populate()
    const cols = await columns(context.orm)
    await downgradeToSequentialIds(context.orm, order)
    const conn = context.orm.em.getConnection()

    const narrowed = await conn.execute(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = current_schema() AND data_type = 'integer'
        AND (table_name, column_name) IN (${cols.map(c => `('${c.table_name}','${c.column_name}')`).join(',')})
    `) as [{ n: number }]
    expect(narrowed[0].n).to.be.greaterThan(0)

    await conn.execute(MIGRATION)

    const stillNarrow = await conn.execute(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = current_schema() AND data_type <> 'bigint'
        AND (table_name, column_name) IN (${cols.map(c => `('${c.table_name}','${c.column_name}')`).join(',')})
    `) as [{ n: number }]
    expect(stillNarrow[0].n).to.equal(0)
  })

  it("leaves no row behind", async () => {
    const order = await populate()
    const cols = await columns(context.orm)
    const conn = context.orm.em.getConnection()
    const countRows = async () => {
      const counts: Record<string, number> = {}
      for (const { table_name } of new Map(cols.map(c => [c.table_name, c])).values()) {
        const [row] = await conn.execute(
          `SELECT count(*)::int AS n FROM "${table_name}"`) as [{ n: number }]
        counts[table_name] = row.n
      }
      return counts
    }
    const before = await countRows()

    await downgradeToSequentialIds(context.orm, order)
    await conn.execute(MIGRATION)

    expect(await countRows()).to.deep.equal(before)
    const orphans = await conn.execute(
      `SELECT count(*)::int AS n FROM ${'evm_log'} l
       WHERE l.id <> l.block_index::bigint * 1048576 + l."index"`) as [{ n: number }]
    expect(orphans[0].n).to.equal(0)
  })

  it("is a no-op when run against an already-encoded database", async () => {
    await populate()
    const cols = await columns(context.orm)
    const before = await relationships(context.orm, cols)
    await context.orm.em.getConnection().execute(MIGRATION)
    expect(await relationships(context.orm, cols)).to.deep.equal(before)
  })
})
