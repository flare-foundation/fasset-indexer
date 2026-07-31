# FAsset Indexer

This is an implementation for indexing the FAsset protocol smart contract operations. The FAsset smart contracts operate in a way that most of the state can be collected from emmited events. This repo consists of multiple workspaces:

1. **FAsset Indexer Core**: scrapes the chain for events and stores them in a database, optimized for FAsset analytics.
1. **FAsset Indexer XRP**: scrapes the Ripple chain (testnet or mainnet) for transactions relating to the FAsset system.
1. **FAsset Indexer Api**: nestjs based API to query the indexed data.

If running outside docker, initialize the project by running `yarn install`.

## FAsset Indexer Core

Needs the following environment variables:

- **CHAIN**: needs to be set to either `coston`, `coston2`, `songbird`, or `flare`;
- **DEPLOYMENT** (optional): named deployment variant under `chain/`. When set, the indexer loads `chain/${CHAIN}-${DEPLOYMENT}.json` (e.g. `coston2-qa`, `coston2-staging`). Defaults to `chain/${CHAIN}.json`. Ignored when `ADDRESSES_JSON` is set;
- **RPC_URL**: needs be set to the rpc of the matching chain;
- **RPC_API_KEY**: should be set to the `x-apikey` or `x-api-key` header value accepted by the rpc;
- **DB_TYPE**: needs to be set to either `sqlite` or `postgres`;
- **DB_PORT**: needs to be set for non-sqlite database type;
- **DB_HOST**: needs to be set for non-sqlite database type;
- **DB_USER**: needs to be set for non-sqlite database type;
- **DB_PASSWORD**: needs to be set for non-sqlite database type.
- **DB_SCHEMA_UPDATE_TYPE**: should be set to `full` after a major update, otherwise should be set to `safe`. It reconciles the schema with the entity definitions and never rewrites data;
- **RUN_DATA_MIGRATIONS**: set to `true` for one start to apply outstanding data migrations under `migrations/`, then unset. Separate from the above on purpose — see [schema migrations](#schema-migrations).

If new events want to be added to tracking without stopping the indexer, you should set:

- **REINDEX_TYPE**: should be set to either `back` or `race`:
    -  Back indexer spawns two indexers, one indexing missing events from the beginning to the block last indexed by the previous indexer instance. The second indexer indexes all (including new) events from the previous.
    - Race indexer spawns three indexers. First indexes missing events from the beginning, racing with the second indexer that indexes non-new events. When the first indexer catches the second one, the third indexes takes over indexing all events. This is required due to cross-event dependencies (e.g. redemption performed has a redemption requested foreign key).
- **REINDEX_DIFF**: list of new event names;
- **REINDEX_NAME**: a unique name of the specific reindexing process;
- **REINDEX_START_BLOCK** (optional): block number from which the back/race indexer starts back-population when there is no prior progress recorded for this `REINDEX_NAME`. Defaults to the chain's `minEvmBlockNumber` DB var.

Additional optional dev settings:
- **CONFIG_PATH**: should be set to a json file containing a list of indexed event names, see `./configs/everything.json`;
- **ADDRESSES_JSON**: path to file with the FAsset deployment contracts (when indexing non-official test deployments);
- **MIN_BLOCK_NUMBER**: the block number that the indexer will start with. If empty, it is set to the block at which the FAsset contracts were deployed. Other values can lead to errors due to event gaps.

To run the indexer, run `yarn run-indexer`.

Note that the repo also features a watchdog, which keeps track of prices and registered agent's info on chain. To run the watchdog, run `yarn run-watchdog`.

## FAsset Indexer Xrp

Needs the environment variables to establish database connection from the [core section](#fasset-indexer-core) and the following rpc configuration:

- **XRP_RPC_URL**: needs to be set to the rpc of the indexed Ripple node;
- **XRP_RPC_API_KEY**: should be set to the api key of the indexed Ripple node rpc (not yet implemented);
- **XRP_MIN_BLOCK_NUMBER**: needs to be set to the first indexed Ripple ledger index;
- **XRP_RPC_AMENDMENT_BLOCKED**: needs to be set to `true` if the indexed node doesn't sync full history;

Run with `yarn run-xrp-indexer`.

## FAsset Indexer Api

Needs the environment variables to establish database connection from the [core section](#fasset-indexer-core) and the following API configuration:

- **API_PORT**: needs to be set to the served port;
- **API_ROOT_PATH**: should be set to a chosen prefix path of the served api.

For dev purposes you can also set **ADDRESSES_JSON** if using non-official FAsset deployment, or **DEPLOYMENT** to load a named variant under `chain/` (matching the value used by the indexer).

To run the API, run `yarn run-api`.

## Schema migrations

One-off SQL migrations live in `packages/fasset-indexer-core/migrations/` and are
run manually; `DB_SCHEMA_UPDATE_TYPE` only reconciles the schema with the entity
definitions, it does not rewrite data.

**001-encode-evm-log-ids** must be run against any database indexed before evm
log ids became position-encoded. `evm_log.id` is no longer an autoincrement
sequence: it is `block_index * 2^20 + index`, so ordering by id is ordering by
on-chain position and a block range converts to an id range arithmetically. This
is what keeps back-indexed events sorted where they belong instead of at the top
of the list with a fresh high id.

### Applying them on deploy

Migrations apply themselves on startup when **`RUN_DATA_MIGRATIONS=true`**, so a
deployment nobody can shell into is migrated by setting that variable and rolling
the image. Unset it again afterwards.

This is deliberately **not** tied to `DB_SCHEMA_UPDATE_TYPE`. Reconciling the
schema with the entities and rewriting millions of rows are different operations
with different blast radii; coupling them meant a routine entity change needing
`full` would silently drag a full data rewrite along with it.

Only the indexers honour the switch. The api passes it as off, so a read-only
service can never rewrite data by accident.

Migrations run after the schema is reconciled and before anything is indexed,
each inside its own transaction under an advisory lock, so a rolling start of
several services queues rather than collides. A migration is recorded in `var`
only once its `NNN-verify.sql` has passed, so a failed verification leaves it
pending rather than silently marked done.

With anything outstanding and the switch off, startup fails rather than
proceeding. The id encoding is a hard cutover, and an indexer writing encoded ids
into an unmigrated database produces exactly the mixed ordering the encoding
exists to prevent. The error names the migrations it is waiting on. The one
exception is `DB_SCHEMA_UPDATE_TYPE=recreate`, which builds the schema empty —
the migrations are no-ops there but still get recorded.

### Applying them by hand

If you do have shell access and would rather run it yourself, the migration is
plain SQL and safe to apply directly — it is the same file, and applying it this
way still lets the runner record it afterwards. Do it **before** deploying the
new code, not after: the migration widens the id columns itself, so it does not
need a schema update first, and deploying first would start the new indexer
against a database it cannot write correctly.

1. Stop every writer, naming the services explicitly. `db-postgres` belongs to
   all five profiles, so a profile-wide `stop` takes the database down with them:

   ```
   docker compose --profile core --profile watchdog --profile ripple --profile dogecoin \
     stop core watchdog ripple dogecoin
   ```

   The profile flags only bring those services into the model; the trailing list
   is what limits what gets stopped. `docker compose ps` should leave
   `db-postgres` as the only service still up. Add `api` to the list if you would
   rather it not serve mid-rewrite.
2. Take a backup. This is the only rollback path: there is no inverse migration,
   and once the migration commits the old code can no longer insert, because the
   sequence it relied on is gone.
3. Check the preconditions (see below), then apply:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f packages/fasset-indexer-core/migrations/001-encode-evm-log-ids.sql
```

4. Verify, before starting anything. The migration renumbers with foreign-key
   triggers disabled, so postgres never checked the references and this is what
   confirms they survived:

   ```
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f packages/fasset-indexer-core/migrations/001-verify.sql
   ```

5. Deploy the new image with `DB_SCHEMA_UPDATE_TYPE=full` **and**
   `RUN_DATA_MIGRATIONS=true` once, then unset both. `full` picks up the entity
   changes the migration does not cover; `RUN_DATA_MIGRATIONS` lets the runner
   record what you just applied by hand — it finds the work already done and
   writes the marker. Without it, startup refuses on a migration it can see is
   outstanding.
6. `VACUUM ANALYZE` — the rewrite leaves a dead row version for every row it
   touched.

The migration must run as a superuser: it sets `session_replication_role` to stop
foreign-key triggers firing, because parent and children cannot be renumbered in
one statement. Deferring the constraints instead does not survive production
volume — deferral queues an after-trigger event per touched row and holds them
until COMMIT, which at ~2M rows exhausts memory and the backend is killed.

It is a single transaction that refuses to proceed if any existing log index has
reached `EVM_LOG_INDEX_SCALE`, or if the encoded ids would overlap ids already in
use. A second run is a no-op. Preconditions can be checked without committing to
anything:

```sql
SELECT count(*)                                        AS rows,
       max("index")                                    AS max_log_index,
       max("index") < 1048576                          AS scale_sufficient,
       min(block_index)::bigint * 1048576 > max(id)    AS range_clear
FROM evm_log;
```

Because every referencing row is updated, the rewrite roughly doubles the space
those tables occupy until vacuumed; check free space first. Raise
`statement_timeout` and `idle_in_transaction_session_timeout` for the session
rather than letting a long run be killed part-way.

`node packages/fasset-indexer-core/migrations/verify-001.js` exercises the
migration on a throwaway in-process postgres, and
`packages/fasset-indexer-core/test/migration-001.test.ts` runs it against the
real entity schema. Neither tells you how long it takes on production volume —
rehearse on a restored snapshot to size the maintenance window.

## Tests

The suites run against postgres rather than an ephemeral sqlite file, so that they
exercise the same engine and type checking as production. The devcontainer
(`.devcontainer/compose.yaml`) starts one and points the tests at it; no setup is
needed beyond opening the workspace in it.

Run `yarn test` from `packages/fasset-indexer-core` or `packages/fasset-indexer-api`.

Outside the devcontainer, either start a postgres yourself and override the
defaults (`fasset:fasset@localhost:5432/fasset_indexer_test`) via **TEST_DB_HOST**,
**TEST_DB_PORT**, **TEST_DB_NAME**, **TEST_DB_USER**, **TEST_DB_PASSWORD**, or
bring up just the database with
`docker compose -f .devcontainer/compose.yaml up db`.

The core suite creates its schema once and truncates between tests, so it needs a
database it can own — point it at a throwaway one, never at an indexed database.

## Docker Deployment

A local docker image can be either built from this repository, or one from github can be utilised. The repository also includes the `compose.yaml` file that features a local postgres deployment and requires the following `.env` config:

- **COMPOSE_PROJECT_NAME**: needs to be set to a unique name of your docker deployment;
- **COMPOSE_PROFILES**: needs to be a list of options `core`, `api`, `ripple`, `watchdog`;
- **CI_REGISTRY_IMAGE**: needs to be set to the image path, e.g. `ghcr.io/flare-foundation/fasset-indexer`;
- **DEPLOY_IMAGE_TAG**: needs to be set to the image tag, e.g. `latest`;
- **POSTGRES_DB**: name of the dockerized postgres database;
- **POSTGRES_USER**: default user of the dockerized postgres database;
- **POSTGRES_PASSWORD**: password of the dockerized postgres database default user.

The docker compose will also pick up on any `.env` variables specified previously (except those pertaining to establishing the database connection).