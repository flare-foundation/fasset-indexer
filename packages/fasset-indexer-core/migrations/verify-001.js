// Exercises 001-encode-evm-log-ids.sql on a miniature schema shaped like the
// real one: evm_log with a serial int4 PK, an event table keyed on evm_log_id,
// and a cross-event FK between two event tables. Checks the rewrite, foreign-key
// remapping, idempotence, and that both guards abort without touching data.
//
// Runs on a throwaway in-process postgres so it needs no database:
//
//   node packages/fasset-indexer-core/migrations/verify-001.js
//
// pglite is resolved from the api workspace, which already depends on it for its
// own integration tests.
const { createRequire } = require('module')
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../../..')
const req = createRequire(path.join(repoRoot, 'packages/fasset-indexer-api/node_modules/'))
const { PGlite } = req('@electric-sql/pglite')

const MIGRATION = fs.readFileSync(path.join(__dirname, '001-encode-evm-log-ids.sql'), 'utf8')
const VERIFY = fs.readFileSync(path.join(__dirname, '001-verify.sql'), 'utf8')
const AUDIT = fs.readFileSync(path.join(__dirname, '001-audit.sql'), 'utf8')
const SCALE = 1048576

const SCHEMA = `
CREATE TABLE evm_block (index int4 PRIMARY KEY, timestamp int4 NOT NULL);
CREATE TABLE evm_log (
  id serial PRIMARY KEY,
  index int4 NOT NULL,
  name text NOT NULL,
  block_index int4 NOT NULL REFERENCES evm_block(index)
);
CREATE UNIQUE INDEX evm_log_block_idx ON evm_log(block_index, index);
CREATE TABLE redemption_requested (
  evm_log_id int4 PRIMARY KEY REFERENCES evm_log(id),
  value_uba numeric NOT NULL
);
CREATE TABLE redemption_default (
  evm_log_id int4 PRIMARY KEY REFERENCES evm_log(id),
  redemption_requested_evm_log_id int4 NOT NULL REFERENCES redemption_requested(evm_log_id)
);
`

const SEED = `
INSERT INTO evm_block VALUES (1000, 1), (2000, 2), (3000, 3);
INSERT INTO evm_log (index, name, block_index) VALUES
  (5, 'RedemptionRequested', 1000),
  (0, 'RedemptionRequested', 2000),
  (2, 'RedemptionDefault',   3000);
INSERT INTO redemption_requested VALUES (1, 111), (2, 222);
INSERT INTO redemption_default VALUES (3, 1);
`

let failures = 0
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { console.log('  ok   ' + label) }
  else { failures++; console.log('  FAIL ' + label + '\n         got ' + a + '\n         want ' + e) }
}

