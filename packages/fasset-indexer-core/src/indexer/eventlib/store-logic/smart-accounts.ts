import * as Entities from '../../../orm/entities'
import { findOrCreateEntity } from '../../../orm'
import { FAssetType } from '../../../shared'
import { EVENTS } from '../../../config'
import type { EntityManager } from "@mikro-orm/knex"
import type * as MAC from '../../../../chain/typechain/smartAccount/IMasterAccountController'
import type { Event } from '../types'


export class SmartAccountsEventStorer {

  async processEvent(em: EntityManager, log: Event, evmLog: Entities.EvmLog): Promise<boolean> {
    switch (log.name) {
      case EVENTS.MASTER_ACCOUNT_CONTROLLER.PERSONAL_ACCOUNT_CREATED: {
        await this.storePersonalAccountCreated(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.AGENT_VAULT_ADDED: {
        await this.storeAgentVaultAdded(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.AGENT_VAULT_REMOVED: {
        await this.storeAgentVaultRemoved(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.APPROVED: {
        await this.storeApproved(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.CLAIMED: {
        await this.storeClaimed(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.COLLATERAL_RESERVED: {
        await this.storeCollateralReserved(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.DEFAULT_INSTRUCTION_FEE_SET: {
        await this.storeDefaultInstructionFeeSet(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.DEPOSITED: {
        await this.storeDeposited(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.EXECUTOR_FEE_SET: {
        await this.storeExecutorFeeSet(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.EXECUTOR_SET: {
        await this.storeExecutorSet(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.FXRP_REDEEMED: {
        await this.storeFxrpRedeemed(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.FXRP_TRANSFERRED: {
        await this.storeFxrpTransferred(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.INSTRUCTION_EXECUTED: {
        await this.storeInstructionExecuted(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.INSTRUCTION_FEE_REMOVED: {
        await this.storeInstructionFeeRemoved(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.INSTRUCTION_FEE_SET: {
        await this.storeInstructionFeeSet(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.OWNERSHIP_TRANSFERRED: {
        await this.storeOwnershipTransferred(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.PAYMENT_PROOF_VALIDITY_DURATION_SECONDS_SET: {
        await this.storePaymentProofValidityDurationSecondsSet(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.SWAP_EXECUTED: {
        await this.storeSwapExecuted(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.SWAP_PARAMS_SET: {
        await this.storeSwapParamsSet(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.VAULT_ADDED: {
        await this.storeVaultAdded(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.WITHDRAWAL_CLAIMED: {
        await this.storeWithdrawalClaimed(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.XRPL_PROVIDER_WALLET_ADDED: {
        await this.storeXrplProviderWalletAdded(em, evmLog, log.args)
        break
      } case EVENTS.MASTER_ACCOUNT_CONTROLLER.XRPL_PROVIDER_WALLET_REMOVED: {
        await this.storeXrplProviderWalletRemoved(em, evmLog, log.args)
        break
      } default: {
        return false
      }
    }
    return true
  }

  async storePersonalAccountCreated(em: EntityManager, log: Entities.EvmLog, args: MAC.PersonalAccountCreatedEvent.OutputTuple) {
    const [personalAccount, xrplOwner] = args
    const _address = await findOrCreateEntity(em, Entities.EvmAddress, { hex: personalAccount })
    const _xrplOwner = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: xrplOwner })
    const account = em.create(Entities.PersonalAccount, { address: _address, underlyingAddress: _xrplOwner, fasset: FAssetType.FXRP })
    return em.create(Entities.SM_PersonalAccountCreated, { fasset: FAssetType.FXRP, evmLog: log, personalAccount: account })
  }

  async storeAgentVaultAdded(em: EntityManager, log: Entities.EvmLog, args: MAC.AgentVaultAddedEvent.OutputTuple) {
    const [agentVaultId, agentVaultAddress] = args
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVaultAddress } })
    return em.create(Entities.SM_AgentVaultAdded, { fasset: FAssetType.FXRP, evmLog: log, agentVault, agentVaultId: Number(agentVaultId) })
  }

  async storeAgentVaultRemoved(em: EntityManager, log: Entities.EvmLog, args: MAC.AgentVaultRemovedEvent.OutputTuple) {
    const [agentVaultId, agentVaultAddress] = args
    const agentVault = await em.findOneOrFail(Entities.AgentVault, { address: { hex: agentVaultAddress } })
    return em.create(Entities.SM_AgentVaultRemoved, { fasset: FAssetType.FXRP, evmLog: log, agentVault, agentVaultId: Number(agentVaultId) })
  }

  async storeApproved(em: EntityManager, log: Entities.EvmLog, args: MAC.ApprovedEvent.OutputTuple) {
    const [personalAccount, fxrp, vault, amount] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    const _fxrp = await findOrCreateEntity(em, Entities.EvmAddress, { hex: fxrp })
    const _vault = await findOrCreateEntity(em, Entities.EvmAddress, { hex: vault })
    return em.create(Entities.SM_Approved, {
      fasset: FAssetType.FXRP, evmLog: log,
      personalAccount: _personalAccount,
      fxrp: _fxrp, vault: _vault, amount
    })
  }

  async storeClaimed(em: EntityManager, log: Entities.EvmLog, args: MAC.ClaimedEvent.OutputTuple) {
    const [personalAccount, vault, year, month, day, shares, amount] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    const _vault = await findOrCreateEntity(em, Entities.EvmAddress, { hex: vault })
    return em.create(Entities.SM_Claimed, {
      fasset: FAssetType.FXRP, evmLog: log, personalAccount: _personalAccount,
      vault: _vault, year: Number(year), month: Number(month), day: Number(day), shares, amount
    })
  }

  async storeCollateralReserved(em: EntityManager, log: Entities.EvmLog, args: MAC.CollateralReservedEvent.OutputTuple) {
    const [personalAccount, transactionId, paymentReference, , collateralReservationId, , , , executorFee] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    const _collateralReserved = await em.findOneOrFail(Entities.CollateralReserved,
      { fasset: FAssetType.FXRP, collateralReservationId: Number(collateralReservationId) }
    )
    return em.create(Entities.SM_CollateralReserved, {
      fasset: FAssetType.FXRP, evmLog: log,
      collateralReserved: _collateralReserved, personalAccount: _personalAccount,
      transactionId, paymentReference, executorFee
    })
  }

  async storeDefaultInstructionFeeSet(em: EntityManager, log: Entities.EvmLog, args: MAC.DefaultInstructionFeeSetEvent.OutputTuple) {
    const [defaultInstructionFee] = args
    return em.create(Entities.SM_DefaultInstructionFeeSet, { fasset: FAssetType.FXRP, evmLog: log, defaultInstructionFee })
  }

  async storeDeposited(em: EntityManager, log: Entities.EvmLog, args: MAC.DepositedEvent.OutputTuple) {
    const [personalAccount, vault, amount, shares] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    const _vault = await findOrCreateEntity(em, Entities.EvmAddress, { hex: vault })
    return em.create(Entities.SM_Deposited, {
      fasset: FAssetType.FXRP, evmLog: log,
      personalAccount: _personalAccount, vault: _vault, amount, shares
    })
  }

  async storeExecutorFeeSet(em: EntityManager, log: Entities.EvmLog, args: MAC.ExecutorFeeSetEvent.OutputTuple) {
    const [executorFee] = args
    return em.create(Entities.SM_ExecutorFeeSet, { fasset: FAssetType.FXRP, evmLog: log, executorFee })
  }

  async storeExecutorSet(em: EntityManager, log: Entities.EvmLog, args: MAC.ExecutorSetEvent.OutputTuple) {
    const [executor] = args
    const _executor = await findOrCreateEntity(em, Entities.EvmAddress, { hex: executor })
    return em.create(Entities.SM_ExecutorSet, { fasset: FAssetType.FXRP, evmLog: log, executor: _executor })
  }

  async storeFxrpRedeemed(em: EntityManager, log: Entities.EvmLog, args: MAC.FXrpRedeemedEvent.OutputTuple) {
    const [personalAccount, , , , executorFee] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    const redemptionRequested = await em.findOneOrFail(Entities.RedemptionRequested,
      { evmLog: { transaction: { hash: log.transaction.hash } } },
      { orderBy: { evmLog: { index: 'DESC' } } })
    return em.create(Entities.SM_FxrpRedeemed, {
      fasset: FAssetType.FXRP, evmLog: log, personalAccount: _personalAccount,
      redemptionRequested, executorFee
    })
  }

  async storeFxrpTransferred(em: EntityManager, log: Entities.EvmLog, args: MAC.FXrpTransferredEvent.OutputTuple) {
    const [personalAccount, ,] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    const transfer = await em.findOneOrFail(Entities.ERC20Transfer,
      { evmLog: { transaction: { hash: log.transaction.hash } } },
      { orderBy: { evmLog: { index: 'DESC' } } })
    return em.create(Entities.SM_FxrpTransferred, { fasset: FAssetType.FXRP, evmLog: log, personalAccount: _personalAccount, transfer })
  }

  async storeInstructionExecuted(em: EntityManager, log: Entities.EvmLog, args: MAC.InstructionExecutedEvent.OutputTuple) {
    const [personalAccount, transactionId, paymentReference, , instructionId] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    return em.create(Entities.SM_InstructionExecuted, {
      fasset: FAssetType.FXRP, evmLog: log, personalAccount: _personalAccount,
      transactionId, paymentReference, instructionId: Number(instructionId)
    })
  }

  async storeInstructionFeeRemoved(em: EntityManager, log: Entities.EvmLog, args: MAC.InstructionFeeRemovedEvent.OutputTuple) {
    const [instructionId] = args
    return em.create(Entities.SM_InstructionFeeRemoved, {
      fasset: FAssetType.FXRP, evmLog: log, instructionId: Number(instructionId)
    })
  }

  async storeInstructionFeeSet(em: EntityManager, log: Entities.EvmLog, args: MAC.InstructionFeeSetEvent.OutputTuple) {
    const [instructionId, instructionFee] = args
    return em.create(Entities.SM_InstructionFeeSet, {
      fasset: FAssetType.FXRP, evmLog: log, instructionFee, instructionId: Number(instructionId)
    })
  }

  async storeOwnershipTransferred(em: EntityManager, log: Entities.EvmLog, args: MAC.OwnershipTransferredEvent.OutputTuple) {
    const [previousOwner, newOwner] = args
    const _previousOwner = await findOrCreateEntity(em, Entities.EvmAddress, { hex: previousOwner })
    const _newOwner = await findOrCreateEntity(em, Entities.EvmAddress, { hex: newOwner })
    return em.create(Entities.SM_OwnershipTransferred, {
      fasset: FAssetType.FXRP, evmLog: log, previousOwner: _previousOwner, newOwner: _newOwner
    })
  }

  async storePaymentProofValidityDurationSecondsSet(
    em: EntityManager, log: Entities.EvmLog, args: MAC.PaymentProofValidityDurationSecondsSetEvent.OutputTuple
  ) {
    const [paymentProofValidityDurationSeconds] = args
    return em.create(Entities.SM_PaymentProofValidityDurationSecondsSet, {
      fasset: FAssetType.FXRP, evmLog: log,
      paymentProofValidityDurationSeconds: Number(paymentProofValidityDurationSeconds)
    })
  }

  async storeSwapExecuted(em: EntityManager, log: Entities.EvmLog, args: MAC.SwapExecutedEvent.OutputTuple) {
    const [personalAccount, tokenIn, tokenOut, xrplOwner, amountIn, amountOut] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    const _tokenIn = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenIn })
    const _tokenOut = await findOrCreateEntity(em, Entities.EvmAddress, { hex: tokenOut })
    return em.create(Entities.SM_SwapExecuted, {
      fasset: FAssetType.FXRP, evmLog: log,
      tokenIn: _tokenIn, tokenOut: _tokenOut, personalAccount: _personalAccount,
      amountIn, amountOut
    })
  }

  async storeSwapParamsSet(em: EntityManager, log: Entities.EvmLog, args: MAC.SwapParamsSetEvent.OutputTuple) {
    const [uniswapV3Router, usdt0, wNatUsdt0PoolFeeTierPPM, usdt0FXrpPoolFeeTierPPM, maxSlippagePPM] = args
    const _uniswapV3Router = await findOrCreateEntity(em, Entities.EvmAddress, { hex: uniswapV3Router })
    const _usdt0 = await findOrCreateEntity(em, Entities.EvmAddress, { hex: usdt0 })
    return em.create(Entities.SM_SwapParamsSet, {
      fasset: FAssetType.FXRP, evmLog: log,
      uniswapV3Router: _uniswapV3Router, usdt0: _usdt0,
      wNatUsdt0PoolFeeTierPPM: Number(wNatUsdt0PoolFeeTierPPM),
      usdt0FXrpPoolFeeTierPPM: Number(usdt0FXrpPoolFeeTierPPM),
      maxSlippagePPM: Number(maxSlippagePPM)
    })

  }

  async storeVaultAdded(em: EntityManager, log: Entities.EvmLog, args: MAC.VaultAddedEvent.OutputTuple) {
    const [vaultId, vaultAddress, vaultType] = args
    const _vault = await findOrCreateEntity(em, Entities.EvmAddress, { hex: vaultAddress })
    return em.create(Entities.SM_VaultAdded, {
      fasset: FAssetType.FXRP, evmLog: log,
      _vaultId: Number(vaultId), vault: _vault, vaultType: Number(vaultType)
    })
  }

  async storeWithdrawalClaimed(em: EntityManager, log: Entities.EvmLog, args: MAC.WithdrawalClaimedEvent.OutputTuple) {
    const [personalAccount, vault, period, amount] = args
    const _personalAccount = await em.findOneOrFail(Entities.PersonalAccount, { address: { hex: personalAccount } })
    const _vault = await findOrCreateEntity(em, Entities.EvmAddress, { hex: vault })
    return em.create(Entities.SM_WithdrawalClaimed, {
      fasset: FAssetType.FXRP, evmLog: log,
      vault: _vault, personalAccount: _personalAccount,
      period, amount
    })
  }

  async storeXrplProviderWalletAdded(em: EntityManager, log: Entities.EvmLog, args: MAC.XrplProviderWalletAddedEvent.OutputTuple) {
    const [xrplProviderWallet] = args
    const _xrplProviderWallet = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: xrplProviderWallet })
    return em.create(Entities.SM_ProviderWalletAdded, { fasset: FAssetType.FXRP, evmLog: log, xrplProviderWallet: _xrplProviderWallet })
  }

  async storeXrplProviderWalletRemoved(em: EntityManager, log: Entities.EvmLog, args: MAC.XrplProviderWalletRemovedEvent.OutputTuple) {
    const [xrplProviderWallet] = args
    const _xrplProviderWallet = await findOrCreateEntity(em, Entities.UnderlyingAddress, { text: xrplProviderWallet })
    return em.create(Entities.SM_ProviderWalletRemoved, { fasset: FAssetType.FXRP, evmLog: log, xrplProviderWallet: _xrplProviderWallet })
  }

}
