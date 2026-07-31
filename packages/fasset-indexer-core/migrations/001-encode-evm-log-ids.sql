-- Rewrites evm_log primary keys from an autoincrement sequence to an encoding of
-- the log's chain position, block_index * 2^20 + index, and remaps every foreign
-- key that points at them. After this, ordering by evm_log_id is ordering by
-- on-chain position, so back-indexed rows sort where they belong and a block
-- range converts to an id range arithmetically.
--
-- Run ONCE, with every indexer and the API stopped, against a database that has
-- already had the new schema applied (DB_SCHEMA_UPDATE_TYPE=full), i.e. columns
-- widened to bigint. The widening is repeated here defensively in case the
-- schema update ran in 'safe' mode and skipped it.
--
-- The whole thing is one transaction: if any guard trips, nothing changes.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 001-encode-evm-log-ids.sql
--
-- Idempotent in the sense that a second run is a no-op: the first guard sees
-- ids already equal to their encoded value and returns early.

BEGIN;

-- Serialise against other runners. Every service calls createOrm on startup, so
-- a rolling deploy can start several at once; the second waits here and then
-- finds the ids already encoded and returns. Transaction-scoped, so it is
-- released on commit or rollback without any cleanup.
SELECT pg_advisory_xact_lock(4051982001);

-- Every column holding an evm_log id, found two independent ways and unioned.
--
-- Walking the foreign-key graph catches cross-event references without relying
-- on names, but it trusts the live catalog -- and the catalog can be incomplete.
-- A database whose schema has drifted may simply be missing a constraint, and a
-- concurrent updateSchema (which runs with wrap:false) transiently drops them to
-- alter column types. Either way a column silently drops out of the rewrite, its
-- rows keep pre-migration ids, and renumbering the parent orphans them.
--
-- Matching on name covers exactly the cases the graph misses, so the union is
-- what gets rewritten and any disagreement between the two is reported.
CREATE TEMP TABLE evm_log_ref_cols ON COMMIT DROP AS
WITH RECURSIVE by_fk AS (
  SELECT 'evm_log'::regclass AS rel, 'id'::name AS col
  UNION
  SELECT con.conrelid::regclass, child.attname
  FROM pg_constraint con
  JOIN unnest(con.conkey)  WITH ORDINALITY AS k(attnum, ord)  ON true
  JOIN unnest(con.confkey) WITH ORDINALITY AS rk(attnum, ord) ON rk.ord = k.ord
  JOIN pg_attribute child  ON child.attrelid  = con.conrelid  AND child.attnum  = k.attnum
  JOIN pg_attribute parent ON parent.attrelid = con.confrelid AND parent.attnum = rk.attnum
  JOIN by_fk ON con.confrelid = by_fk.rel AND parent.attname = by_fk.col
  WHERE con.contype = 'f'
), by_name AS (
  SELECT c.table_name::text AS table_name, c.column_name::text AS column_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = current_schema()
    AND (c.column_name ~ 'evm_log_id$' OR (c.table_name = 'evm_log' AND c.column_name = 'id'))
)
SELECT table_name, column_name FROM by_name
UNION
SELECT rel::text, col::text FROM by_fk;

DO $$
DECLARE
  scale     constant bigint := 1048576;  -- 2^20; must equal EVM_LOG_INDEX_SCALE
  max_index bigint;
  min_block bigint;
  max_id    bigint;
  encoded   bigint;
  r         record;
