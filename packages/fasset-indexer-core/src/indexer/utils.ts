import { EntityManager } from "@mikro-orm/knex"
import { EvmAddress } from "../orm/entities/evm/address"
import { EvmTransaction } from "../orm/entities/evm/transaction"
import { EvmBlock } from "../orm/entities/evm/block"
import { AgentVault } from "../orm/entities/agent"
import { AgentVaultInfo } from "../orm/entities/state/agent"
import { UntrackedAgentVault } from "../orm/entities/state/var"
import type { Context } from "../context/context"
import type { AgentInfo } from "../../chain/typechain/IAssetManager"
import type { AddressType } from "../orm/interface"


export async function findOrCreateEvmAddress(em: EntityManager, address: string, type: AddressType): Promise<EvmAddress> {
  let evmAddress = await em.findOne(EvmAddress, { hex: address})
  if (!evmAddress) {
    evmAddress = new EvmAddress(address, type)
    em.persist(evmAddress)
  }
  return evmAddress
}

export async function findOrCreateEvmBlock(em: EntityManager, index: number, timestamp: number): Promise<EvmBlock> {
  let block = await em.findOne(EvmBlock, { index })
  if (!block) {
    block = new EvmBlock(index, timestamp)
    // do not persist - do not store unnecessary blocks of non-processed events
    // is ok - no two blocks will be processed during one event processing
  }
  return block
}

export async function findOrCreateEvmTransaction(
  em: EntityManager, hash: string, block: EvmBlock, index: number,
  source: EvmAddress, target?: EvmAddress
): Promise<EvmTransaction> {
  let transaction = await em.findOne(EvmTransaction, { hash: hash })
  if (!transaction) {
    transaction = new EvmTransaction(hash, block, index, source, target)
    // do not persist - do not store unnecessary transactions of non-processed events
    // is ok - no two transactions will be processed during one event processing
  }
  return transaction
}

export async function isUntrackedAgentVault(em: EntityManager, address: string): Promise<boolean> {
  const untracked = await em.fork().findOne(UntrackedAgentVault, { address })
  return untracked !== null
}

export async function updateAgentVaultInfo(context: Context, em: EntityManager, assetManager: string, agentVault: string): Promise<void> {
  const contract = context.getAssetManagerContract(assetManager)
  const agentVaultInfo: AgentInfo.InfoStructOutput = await contract.getAgentInfo(agentVault)
  const agentVaultInfoEntity = await agentInfoToEntity(em, agentVaultInfo, agentVault)
  await em.upsert(agentVaultInfoEntity)
}

async function agentInfoToEntity(em: EntityManager, agentInfo: AgentInfo.InfoStructOutput, vaultAddress: string): Promise<AgentVaultInfo> {
  const agentVault = await em.findOneOrFail(AgentVault, { address: { hex: vaultAddress }})
  return new AgentVaultInfo(
    agentVault,
    Number(agentInfo.status),
    agentInfo.publiclyAvailable,
    agentInfo.freeCollateralLots,
    agentInfo.totalVaultCollateralWei,
    agentInfo.freeVaultCollateralWei,
    agentInfo.vaultCollateralRatioBIPS,
    agentInfo.totalPoolCollateralNATWei,
    agentInfo.freePoolCollateralNATWei,
    agentInfo.poolCollateralRatioBIPS,
    agentInfo.totalAgentPoolTokensWei,
    agentInfo.freeAgentPoolTokensWei,
    agentInfo.mintedUBA,
    agentInfo.reservedUBA,
    agentInfo.redeemingUBA,
    agentInfo.poolRedeemingUBA,
    agentInfo.dustUBA,
    Number(agentInfo.liquidationStartTimestamp),
    agentInfo.maxLiquidationAmountUBA,
    agentInfo.liquidationPaymentFactorPoolBIPS,
    agentInfo.liquidationPaymentFactorPoolBIPS,
    agentInfo.underlyingBalanceUBA,
    agentInfo.requiredUnderlyingBalanceUBA,
    agentInfo.freeUnderlyingBalanceUBA
  )
}