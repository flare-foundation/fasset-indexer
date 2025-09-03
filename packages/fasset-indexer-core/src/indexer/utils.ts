import { EntityManager } from "@mikro-orm/knex"
import { AgentVault } from "../orm/entities/agent"
import { AgentVaultInfo } from "../orm/entities/state/agent"
import { UntrackedAgentVault } from "../orm/entities/state/var"
import type { Context } from "../context/context"
import type { AgentInfo } from "../../chain/typechain/assetManager/IAssetManager__latest"


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
  return em.create(AgentVaultInfo, {
    agentVault,
    status: Number(agentInfo.status),
    publiclyAvailable: agentInfo.publiclyAvailable,
    freeCollateralLots: agentInfo.freeCollateralLots,
    totalVaultCollateralWei: agentInfo.totalVaultCollateralWei,
    freeVaultCollateralWei: agentInfo.freeVaultCollateralWei,
    vaultCollateralRatioBIPS: agentInfo.vaultCollateralRatioBIPS,
    totalPoolCollateralNATWei: agentInfo.totalPoolCollateralNATWei,
    freePoolCollateralNATWei: agentInfo.freePoolCollateralNATWei,
    poolCollateralRatioBIPS: agentInfo.poolCollateralRatioBIPS,
    totalAgentPoolTokensWei: agentInfo.totalAgentPoolTokensWei,
    freeAgentPoolTokensWei: agentInfo.freeAgentPoolTokensWei,
    mintedUBA: agentInfo.mintedUBA,
    reservedUBA: agentInfo.reservedUBA,
    redeemingUBA: agentInfo.redeemingUBA,
    poolRedeemingUBA: agentInfo.poolRedeemingUBA,
    dustUBA: agentInfo.dustUBA,
    liquidationStartTimestamp: Number(agentInfo.liquidationStartTimestamp),
    maxLiquidationAmountUBA: agentInfo.maxLiquidationAmountUBA,
    liquidationPaymentFactorPoolBIPS: agentInfo.liquidationPaymentFactorPoolBIPS,
    liquidationPaymentFactorVaultBIPS: agentInfo.liquidationPaymentFactorVaultBIPS,
    underlyingBalanceUBA: agentInfo.underlyingBalanceUBA,
    requiredUnderlyingBalanceUBA: agentInfo.requiredUnderlyingBalanceUBA,
    freeUnderlyingBalanceUBA: agentInfo.freeUnderlyingBalanceUBA
  })
}