
import { getVar, setVar } from "../utils"
import { Context } from "../context/context"
import { backUpdateLastBlockName, backUpdateFirstUnhandledBlockName, BLOCK_EXPLORERS, MIN_EVM_BLOCK_NUMBER_DB_KEY } from "../config/constants"
import type { JsonRpcApiProvider } from "ethers"


export async function ensureConfigIntegrity(context: Context, updateName?: string): Promise<void> {
  await ensureChainIntegrity(context)
  await ensureDatabaseIntegrity(context)
  if (updateName != null) {
    await ensureBackIndexerDatabaseIntegrity(context, updateName)
  }
}

export async function ensureChainIntegrity(context: Context): Promise<void> {
  const amc = context.getContractAddress('AssetManagerController')
  const contract = await context.provider.getCode(amc)
  if (contract === '0x') {
    throw new Error(`AssetManagerController contract ${amc} does not exist on rpc ${context.config.rpc.url}`)
  }
}

export async function ensureDatabaseIntegrity(context: Context): Promise<void> {
  const em = context.orm.em.fork()
  const dbchain = await getVar(em, 'chain')
  if (dbchain == null) {
    return await markNewDatabase(context)
  }
  // check chain
  if (dbchain.value !== context.config.chain) {
    throw new Error(`Database chain ${dbchain.value} does not match config chain ${context.config.chain}`)
  }
  // check asset manager controller
  const dbamc = await getVar(em, 'asset_manager_controller')
  const cfamc = context.getContractAddress('AssetManagerController')
  if (dbamc != null && dbamc.value !== cfamc) {
    throw new Error(`AssetManagerController contract addresses in database ${dbamc.value} does not match ${cfamc} from address file`)
  }
  // check min block number
  const minblock = await getVar(em, MIN_EVM_BLOCK_NUMBER_DB_KEY)
  if (minblock == null) {
    throw new Error(`Database missing minimum block number field '${MIN_EVM_BLOCK_NUMBER_DB_KEY}'`)
  }
}

export async function ensureBackIndexerDatabaseIntegrity(context: Context, updateName?: string): Promise<void> {
  const em = context.orm.em.fork()
  const currentUpdate = await getVar(em, 'current_update')
  if (currentUpdate !== null && currentUpdate.value !== updateName) {
    const currentUpdateName = currentUpdate.value!
    const lastBlock = await getVar(em, backUpdateFirstUnhandledBlockName(currentUpdateName))
    const endBlock = await getVar(em, backUpdateLastBlockName(currentUpdateName))
    if (endBlock == null || lastBlock == null) {
      throw new Error(`Database missing end block or last block for current update "${currentUpdateName}"`)
    }
    const lastBlockNum = parseInt(lastBlock.value!)
    const endBlockNum = parseInt(endBlock.value!)
    if (lastBlockNum <= endBlockNum) {
      throw new Error(`Update "${currentUpdateName}" has not finished processing all blocks, ${endBlockNum - lastBlockNum + 1} to go`)
    }
  } else if (currentUpdate === null) {
    await setVar(em, 'current_update', updateName)
  }
}

async function markNewDatabase(context: Context): Promise<void> {
  const envchain = context.config.chain
  const amc = context.getContractAddress('AssetManagerController')
  let minblock = context.config.minBlockNum ?? null
  if (minblock == null) {
    minblock = await getContractCreationBlock(context.provider, amc, envchain)
  }
  if (minblock == null) {
    throw new Error(`Could not find min block number in .env or the creation block for AssetManagerController ${amc} on block explorer api`)
  }
  await context.orm.em.transactional(async em => {
    await setVar(em, 'chain', envchain)
    await setVar(em, 'asset_manager_controller', amc)
    // @ts-ignore - not sure why compiler thinks minblock can be null
    await setVar(em, MIN_EVM_BLOCK_NUMBER_DB_KEY, minblock.toString())
  })
}

async function getContractCreationBlock(provider: JsonRpcApiProvider, address: string, chain: string): Promise<number | null> {
  const blockExplorer = BLOCK_EXPLORERS[chain as keyof typeof BLOCK_EXPLORERS]
  if (blockExplorer == null) return null
  const resp = await fetch(`${blockExplorer}/api/v2/addresses/${address}`)
  const json = await resp.json()
  const hash = json.creation_tx_hash
  const creation = await provider.getTransaction(hash)
  return creation?.blockNumber ?? null
}