BEGIN
  -- Bypassing foreign-key triggers below needs superuser. Fail here rather than
  -- part-way through, once the widening has already happened.
  IF NOT (SELECT usesuper FROM pg_user WHERE usename = current_user) THEN
    RAISE EXCEPTION
      'this migration must run as a superuser (current_user is %); it disables foreign-key triggers to renumber parent and children separately',
      current_user;
  END IF;

  SELECT max("index"), min(block_index), max(id)
    INTO max_index, min_block, max_id
    FROM evm_log;

  IF max_index IS NULL THEN
    RAISE NOTICE 'evm_log is empty; nothing to rewrite';
    RETURN;
  END IF;

  -- Already migrated? Then every id equals its encoding and there is nothing to do.
  SELECT count(*) INTO encoded
    FROM evm_log WHERE id <> block_index::bigint * scale + "index";
  IF encoded = 0 THEN
    RAISE NOTICE 'evm_log ids are already encoded; nothing to rewrite';
    RETURN;
  END IF;

  -- A log index at or past the scale would encode into the following block's
  -- id space and silently misorder. Raise EVM_LOG_INDEX_BITS before migrating.
  IF max_index >= scale THEN
    RAISE EXCEPTION
      'log index % reaches the encoding scale %: raise EVM_LOG_INDEX_BITS first',
      max_index, scale;
  END IF;

  -- Encoded ids must all land above every existing id. Otherwise the in-place
  -- UPDATE would transiently collide with a not-yet-rewritten row's primary key,
  -- which postgres rejects immediately for a non-deferrable unique index.
  IF min_block * scale <= max_id THEN
    RAISE EXCEPTION
      'encoded ids starting at % would overlap existing ids (max %); rewrite in two passes',
      min_block * scale, max_id;
  END IF;

  -- 1. Widen every id column to bigint. Encoded ids reach ~7e13 and do not fit
  --    in the int4 the sequence used.
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM evm_log_ref_cols c
    JOIN information_schema.columns ic
      ON ic.table_name = c.table_name
     AND ic.column_name = c.column_name
     AND ic.table_schema = current_schema()
    WHERE ic.data_type <> 'bigint'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE bigint', r.table_name, r.column_name);
  END LOOP;

  -- 2. Retire the sequence behind the old autoincrement key; ids are assigned by
  --    the indexer now. This has to happen before any row is touched, because a
  --    table with pending (deferred) trigger events cannot be altered.
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'evm_log_id_seq') THEN
    EXECUTE 'ALTER TABLE evm_log ALTER COLUMN id DROP DEFAULT';
    EXECUTE 'DROP SEQUENCE evm_log_id_seq';
  END IF;

END $$;

-- Stop foreign-key triggers from firing at all, so parent and children can be
-- renumbered in separate statements.
--
-- The obvious alternative, SET CONSTRAINTS ALL DEFERRED, does not survive
-- production volume: deferring queues an after-trigger event for every row
-- touched by every foreign key and holds them until COMMIT. At ~2M rows that
-- queue exhausted memory and the backend was killed mid-migration.
--
-- Nothing is queued or checked here, so referential integrity rests on the
-- rewrite being a consistent bijection rather than on postgres verifying it.
-- Run 001-verify.sql afterwards to confirm no reference was left dangling.
SET session_replication_role = replica;

DO $$
DECLARE
  scale constant bigint := 1048576;
  r        record;
  n        bigint;
  floor_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM evm_log) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM evm_log WHERE id <> block_index::bigint * scale + "index") THEN
    RETURN;
  END IF;

  -- old id -> new id, captured before evm_log is renumbered.
  CREATE TEMP TABLE evm_log_id_map ON COMMIT DROP AS
    SELECT id AS old_id, block_index::bigint * scale + "index" AS new_id FROM evm_log;
  CREATE UNIQUE INDEX ON evm_log_id_map (old_id);

  -- Children first, then the parent. Order is irrelevant while foreign-key
  -- triggers are off, but it keeps the intent readable.
  FOR r IN
    SELECT table_name, column_name FROM evm_log_ref_cols
    WHERE NOT (table_name = 'evm_log' AND column_name = 'id')
  LOOP
    EXECUTE format(
      'UPDATE %I t SET %I = m.new_id FROM evm_log_id_map m WHERE t.%I = m.old_id',
      r.table_name, r.column_name, r.column_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'remapped % rows in %.%', n, r.table_name, r.column_name;
  END LOOP;

  UPDATE evm_log t SET id = m.new_id FROM evm_log_id_map m WHERE t.id = m.old_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'renumbered % evm_log rows', n;

  -- Assert, before committing, that nothing was left behind. Every encoded id is
  -- at least min(block_index) * scale, so a value below that is a row this
  -- rewrite failed to reach -- which after the parent renumber is an orphan.
  --
  -- This lives inside the transaction on purpose. The first version verified
  -- only after COMMIT, which meant a column missed by discovery was detected
  -- when the damage was already permanent. Here it rolls the whole thing back.
  SELECT min(new_id) INTO floor_id FROM evm_log_id_map;
  FOR r IN
    SELECT table_name, column_name FROM evm_log_ref_cols
    WHERE NOT (table_name = 'evm_log' AND column_name = 'id')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %I IS NOT NULL AND %I < $1',
      r.table_name, r.column_name, r.column_name)
      INTO n USING floor_id;
    IF n > 0 THEN
      RAISE EXCEPTION
        'rolling back: % rows in %.% still hold pre-migration ids. The rewrite '
        'did not cover this column -- renumbering evm_log would orphan them.',
        n, r.table_name, r.column_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'all referencing columns rewritten; no row left behind';
END $$;

SET session_replication_role = origin;

COMMIT;

-- Foreign key definitions are untouched -- session_replication_role only stops
-- their triggers firing for the duration of this transaction, and is reset above.
-- Because nothing was verified while it was in effect, run 001-verify.sql before
-- starting the indexer:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 001-verify.sql
