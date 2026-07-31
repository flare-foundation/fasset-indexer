-- Confirms 001-encode-evm-log-ids.sql left the database consistent. Run it after
-- the migration and before starting the indexer.
--
-- This exists because the migration renumbers rows with foreign-key triggers
-- disabled: postgres never checked the references, so integrity rests on the
-- rewrite having been a consistent bijection. This checks that it was.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 001-verify.sql
--
-- Read-only. Raises an exception if anything is wrong, so ON_ERROR_STOP gives a
-- non-zero exit to gate a deploy on.

DO $$
DECLARE
  scale    constant bigint := 1048576;  -- must equal EVM_LOG_INDEX_SCALE
  bad_ids  bigint;
  orphans  bigint := 0;
  n        bigint;
  r        record;
BEGIN
  -- 1. every id encodes its own chain position
  SELECT count(*) INTO bad_ids
    FROM evm_log WHERE id <> block_index::bigint * scale + "index";
  IF bad_ids > 0 THEN
    RAISE EXCEPTION '% evm_log rows do not match their encoded position', bad_ids;
  END IF;
  RAISE NOTICE 'evm_log: all % rows encode their chain position',
    (SELECT count(*) FROM evm_log);

  -- 2. no reference left dangling, over the same columns the migration rewrote
  FOR r IN
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
    SELECT rel::text AS table_name, col::text AS column_name FROM cols
    WHERE NOT (rel::text = 'evm_log' AND col = 'id')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I c LEFT JOIN evm_log l ON l.id = c.%I
        WHERE c.%I IS NOT NULL AND l.id IS NULL',
      r.table_name, r.column_name, r.column_name) INTO n;
    IF n > 0 THEN
      RAISE WARNING 'dangling: % rows in %.% point at no evm_log row',
        n, r.table_name, r.column_name;
      orphans := orphans + n;
    END IF;
  END LOOP;

  IF orphans > 0 THEN
    RAISE EXCEPTION '% dangling references: restore the backup, do not start the indexer', orphans;
  END IF;
  RAISE NOTICE 'references: none dangling';

  -- 3. the sequence is gone, so nothing can hand out a colliding id
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'evm_log_id_seq') THEN
    RAISE EXCEPTION 'evm_log_id_seq still exists; the migration did not complete';
  END IF;

  RAISE NOTICE 'migration 001 verified';
END $$;
