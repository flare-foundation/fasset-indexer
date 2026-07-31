-- Independent cross-checks that the id remap preserved meaning, not just shape.
--
-- 001-verify.sql proves ids are well-formed and every reference resolves. It
-- cannot tell whether a reference still points at the *same* event: a remap that
-- shuffled rows between tables would satisfy it. These checks are derived from
-- the data rather than from the migration's own logic, so they fail on that.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 001-audit.sql
--
-- Read-only. Reports rather than raises, except for the two structural checks
-- that cannot legitimately fail.

DO $$
DECLARE
  scale constant bigint := 1048576;
  r      record;
  n      bigint;
  names  text;
  mixed  int := 0;
BEGIN
  -- 1. Every id encodes its own chain position.
  SELECT count(*) INTO n FROM evm_log WHERE id <> block_index::bigint * scale + "index";
  IF n > 0 THEN
    RAISE EXCEPTION '% evm_log rows do not encode their own position', n;
  END IF;
  RAISE NOTICE 'ids encode position: ok (% rows)', (SELECT count(*) FROM evm_log);

  -- 2. The encoding must be injective: no two logs may share a chain position.
  SELECT count(*) INTO n FROM (
    SELECT 1 FROM evm_log GROUP BY block_index, "index" HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION '% duplicated (block_index, index) pairs', n;
  END IF;
  RAISE NOTICE 'positions unique: ok';

  -- 3. Ordering by id must equal ordering by chain position. Implied by 1 and 2,
  --    but this is the property the whole change exists for, so assert it.
  SELECT count(*) INTO n FROM (
    SELECT id, block_index, "index",
           row_number() OVER (ORDER BY id)                        AS by_id,
           row_number() OVER (ORDER BY block_index, "index")      AS by_pos
    FROM evm_log
  ) o WHERE by_id <> by_pos;
  IF n > 0 THEN
    RAISE EXCEPTION 'id order disagrees with chain order for % rows', n;
  END IF;
  RAISE NOTICE 'id order equals chain order: ok';

  -- 4. Each referencing column names one event type. Every column here means one
  --    thing -- an event table's own log, or a reference to one specific other
  --    event -- so the set of evm_log.name values it points at should be a
  --    single value. Rows shuffled between tables show up as several.
  --
  --    Reported, not raised: a table fed by more than one event name (an event
  --    renamed across contract versions, say) is legitimate. Eyeball anything
  --    listed and confirm the names belong together.
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
    ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'SELECT count(DISTINCT l.name), string_agg(DISTINCT l.name, '', '')
         FROM %I t JOIN evm_log l ON l.id = t.%I', r.table_name, r.column_name)
      INTO n, names;
    IF n > 1 THEN
      RAISE WARNING 'mixed: %.% points at % event names: %',
        r.table_name, r.column_name, n, names;
      mixed := mixed + 1;
    END IF;
  END LOOP;
  IF mixed = 0 THEN
    RAISE NOTICE 'every reference points at a single event name: ok';
  ELSE
    RAISE NOTICE '% column(s) reference more than one event name -- check the names above', mixed;
  END IF;
END $$;

-- 5. Row counts, to compare against what the migration reported remapping.
--    A table that lost rows shows up here and nowhere else.
SELECT c.relname AS table_name, c.reltuples::bigint AS approx_rows
FROM pg_class c
JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE ns.nspname = current_schema() AND c.relkind = 'r'
  AND c.reltuples > 0
ORDER BY c.reltuples DESC
LIMIT 25;