;(async () => {
  const db = await PGlite.create()
  await db.exec(SCHEMA)
  await db.exec(SEED)

  console.log('migration run 1')
  await db.exec(MIGRATION)

  const logs = await db.query('SELECT id, block_index, index FROM evm_log ORDER BY id')
  check('evm_log ids encode position', logs.rows.map(r => Number(r.id)), [
    1000 * SCALE + 5, 2000 * SCALE + 0, 3000 * SCALE + 2])
  check('id order equals block order', logs.rows.map(r => r.block_index), [1000, 2000, 3000])

  const rr = await db.query('SELECT evm_log_id FROM redemption_requested ORDER BY evm_log_id')
  check('child fk remapped', rr.rows.map(r => Number(r.evm_log_id)),
    [1000 * SCALE + 5, 2000 * SCALE + 0])

  const rd = await db.query('SELECT evm_log_id, redemption_requested_evm_log_id FROM redemption_default')
  check('cross-event fk remapped', rd.rows.map(r => [Number(r.evm_log_id), Number(r.redemption_requested_evm_log_id)]),
    [[3000 * SCALE + 2, 1000 * SCALE + 5]])

  const types = await db.query(`SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE column_name LIKE '%evm_log_id' OR (table_name='evm_log' AND column_name='id') ORDER BY table_name, column_name`)
  check('columns widened to bigint', [...new Set(types.rows.map(r => r.data_type))], ['bigint'])

  // referential integrity actually survived (deferred checks ran at commit)
  const orphans = await db.query(`SELECT count(*)::int AS n FROM redemption_requested r
    LEFT JOIN evm_log l ON l.id = r.evm_log_id WHERE l.id IS NULL`)
  check('no orphaned children', orphans.rows[0].n, 0)

  const seq = await db.query(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND relname='evm_log_id_seq'`)
  check('autoincrement sequence dropped', seq.rows[0].n, 0)

  console.log('migration run 2 (idempotence)')
  await db.exec(MIGRATION)
  const again = await db.query('SELECT id FROM evm_log ORDER BY id')
  check('second run is a no-op', again.rows.map(r => Number(r.id)), [
    1000 * SCALE + 5, 2000 * SCALE + 0, 3000 * SCALE + 2])

  console.log('001-verify.sql')
  let verifyErr = null
  try { await db.exec(VERIFY) } catch (e) { verifyErr = String(e.message || e); await db.exec('ROLLBACK') }
  check('passes on a correctly migrated database', verifyErr, null)

  console.log('001-audit.sql')
  let auditErr = null
  try { await db.exec(AUDIT) } catch (e) { auditErr = String(e.message || e); await db.exec('ROLLBACK') }
  check('passes on a correctly migrated database', auditErr, null)

  // Both corruption tests below leave the database broken, so they run last and
  // in this order: the dangling one first, then the shuffle.
  //
  // and it has to actually detect a broken one, or it is worth nothing.
  // Foreign keys are bypassed the same way the migration bypasses them.
  await db.exec(`SET session_replication_role = replica;
                 UPDATE redemption_requested SET evm_log_id = 999999999
                  WHERE evm_log_id = (SELECT min(evm_log_id) FROM redemption_requested);
                 SET session_replication_role = origin;`)
  let brokenErr = null
  try { await db.exec(VERIFY) } catch (e) { brokenErr = String(e.message || e); await db.exec('ROLLBACK') }
  check('detects a dangling reference', /dangling references/.test(brokenErr || ''), true)

  // A shuffle -- every reference still resolving, but to the wrong event -- is
  // what the audit exists to catch and 001-verify.sql cannot see. Swap two logs'
  // positions so all ids stay valid while the rows now describe each other.
  await db.exec(`SET session_replication_role = replica;
                 UPDATE evm_log SET id = -id;
                 UPDATE evm_log SET id = (CASE
                   WHEN -id = ${1000 * SCALE + 5} THEN ${3000 * SCALE + 2}
                   WHEN -id = ${3000 * SCALE + 2} THEN ${1000 * SCALE + 5}
                   ELSE -id END);
                 SET session_replication_role = origin;`)
  let shuffleErr = null
  try { await db.exec(AUDIT) } catch (e) { shuffleErr = String(e.message || e); await db.exec('ROLLBACK') }
  check('detects logs shuffled out of position', /do not encode their own position/.test(shuffleErr || ''), true)

  // guard: a log index at the scale must abort the whole migration
  console.log('guard: log index at scale')
  const db2 = await PGlite.create()
  await db2.exec(SCHEMA)
  await db2.exec(`INSERT INTO evm_block VALUES (1000, 1);
                  INSERT INTO evm_log (index, name, block_index) VALUES (${SCALE}, 'X', 1000);`)
  let threw = null
  try { await db2.exec(MIGRATION) } catch (e) { threw = String(e.message || e) }
  // the raise aborts the transaction; close it before inspecting
  await db2.exec('ROLLBACK')
  check('aborts on oversized log index', /reaches the encoding scale/.test(threw || ''), true)
  const untouched = await db2.query('SELECT id FROM evm_log')
  check('rolled back, ids untouched', untouched.rows.map(r => Number(r.id)), [1])

  // guard: encoded ids must not overlap existing ids
  console.log('guard: encoded range overlaps existing ids')
  const db3 = await PGlite.create()
  await db3.exec(SCHEMA)
  await db3.exec(`INSERT INTO evm_block VALUES (1, 1);
                  INSERT INTO evm_log (index, name, block_index) VALUES (0, 'X', 1);
                  SELECT setval('evm_log_id_seq', 5000000);
                  INSERT INTO evm_block VALUES (2, 2);
                  INSERT INTO evm_log (index, name, block_index) VALUES (0, 'Y', 2);`)
  let threw3 = null
  try { await db3.exec(MIGRATION) } catch (e) { threw3 = String(e.message || e) }
  await db3.exec('ROLLBACK')
  check('aborts on overlapping id range', /would overlap existing ids/.test(threw3 || ''), true)

  console.log(failures === 0 ? '\nALL MIGRATION CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
