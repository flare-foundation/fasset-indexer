# FAsset Indexer

This is an implementation for indexing the FAsset protocol smart contract operations. The FAsset smart contracts operate in a way that most of the state can be collected from emmited events. This repo consists of multiple workspaces:

1. FAsset Indexer Core: scrapes the chain (currently Coston) for events and stores them in a database, optimized for FAsset analytics.
1. FAsset Indexer XRP: scrapes the Ripple chain (testnet or mainnet) for transactions relating to the FAsset system.
1. FAsset Indexer Api: nestjs based API to query the indexed data.

Initialize the project by running `yarn install`.

## FAsset Indexer Core

Needs the following environment variables:

- **CHAIN**: needs to be set to either `coston`, `coston2`, `songbird`, or `flare`;
- **RPC_URL**: needs be set to the rpc of the matching chain;
- **RPC_API_KEY**: should be set to the `x-apikey` or `x-api-key` header value accepted by the rpc url;
- **DB_TYPE**: needs to be set to either `sqlite` or `postgres`;
- **DB_PORT**: needs to be set for non-sqlite database type;
- **DB_HOST**: needs to be set for non-sqlite database type;
- **DB_USER**: needs to be set for non-sqlite database type;
- **DB_PASSWORD**: needs to be set for non-sqlite database type.
- **DB_SCHEMA_UPDATE_TYPE**: should be set to `full` after a major update, otherwise should be set to `safe`.

If new event want to be added to tracking without stopping the indexer, you should set:

- **REINDEX_TYPE**: should be set to either `back` or `race`:
    -  Back indexer spawns two indexers, one indexing missing events from the beginning to the block last indexed by the previous indexer instance. The second indexer indexes all (including new) events from the previous.
    - Race indexer spawns three indexers. First indexes missing events from the beginning, racing with the second indexer that indexes non-new events. When the first indexer catches the second one, the third indexes takes over indexing all events. This is required due to cross-event dependencies (e.g. redemption performed has a redemption requested foreign key).
- **REINDEX_DIFF**: list of new event names;
- **REINDEX_NAME**: a unique name of the specific reindexing process.

Additional optional dev settings:
- **CONFIG_PATH**: should be set to a json file containing a list of indexed event names, see `./configs/everything.json`;
- **ADDRESSES_JSON**: path to file with the FAsset deployment contracts (when indexing non-official test deployments);
- **LOG_QUERY_BATCH_SIZE**: the size of the log batch requested by indexer to the rpc node (should be strictly less than 30);
- **MIN_BLOCK_NUMBER**: the block number that the indexer will start with. If empty, it is set to the block at which the FAsset contracts were deployed. Other values can lead to errors due to event gaps.

To run the indexer, run `yarn run-indexer`.

Note that the repo also features a watchdog, which keeps track of prices and registered agent's info on chain. To run the watchdog, run `yarn run-watchdog`.

## FAsset Indexer Xrp

Needs the environment variables to establish database connection from [the previous section](#fasset-indexer-core) and the following API configuration:

- **XRP_RPC_URL**: needs to be set to the rpc of the indexed Ripple node;
- **XRP_RPC_API_KEY**: should be set to the api key of the indexed Ripple node rpc (not yet implemented);
- **XRP_MIN_BLOCK_NUMBER**: needs to be set to the first indexed Ripple ledger index;
- **XRP_RPC_AMENDMENT_BLOCKED**: needs to be set to `true` if the indexed node doesn't sync full history;

Run with `yarn run-xrp-indexer`.

## FAsset Indexer Api

Needs the environment variables to establish database connection from [the previous section](#fasset-indexer-core) and the following API configuration:

- **API_PORT**: needs to be set to the served port;
- **API_ROOT_PATH**: should be set to a chosen prefix path of the served api.

For dev purposses you can also set **ADDRESSES_JSON** if using non-official FAsset deployment.

To run the API, run `yarn run-api`.

## Docker Deployment

POSTGRES_DB=fasset-indexer
POSTGRES_USER=indexer
POSTGRES_PASSWORD=supersecretpassword

The docker image can be either built from this project, or one from github can be used. The repository also features the `compose.yaml` file that features a local postgres deployment and requires the following `.env` config:

- **COMPOSE_PROJECT_NAME**: needs to be set to a unique name of your docker deployment;
- **COMPOSE_PROFILES**: needs to be a list of options `core`, `api`, `ripple`, `watchdog`;
- **CI_REGISTRY_IMAGE**: needs to be set to the image path, e.g. `ghcr.io/flare-foundation/fasset-indexer`;
- **DEPLOY_IMAGE_TAG**: needs to be set to the image tag, e.g. `latest`;
- **POSTGRES_DB**: name of the dockerized postgres database;
- **POSTGRES_USER**: default user of the dockerized postgres database;
- **POSTGRES_PASSWORD**: password of the dockerized postgres database default user.

The docker compose will also pick up on any `.env` variables specified previously (except those pertaining to establishing the database connection).